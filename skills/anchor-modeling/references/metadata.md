# The Metadata column

Every table of an Anchor model has a `Metadata_{mnemonic}` column (an integer, `not null`) unless the model says `metadataUsage="false"`. It is on anchors, nexuses, knots, attributes and ties. It is not part of any key, and it is carried through the perspectives next to the data it describes.

## Purpose

The column connects every row to the **batch** that loaded it: which run, when, from which source, and whether it passed the integrity checks. That makes it possible to:

- **trace** any row back to the load that made it,
- **roll back** a bad batch by deleting the rows with its Metadata value,
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
    STATUS               varchar(20),                        -- RUNNING, then SUCCEEDED, VIOLATIONS or ROLLED_BACK
    SOURCE               varchar(200),                       -- optional
    INTEGRITY_VIOLATIONS integer
)
```

A load starts by taking the next batch id and logging `RUNNING`; every insert uses it as the Metadata value; the end of the load records the number of integrity violations (`targets.md` says what the database has to count them with) and sets the status. How the id reaches every step depends on the orchestrator: a one-row `LOAD_BATCH_CURRENT` table that the first step writes and the others read (safe, since the first step finishes before the others start), a parameter of the job, or a session variable. A route through the latest views (`loading.md`) can set the Metadata column in the statement like any other column.

## Rolling back a batch

Every row carries the batch id, so removing a bad load is a targeted delete in **reverse dependency order**: ties, nexus attributes, nexuses, anchor attributes, anchors, knots. Write the deletes from the model (every table has a `Metadata_...` column of its own), run them, then run the integrity checks of the database (`targets.md`) to confirm that the model is clean, and mark the batch `ROLLED_BACK` in the log.

```sql
DELETE FROM "{tie_name}" WHERE "Metadata_{tie_name}" = {batch_id};
DELETE FROM "{AN}_{ATR}_{AnchorDesc}_{AttrDesc}" WHERE "Metadata_{AN}_{ATR}" = {batch_id};
DELETE FROM "{AN}_{AnchorDesc}" WHERE "Metadata_{AN}" = {batch_id};
-- ... one for each table that the batch wrote to
UPDATE LOAD_BATCH_LOG SET STATUS = 'ROLLED_BACK' WHERE BATCH_ID = {batch_id};
```

Show the user the list of tables and the batch before running the deletes.
