# The databases

What differs between databases, and what has been run. Load this as soon as the database is known. The facts are those of the Anchor repository at the commit in `AnchorGenerator.version`; its `docs/ANCHOR.md` (*Generated objects and naming*, *Loading through the latest views*, *Keys and identifiers*, and a section on each database) has the rules in full.

## What each database has

| | SQL Server | Snowflake | PostgreSQL | Vertica | BigQuery | Oracle |
|---|---|---|---|---|---|---|
| Generator file in `generators/` | yes | yes | yes | yes | yes | no |
| Temporalizations | uni, bi, crt | uni, bi, crt | uni, bi, crt | uni, bi, crt | uni, bi, crt | uni, crt, from the modeler only; bi unsupported |
| Perspectives | `l` `p` `n` `d` (and `t`, time traveling, in bi and crt) | the same | the same | `l` and `n` only; no function returns a table, so rewinders are views | the same as Snowflake, with table functions | modeler only |
| Triggers on the latest views (load with `INSERT`/`UPDATE`/`DELETE`) | yes, all three | none | yes, all three (row-level) | none | none | modeler only (uni) |
| Primary and foreign keys enforced | yes | **no**: declared `RELY`, metadata only | yes | not run | **no**: `NOT ENFORCED`; no unique constraints either | - |
| Integrity checks (views over what the keys do not enforce) | not needed: keys and triggers enforce | `IntegrityViolations` and an `ic_` view per table | not needed: keys and triggers enforce | none | `IntegrityViolations` and an `ic_` view per table | - |
| Natural key views (`key_`, `pkey_`, `ic_key_`) | yes, with key tables | yes | yes, no key tables | no | yes | no |
| Equivalence (uni) | yes | yes | yes | no | no | no |
| Encryption groups (uni) | yes | no | no | no | no | no |
| Generated and **run on a real server** | yes (all models deployed, trigger, key and perspective tests) | yes (account, same tests) | yes (PostgreSQL 16, same tests) | **no**: generated and linted | **no**: generated and linted | **no** |

"Modeler only" means the Anchor Modeler generates it (its *Generate SQL*, with the database selected) but this skill has no file for it, and it has never been run on a server. **Oracle**'s generators are the original ones ported as they were; they have known defects (no nexus in uni, and crt that is mostly another database's SQL: `ANCHOR.md`, *Oracle*), so treat a script from them as a starting point and not as something to run. Say this to the user; do not describe such a script as tested.

## Names, types and quoting

| | SQL Server | Snowflake | PostgreSQL | Vertica | BigQuery |
|---|---|---|---|---|---|
| Default schema (`encapsulation`) | `dbo` | `public` | `public` | `public` | `public` (a dataset) |
| Names written | `[name]` | `"name"`, case sensitive; the schema is not quoted | `"name"`, case sensitive; at most **63 bytes** (the generator keeps within it) | `"name"` | `` `name` ``; table names are case sensitive |
| Integer identities | `tinyint`, `smallint`, `int`, `bigint` | `int` (all integer types are `NUMBER(38,0)`) | `smallint`, `integer`, `bigint` | `integer` | `int64` |
| Time stamps (`chronon`, `timeRange`) | `datetime2` | `timestamp_ntz(9)` | `timestamp` | `timestamp(9)` / `timestamp` | `datetime` |
| Text | `varchar(n)`, `nvarchar(n)` | `varchar(n)` | `varchar(n)`, `text` | `varchar(n)` | `string(n)`, `string` |
| *Now* (`now`) | `sysdatetime()` | `sysdate()` | `current_timestamp` | `current_timestamp` | `current_datetime()` |
| Ids | `IDENTITY(1,1)` columns | sequence default | sequence default | sequence default | **none: the load gives every id** |
| Comments | extended properties | `COMMENT` | `COMMENT ON` | `COMMENT ON` | `OPTIONS(description=...)` |

**Time zone.** *Now* decides what the now perspectives show and the default of a changing time, so it should be UTC like the data. `sysdate()` in Snowflake is UTC, and so is `current_datetime()` in BigQuery. `sysdatetime()` is the **server's local time** in SQL Server (`sysutcdatetime()` is UTC), and `current_timestamp` cast to a `timestamp` is the **session's** local time in PostgreSQL and Vertica. If the model must be UTC, ask the user, and change `now` in the metadata (or fix the time zone of the database) before generating. The generator does not decide it.

To write a type for another database, `AnchorGenerator.defaults()` shows the database's choices for identities, time stamps and *now*.

## How each database loads

- **SQL Server and PostgreSQL** have triggers on the latest views of anchors, nexuses and ties, so data can be loaded with plain `INSERT`, `UPDATE` and `DELETE` against `l...` views, and every statement is turned into new rows (`loading.md`). A load may also insert straight into the tables; the triggers on the attribute and tie tables of the uni-temporal model reject a contradiction or a restatement the model forbids. PostgreSQL's triggers run for each row and see that a column has another value than before, not what the `SET` list was.
- **Snowflake, Vertica, BigQuery and any database without triggers** load into the tables, and **every insert filters out what exists** (`loading.md`). Snowflake and BigQuery enforce nothing but `NOT NULL` (BigQuery's keys are declared `NOT ENFORCED`): run `SELECT * FROM IntegrityViolations` after a load. BigQuery has no sequences, so the load draws ids itself (the maximum so far plus a row number, within one load that is the only writer, or a key it can derive); `loading.md` shows the sequence form, which has to be written that way for BigQuery.

## Other databases

Oracle is modeler-only (above). For MySQL and MariaDB, Redshift, Databricks, DuckDB, Db2, Teradata and the rest there is no generator at all. What to do:

1. For a uni-temporal model use `by-hand.md`, and take the dialect from the database's own documentation: the types, `IF NOT EXISTS`, identity or sequences, how a perspective that takes a time (a table function) is written, `COMMENT`.
2. For bi and crt, generate with the closest file and adapt the script by hand only if the user accepts that it is untested: **PostgreSQL's** for a database with enforced keys, sequences or identity and table functions; **Snowflake's** or **BigQuery's** for a cloud warehouse that keeps keys as metadata (BigQuery's when there are no sequences either). Change the types and the functions that differ, and keep to the generator's names. Say it plainly: a hand-adapted script has not been run by anyone yet.
3. Always show the user what you changed, and run the script in an empty schema first.

## What has not been run

Vertica, BigQuery and Oracle output has never been run on a server; Snowflake's showed what that finds (statements that a server rejects although they look right). If the user's database is one of those, say so before running the script, run it in a scratch schema, and expect to report what the server rejects at `https://github.com/Roenbaeck/anchor/issues`.
