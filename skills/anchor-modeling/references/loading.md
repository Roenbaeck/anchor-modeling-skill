# Loading data

**Loads are incremental and idempotent.** An Anchor model keeps history by appending rows. A recurring load never truncates: it inserts only what is new or changed, so running it twice with the same data changes nothing. Truncating and reloading from a source that holds only current values destroys the history.

Say which of the two routes the user's database takes (`targets.md`), and keep to it.

## Route A: through the latest views (SQL Server, PostgreSQL)

The latest views of anchors, nexuses and ties have triggers, so a load is plain `INSERT`, `UPDATE` and `DELETE` against `l{AN}_{Desc}`. Every statement is turned into new rows:

- An **insert** states each value given, valid from its changing time or from now if none is given. A new anchor gets its id from the generator (sequence or identity) when none is given.
- An **update** states only what it changes. A value set to what it already is states nothing (PostgreSQL decides this from the value alone, SQL Server also from the `SET` list). A new value is a new version from the changing time given, or from now.
- A **static** attribute or tie takes a value once; another value is an error (a contradiction) in uni, and a correction in bi and crt.
- **Null** retracts the shown version in bi and crt; in uni it does nothing, except for a deletable attribute whose deletable column is set in the same update, which moves the history to a deletion table.
- A **delete** retracts (bi, crt) or removes (uni) the shown versions.

Map source rows to identities through the **identifier attribute** (a static attribute with the natural key): insert the missing anchors with their identifier first, then load the other attributes by joining the source to the identifier. The triggers' rules (restatements, idempotency, corrections, what a retraction is) are in the Anchor repository, `docs/ANCHOR.md`, *Loading through the latest views*. In PostgreSQL, a statement that sets a changing time to what it already is must be an insert into the assembled view of the attribute or tie instead of an update.

## Route B: into the tables (Snowflake, Vertica, and any database without triggers)

Nothing stops a duplicate, and some databases do not enforce keys at all, so **every insert filters out what exists**. The patterns, with `{src}` the source, `{md}` the Metadata value (`metadata.md`):

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

When the model has a **key route** (`targets.md`: natural key views), use the key view `key_{AN}_{AnchorDesc}_{route}` instead of the identifier table in the `NOT EXISTS` and in every mapping of source rows to ids, matching every value of the key, and load the anchors that the key reaches first.

**Static attributes**: insert only for owners without a row, mapping the source through the identifier:

```sql
INSERT INTO "{AN}_{ATR}_{AnchorDesc}_{AttrDesc}" (owner, value, "Metadata_{AN}_{ATR}")
SELECT i."{AN}_KOD_{AN}_ID", {any one} (s.{value_col}), {md}
FROM {src} s JOIN "{AN}_KOD_{AnchorDesc}_Code" i ON i."{AN}_KOD_{AnchorDesc}_Code" = s.{key_col}
WHERE s.{value_col} IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "{AN}_{ATR}_{AnchorDesc}_{AttrDesc}" a WHERE a.owner = i."{AN}_KOD_{AN}_ID")
GROUP BY i."{AN}_KOD_{AN}_ID";
```

**Historized attributes (the restatement check)**: insert a row only when the value differs from the latest stored value and is newer. `ChangedAt` comes from the source's change time, otherwise the load time (UTC). Take the latest row per owner from the source and from the target with a window function, and compare:

```sql
-- s: one row per owner from the source (latest by changed_at); cur: the latest stored row per owner
WHERE cur.owner IS NULL
   OR (s.changed_at > cur.ChangedAt AND s.val IS DISTINCT FROM cur.value)    -- use the database's null-safe inequality
```

If the source holds several versions per key, keep them all, order them together with the latest stored row, and insert the ones whose value differs from the previous one (`LAG`).

**Knotted attributes**: the same, joining the source to the knot on its value and storing the knot's id. **Ties**: map each role through its identifier (or knot) and insert combinations not already present on the identifier roles; a historized tie takes the same restatement check.

**Nexuses**: a nexus row cannot be found again from the source by its roles (they are not unique), so stage the new events with ids drawn from the **sequence** (never `ROW_NUMBER()`), only for events whose source key is not loaded, and insert the nexus, its identifier, **all** its other attributes and its ties from the staging table in one unit; drop the staging table at the end.

Insert in key order where the database clusters or sorts by key.

## After loading

Check what the database does not enforce (`targets.md`): the integrity checks where there are any (Snowflake's `IntegrityViolations`), and for a database without them duplicate keys, duplicate `(owner, ChangedAt)` in historized attributes and foreign keys without a parent. `ic_key_...` views report keys that two identities share.

## Orchestration

The order is by dependency: knots; anchors and nexuses with their identifiers (independent of each other, so they may run in parallel); then every other attribute (after its anchor, and after the knots if knotted) and every tie (after the anchors, nexuses and knots of its roles). A nexus loads after the anchors, knots and nexuses of its roles, then its attributes. The user's scheduler decides how: Snowflake tasks (one task per step with `AFTER`, a finalizer for the checks), SQL Server Agent jobs or SSIS, `pg_cron` or Airflow, dbt, or a script. Ask which; do not assume. Give each batch an id (`metadata.md`) so that it can be rolled back.

A **full rebuild** (truncate in the order ties, nexus attributes, nexuses, anchor attributes, anchors, knots) destroys all history. Provide it separately, warn about it, and run it only after explicit confirmation.

**⚠️ STOP**: present the load order, the number of steps and the load SQL for approval before creating anything.
