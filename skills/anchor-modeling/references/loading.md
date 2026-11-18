# Loading data

**Loads are incremental and idempotent.** An Anchor model keeps history by appending rows. A recurring load never truncates: it inserts only what is new or changed, so running it twice with the same data changes nothing. Truncating and reloading from a source that holds only current values destroys the history.

Say which of the two routes the user's database takes (`targets.md`), and keep to it.

## Route A: through the latest views (SQL Server, PostgreSQL, Oracle)

The latest views of anchors, nexuses and ties have triggers, so a load is plain `INSERT`, `UPDATE` and `DELETE` against `l{AN}_{Desc}`. Every statement is turned into new rows:

- An **insert** states each value given, valid from its changing time or from now if none is given. A new anchor gets its id from the generator (sequence or identity) when none is given.
- An **update** states only what it changes. A value set to what it already is states nothing (PostgreSQL decides this from the value alone, SQL Server also from the `SET` list). A new value is a new version from the changing time given, or from now.
- A **static** attribute or tie takes a value once; another value is an error (a contradiction) in uni, and a correction in bi and crt.
- **Null** retracts the shown version in bi and crt; in uni it does nothing, except for a deletable attribute whose deletable column is set in the same update, which moves the history to a deletion table.
- A **delete** retracts (bi, crt) or removes (uni) the shown versions.

In **Oracle** the latest views have `INSTEAD OF` triggers that run a row at a time, and the rules of an attribute or a tie (contradiction, restatement, idempotency, retraction) are in procedures `ip_<attribute>` and `ip_<tie>` that the triggers call and a load can call too (named parameters; the signature is in a comment at the top of the file that makes them). A row put straight into an attribute table with `INSERT` is not looked at, so load through the views or the procedures, or use route B's filters.

Resolve source rows to identities using the agreed match (`identity-and-keys.md`). A static identifier attribute is the simplest case: insert missing anchors with their identifiers, then join the other source facts to that mapping. The triggers' rules are in the Anchor repository, `docs/ANCHOR.md`, *Loading through the latest views*. In PostgreSQL, a statement that sets a changing time to what it already is must be an insert into the assembled view of the attribute or tie instead of an update. Do not assume the trigger is a backfill plan: verify how it handles late versions and restatements before using it for timestamped history.

## Route B: into the tables (Snowflake, Vertica, and any database without triggers)

Serialize competing writes where the database does not enforce keys. An anti-join to the target does not deduplicate the source or prevent two writers from inserting the same row. Validate that the source maps each value to at most one identity, collapse exact duplicates, and report conflicting candidates before inserting. The examples below use a single stable source key and a batch Metadata value (`metadata.md`).

**Knots**: insert the values not yet present. Continue the ids from the current maximum (only the load writes knots, so this is safe):

```sql
INSERT INTO "{KNT}_{KnotDesc}" ("{KNT}_ID", "{KNT}_{KnotDesc}", "Metadata_{KNT}")
SELECT COALESCE((SELECT max("{KNT}_ID") FROM "{KNT}_{KnotDesc}"), 0) + ROW_NUMBER() OVER (ORDER BY v.val), v.val, {md}
FROM (SELECT DISTINCT {value_col} AS val FROM {src} WHERE {value_col} IS NOT NULL) v
WHERE NOT EXISTS (SELECT 1 FROM "{KNT}_{KnotDesc}" k WHERE k."{KNT}_{KnotDesc}" = v.val);
```

**Anchors and their identifier**: draw ids from the sequence for natural keys not seen before, into a staging table, then insert the anchor and its identifier from it:

```sql
CREATE TEMPORARY TABLE {an}_new AS
SELECT {nextval of "{AN}_{AnchorDesc}_ID_SEQ"} AS "{AN}_ID", k.natural_key
FROM (SELECT DISTINCT {key_col} AS natural_key FROM {src} WHERE {key_col} IS NOT NULL) k
WHERE NOT EXISTS (SELECT 1 FROM "{AN}_KOD_{AnchorDesc}_Code" i WHERE i."{AN}_KOD_{AnchorDesc}_Code" = k.natural_key);

INSERT INTO "{AN}_{AnchorDesc}" ("{AN}_ID", "Metadata_{AN}") SELECT "{AN}_ID", {md} FROM {an}_new;
INSERT INTO "{AN}_KOD_{AnchorDesc}_Code" ("{AN}_KOD_{AN}_ID", "{AN}_KOD_{AnchorDesc}_Code", "Metadata_{AN}_KOD")
SELECT "{AN}_ID", natural_key, {md} FROM {an}_new;
```

