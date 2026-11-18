# Performance

Load this when a user asks why a query is slow, plans a large load, asks how to query history over many dates, or wants to know whether Anchor's many narrow tables will be fast (Q2, L1). The practices are the author's (*Sources* at the end). Every figure came from a test on SQL Server on one data set, and several are old: say that they show *what to look for*, and measure on the user's database before promising anything.

## Why narrow tables are fast, and what it depends on

- **Table elimination.** A query that names a few attributes of an anchor reads a few attribute tables, because the optimizer drops the left joins to the others. It works only when **primary and foreign keys are declared** and the query is written so that the join to an unused table can be proved harmless (a left join from the anchor to the attribute on its key). Check that it happens, in the plan, whenever a query is rewritten: a rewrite that looks cleverer can lose it.
- **Keep statistics current** as data grows. The optimizer starts the join order from the smallest intermediate result, and it cannot do that blind.
- **Declare the keys even where they are not enforced** (`targets.md`: Snowflake declares them `RELY`), so that the optimizer may use them. Verify in that database's own plan or query profile.
- **Where the database has table elimination:** SQL Server and Oracle (from 10gR2, including Express; check with AUTOTRACE) and MariaDB (from 5.1) did in the author's tests. Elsewhere, look at the plan.
- **Bulk loading:** defer indexes and keys while a very large amount is added and build them afterwards, if the database allows; large and priming loads go as files and set-based inserts (SSIS packages generated from BIML were "magnitudes faster" than triggers on the latest views in the author's experience, no figures given), not row by row through triggers (`loading.md`, route B).

## Physical layout (SQL Server's terms)

Cluster each table on its primary key, with the identity ascending and the historization column **descending**: the latest version of any identity is then found first on disk. For large networks of connections, a plain parent-child table is right for small hierarchies; a recursive query over a big network can run for hours.

## Views over history

- **The latest view** joins each attribute to the anchor with a subselect for the latest version (`MAX` of the changing time per identity). That form "normally gives the best performance" and keeps table elimination; on SQL Server 2016 (expected from 2008) `ROW_NUMBER()` with a redundant `GROUP BY` also kept it.
- **Inline scalar functions** that find the previous and following value in insert triggers: in the author's profile they were the bottleneck of loads through the latest views.
- **The point-in-time view for a bitemporal model needs "the row in effect" twice:** on SQL Server one million rows ran in 3.9 s with `OUTER APPLY` for the appearance lookup and a `TOP 1` subselect for the assertion lookup, against 8.0 s with `TOP 1` for both. A version with a worse estimated cost ran faster. **Choose by running**, not by the estimate.

## As-of joins: many reference times against a long history

*For every row in a fact table, what was the value in effect at its time?* Do not use a `BETWEEN` range join (optimizers plan them badly: SQL Server in the author's tests) and be careful with `CROSS APPLY ... TOP 1 ... ORDER BY` on large inputs: it works, and is the first rewrite to try, but it is a row-by-row lookup. Large inputs want a **twine**: one ordered pass over the history rows and the reference rows together. The author reports a query that was cancelled after four hours that ran in seconds as a twine, with each table scanned once.

```sql
-- history h(id, t, ...) and reference rows r(id, t, ...): the version in effect at each r.t
WITH points AS (
    SELECT 'H' AS origin, id, t FROM h
    UNION ALL
    SELECT 'R', id, t FROM r
), carried AS (
    SELECT origin, id, t,
           MAX(CASE WHEN origin = 'H' THEN t END)
               OVER (PARTITION BY id ORDER BY t, CASE origin WHEN 'H' THEN 0 ELSE 1 END
                     ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS since
    FROM points
)
SELECT r.*, h.*                      -- one exact primary key lookup in the history per reference row
FROM carried c
JOIN r ON r.id = c.id AND r.t = c.t AND c.origin = 'R'
LEFT JOIN h ON h.id = c.id AND h.t = c.since;
```

(A sketch of the idea, not the author's code: the history rows come first at equal times so a version that starts at `t` counts at `t`. Both the history and the reference need one row per identity and time, or rows join twice. Checked on Snowflake against a row-number join on 8,000 reference rows over about 20,000 history rows, with the same result for every row, including the references that come before any history; speed was not measured.) If the sort is costly and the query is repeated, an index that precomputes the order turns it into a merge join, and moves the cost from reading to writing.

This is also how the author loads **temporal dimensions**: dimensions and facts are kept independent in time, history stays in the model, and the twine finds the historically correct relation, instead of the slowly changing dimension types, which he argues give write-time or read-time anomalies.

## Massively parallel databases

Related rows should be on the same node. Segment attribute and tie tables by the **owner's identity**, which is what the Vertica generator does (`SEGMENTED BY` the anchor id), so that an anchor and its attributes meet without moving data. The author's thought experiment, one sequence per node so that a child's node follows from its owner's id, assumes a fixed node count and has not been measured: do not build it without a test.

## Networks

SQL Server's `HIERARCHYID` handles the upper layers of a network (locations, devices, ports) well, but explodes in rows where connectivity is high. Split it into chunks, each (an integer id, a `HIERARCHYID`), and a plain table of connections between chunks; answer "connected through any number of edges" in two steps, candidates by path and then the connection table. SQL Server graph tables could not ask that question in 2018 and 2020.

## Sources

*Information in Effect and Performance*, *Performance improvements*, *Four features for performance*, *Optimizing BETWEEN joins*, *Let's Twine Again*, *Temporal Dimensional Modeling*, *Oracle Table Elimination*, *Co-locating in an MPP-RDBMS*, *Representing Large Networks by HIERARCHYID Chunks*, *Polymorphic Graph Queries in SQL Server*, and the 2007 cheat sheet (indexing, collapsing views), all at `https://www.anchormodeling.com/`.
