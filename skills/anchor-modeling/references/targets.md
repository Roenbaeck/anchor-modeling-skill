# The databases

What differs between databases, and what has been run. Load this as soon as the database is known. The facts are those of the Anchor repository at the commit in `AnchorGenerator.version`; its `docs/ANCHOR.md` (*Generated objects and naming*, *Loading through the latest views*, *Keys and identifiers*) has the rules in full.

## What each database has

| | SQL Server | Snowflake | PostgreSQL | Vertica | BigQuery | Oracle |
|---|---|---|---|---|---|---|
| Generator file in `generators/` | yes | yes | yes | bi, crt only | no | no |
| Temporalizations | uni, bi, crt | uni, bi, crt | uni, bi, crt | bi, crt | modeler only | uni, crt: modeler only; bi unsupported |
| Perspectives | `l` `p` `n` `d` (and `t`, time traveling, in bi and crt) | the same | the same | `l` and `n` only; no function returns a table, so rewinders are views | modeler only | modeler only |
| Triggers on the latest views (load with `INSERT`/`UPDATE`/`DELETE`) | yes, all three | none | yes, all three (row-level) | none | none | modeler only (uni) |
| Primary and foreign keys enforced | yes | **no**: declared `RELY`, metadata only | yes | not run | - | - |
| Integrity checks (views over what the keys do not enforce) | not needed: keys and triggers enforce | `IntegrityViolations` and an `ic_` view per table | not needed: keys and triggers enforce | none | - | - |
| Natural key views (`key_`, `pkey_`, `ic_key_`) | yes, with key tables | yes | yes, no key tables | no | no | no |
| Equivalence (uni) | yes | yes | yes | no | - | - |
| Encryption groups (uni) | yes | no | no | no | - | - |
| Generated and **run on a real server** | yes (all models deployed, trigger, key and perspective tests) | yes (account, same tests) | yes (PostgreSQL 16, same tests) | **no**: generated and linted | **no** | **no** |

"Modeler only" means the Anchor Modeler generates it (its *Generate SQL*, with the database selected) but this skill has no file for it, and it has never been run on a server. Say so to the user; do not describe such a script as tested.

## Names, types and quoting

| | SQL Server | Snowflake | PostgreSQL | Vertica |
|---|---|---|---|---|
| Default schema (`encapsulation`) | `dbo` | `public` | `public` | `public` |
| Names written | `[name]` | `"name"`, case sensitive; the schema is not quoted | `"name"`, case sensitive; at most **63 bytes** (the generator keeps within it) | `"name"` |
| Integer identities | `tinyint`, `smallint`, `int`, `bigint` | `int` (all integer types are `NUMBER(38,0)`) | `smallint`, `integer`, `bigint` | `integer` |
| Time stamps (`chronon`, `timeRange`) | `datetime2` | `timestamp_ntz(9)` | `timestamp` | `timestamp(9)` / `timestamp` |
| Text | `varchar(n)`, `nvarchar(n)` | `varchar(n)` | `varchar(n)`, `text` | `varchar(n)` |
| *Now* (`now`) | `sysdatetime()` | `sysdate()` | `current_timestamp` | `current_timestamp` |
| Ids | `IDENTITY(1,1)` columns | sequence default | sequence default | sequence default |
| Comments | extended properties | `COMMENT` | `COMMENT ON` | `COMMENT ON` |

**Time zone.** *Now* decides what the now perspectives show and the default of a changing time, so it should be UTC like the data. `sysdate()` in Snowflake is UTC. `sysdatetime()` is the **server's local time** in SQL Server (`sysutcdatetime()` is UTC), and `current_timestamp` cast to a `timestamp` is the **session's** local time in PostgreSQL and Vertica. If the model must be UTC, ask the user, and change `now` in the metadata (or fix the time zone of the database) before generating. The generator does not decide it.

To write a type for another database, `AnchorGenerator.defaults()` shows the database's choices for identities, time stamps and *now*.

## How each database loads

- **SQL Server and PostgreSQL** have triggers on the latest views of anchors, nexuses and ties, so data can be loaded with plain `INSERT`, `UPDATE` and `DELETE` against `l...` views, and every statement is turned into new rows (`loading.md`). A load may also insert straight into the tables; the triggers on the attribute and tie tables of the uni-temporal model reject a contradiction or a restatement the model forbids. PostgreSQL's triggers run for each row and see that a column has another value than before, not what the `SET` list was.
- **Snowflake, Vertica and any database without triggers** load into the tables, and **every insert filters out what exists** (`loading.md`). Snowflake enforces nothing but `NOT NULL`: run `SELECT * FROM IntegrityViolations` after a load.

## Other databases

BigQuery and Oracle are modeler-only (above). For MySQL and MariaDB, Redshift, Databricks, DuckDB, Db2, Teradata and the rest there is no generator at all. What to do:

1. For a uni-temporal model use `by-hand.md`, and take the dialect from the database's own documentation: the types, `IF NOT EXISTS`, identity or sequences, how a perspective that takes a time (a table function) is written, `COMMENT`.
2. For bi and crt, generate with the closest file and adapt the script by hand only if the user accepts that it is untested: **PostgreSQL's** for a database with enforced keys, sequences or identity and table functions; **Snowflake's** for a cloud warehouse that keeps keys as metadata. Change the types and the functions that differ, and keep to the generator's names. Say it plainly: a hand-adapted script has not been run by anyone yet.
3. Always show the user what you changed, and run the script in an empty schema first.

## What has not been run

Vertica, BigQuery and Oracle output has never been run on a server; Snowflake's showed what that finds (statements that a server rejects although they look right). If the user's database is one of those, say so before running the script, run it in a scratch schema, and expect to report what the server rejects at `https://github.com/Roenbaeck/anchor/issues`.