**A database without sequences (BigQuery)** draws the ids itself: `COALESCE((SELECT max("{AN}_ID") FROM "{AN}_{AnchorDesc}"), 0) + ROW_NUMBER() OVER (ORDER BY k.natural_key)` in place of the sequence call. That is safe only while one load at a time writes the anchor (the same holds for knots, nexuses and, in bi and crt, the identity of every posit and tie): say so, and serialize the loads. Where the platform has identity columns (BigQuery has them in Preview), they replace this.

For a **key route**, resolve every branch before testing for a new identity. A latest `key_…` view suffices only when its time semantics fit the input. For reused or historized keys, match at the relevant changing time in the correct source scope (`identity-and-keys.md`); treat ambiguous or incomplete routes as errors, not new identities. Load the constructs that complete the route before relying on it.

**Static attributes**: first validate one distinct non-null candidate per owner in the batch; report a candidate that disagrees with a stored value. The following insert assumes `{src}` and the identifier lookup have already passed those checks:

```sql
INSERT INTO "{AN}_{ATR}_{AnchorDesc}_{AttrDesc}" (owner, value, "Metadata_{AN}_{ATR}")
SELECT DISTINCT i."{AN}_KOD_{AN}_ID", s.{value_col}, {md}
FROM {src} s JOIN "{AN}_KOD_{AnchorDesc}_Code" i ON i."{AN}_KOD_{AnchorDesc}_Code" = s.{key_col}
WHERE s.{value_col} IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "{AN}_{ATR}_{AnchorDesc}_{AttrDesc}" a WHERE a.owner = i."{AN}_KOD_{AN}_ID");
```

### Historized attributes and ties: snapshots versus versioned input

**Ordered snapshots.** Stage exactly one validated value per owner (or tie identifier), with a stable source observation timestamp if actual changing time is unavailable (`time.md`). Recognize a completed replay by its input/batch identity, and skip exact versions already stored. Before using the following filter, stop or route to a backfill if any remaining row is at or before the latest stored changing time. Report a different value at an occupied `(owner, ChangedAt)` as a conflict. Do not use the filter to discard any of these rows silently.

```sql
-- s: one validated snapshot row per owner; cur: latest stored row per owner
WHERE cur.owner IS NULL
   OR (s.changed_at > cur.ChangedAt AND s.val IS DISTINCT FROM cur.value)    -- use the database's null-safe inequality
```

**Timestamped changes and backfills.** Preserve each candidate's source `ChangedAt` and validate uniqueness at `(owner or tie identifier, ChangedAt)` across the batch and target. An exact replay is a no-op; two different values at the same time require a correction policy, not an arbitrary winner. For out-of-order input, validate the merged history for the affected keys, including the predecessor and successor of each new version. Apply the model's restatement policy without silently shifting a later change boundary or rewriting stored rows; if that requires reconciliation, stop and report it. Comparing to the latest stored row (or seeding `LAG` with that row alone) is sufficient only for versions strictly newer than it. For example, with `A@10` and `C@30` already stored, `B@20` must be inserted by a supported backfill or reported as unsupported, never discarded.

**Knotted attributes**: the same, joining the source to the knot on its value and storing the knot's id. **Ties**: resolve every role, check conflicts for the same identifier, and use the same snapshot or timestamped-change rules for historized ties.

**Nexuses**: role values alone are not necessarily unique. Resolve the event key and all required roles first, and allocate a surrogate only for events not matched to an existing identity. Insert the nexus and its identifier mapping in one unit. Subsequent attribute or tie steps must resolve both new and existing identities, so late facts about an existing event can still load.

Insert in key order where the database clusters or sorts by key.

## After loading

Check both successful execution and integrity before publishing (`metadata.md`). Check what the database does not enforce (`targets.md`): use generated checks where available, and otherwise check for duplicate keys and missing parents. Use an explicit temporal rule for uniqueness across historical slices; `ic_key_…` is not a substitute for that rule.

## Orchestration

Order steps by actual dependencies: independent knots and identity allocations can run in parallel; a nexus waits for its required roles; an attribute waits for its owner and any knot; a tie waits for all its roles. A key route adds dependencies on the constructs that complete it. Use the user's scheduler. Give each batch an ID for provenance and dependency-checked recovery (`metadata.md`).

A **full rebuild** (truncate in the order ties, nexus attributes, nexuses, anchor attributes, anchors, knots) destroys all history. Provide it separately, warn about it, and run it only after explicit confirmation.

**⚠️ STOP**: present the load order, the number of steps and the load SQL for approval before creating anything.
