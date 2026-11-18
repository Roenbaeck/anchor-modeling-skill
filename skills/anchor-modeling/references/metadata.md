# The Metadata column

Every table of an Anchor model has a `Metadata_{mnemonic}` column (an integer, `not null`) unless the model says `metadataUsage="false"`. It is on anchors, nexuses, knots, attributes and ties. It is not part of any key, and it is carried through the perspectives next to the data it describes.

## Purpose

The column connects every row to the **batch** that loaded it: which run, when, from which source, and whether it passed the integrity checks. That makes it possible to:

- **trace** any row back to the load that made it,
- **identify** the rows a bad batch inserted, for recovery after a dependency check,
- **audit** what changed between two loads by comparing Metadata values.

It is **not a source-system identifier** (provenance belongs in the batch log, or in the identifier attribute of the entity) and **not a time stamp** (the log records when the batch ran; the column is an integer key into the log).

## Batch tracking

Create these once, in the database of the model, in the SQL of the user's database:

```sql
-- the batch ids
a sequence LOAD_BATCH_SEQ starting at 1                     -- or an identity column on the log

-- the log: one row for each batch
LOAD_BATCH_LOG (
    BATCH_ID             integer   not null,                 -- the Metadata value
    STARTED_AT           timestamp not null,                 -- UTC
    COMPLETED_AT         timestamp,
    EXECUTION_STATUS     varchar(20),                        -- RUNNING, SUCCEEDED, FAILED, etc.
    INTEGRITY_STATUS     varchar(20),                        -- PENDING, PASSED, VIOLATIONS, CHECK_FAILED
    PUBLICATION_STATUS   varchar(20),                        -- UNPUBLISHED, PUBLISHED, ROLLED_BACK
    SOURCE               varchar(200),                       -- optional
    INTEGRITY_VIOLATIONS integer
)
```

A load starts by taking a batch ID and logging `RUNNING`, `PENDING`, and `UNPUBLISHED`. Every insert uses that ID as the Metadata value. Pass the ID as a job parameter or use a run-scoped mapping; a singleton current-batch row is safe only for one writer with no overlapping runs. A route through the latest views (`loading.md`) can set the Metadata column in the statement.

Record whether all required steps completed successfully, separately from the result of integrity and business-rule checks. Zero violations does not establish that the load ran to completion. Only publish after both pass. Use a single transaction where feasible, or validate an isolated candidate version before exposing it; a final validation query cannot undo data already exposed to readers. This matters especially on a target whose optimizer trusts unenforced keys (`targets.md`).

## Rolling back a batch

Metadata identifies inserted rows; it does not prove that removing them is safe. First stop competing writes and check retained batches for dependencies: later facts may reference a new identity, rely on a key match or restatement decision, or have been published from this history. If any dependent work must be removed or replayed, plan that recovery explicitly. A targeted delete is not an undo for changes to existing rows or published outputs.

If the dependency check passes and the user approves, delete the identified rows in reverse dependency order, based on the actual model. Run the deletes and integrity checks inside one transaction where supported; roll back the transaction on a violation. Otherwise recover in isolation and validate before publication. Mark `ROLLED_BACK` only after recovery succeeds.

```sql
DELETE FROM "{tie_name}" WHERE "Metadata_{tie_name}" = {batch_id};
DELETE FROM "{AN}_{ATR}_{AnchorDesc}_{AttrDesc}" WHERE "Metadata_{AN}_{ATR}" = {batch_id};
DELETE FROM "{AN}_{AnchorDesc}" WHERE "Metadata_{AN}" = {batch_id};
-- ... one for each table that the batch wrote to
UPDATE LOAD_BATCH_LOG SET PUBLICATION_STATUS = 'ROLLED_BACK' WHERE BATCH_ID = {batch_id};
```

Show the user the list of tables and the batch before running the deletes.
