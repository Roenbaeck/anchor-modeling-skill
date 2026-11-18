# Performance

Load this when a user asks why a query is slow, plans a large load, asks how to query history over many dates, wants to know whether Anchor's many narrow tables will be fast, or runs on a massively parallel database (Q2, L1). The practices are the author's, from his posts, papers and talks (*Sources* at the end). Almost every figure came from SQL Server (2008 to 2017) or from Vertica, on one data set each, and several are old: they show **what to look for**. Say where a figure comes from, and measure on the user's database before promising anything.

## When a narrow-table model wins, and when it does not

The author's own experiment (288 tests, SQL Server 2008) compared an anchor database, queried through its latest view, with one wide table holding the same data. The more of these hold, the better the anchor model does, and one of them held strongly enough can be enough: **history** is kept, the data is **sparse**, values come from **few distinct values** (knots), there are **few identities relative to the data** (many attributes per identity), there are **many rows**, there are **many attributes** in the model, **few of them are queried at once**, and the query's **conditions bound the result**. The other side of the same results:

- A query that reads **all the attributes with no conditions** was slower, from about 2 to 26 times, and for one-byte values with no history and no nulls nearly everywhere. If a user's main workload is wide extracts of everything, say so, and put the extract in a view that is materialized (a table that is refreshed, a materialized view), not in a query against the narrow tables.
- Size against the wide table, over the four scenarios: about 6:1, 2:1, 1:1 and 1:2. The narrow model is *larger* when values are tiny, because the key repeats in every attribute table; it is smaller with sparsity, history and shared values.
- Where it wins, it wins up to about 14 times (few attributes queried, with conditions, 10 million rows, 24 attributes); and 2 to 8 times for one attribute without conditions in the scenarios with several data types, knots and sparsity.
- The experiment says itself that it covers one DBMS, one machine, one entity, and no star schema or TPC-H comparison. Fewer I/O and table elimination are the reasons the author gives, which is why it suits I/O-bound warehouses.

## Why narrow tables are fast, and what it depends on

- **Table elimination.** A query that names a few attributes of an anchor needs only those attribute tables: the optimizer drops a table when no column of it is selected and it does not change the row count. For that the anchor is the left table and each attribute is left-joined on its key. With a condition on an attribute, a declared foreign key lets the optimizer drop the anchor table too. It works only when **primary and foreign keys are declared**, and a rewrite that looks cleverer can lose it: look at the plan after every rewrite. SQL Server, Oracle (from 10gR2, including Express; check with AUTOTRACE), DB2, PostgreSQL, MariaDB (from 5.1) and, in part, Teradata did it in the author's tests; elsewhere look at the plan or query profile.
- **Keep statistics current**: the optimizer starts the join order from the smallest intermediate result, and conditions on attribute columns are what tell it which that is.
- **Declare the keys even where they are not enforced** (`targets.md`: Snowflake declares them `RELY`), so that the optimizer may use them.
- **A recent database version.** The author calls Anchor "very particular" about optimizer features such as join elimination: it works well only on recent versions. Say so to a user on an old one.
- **Bulk loading:** defer indexes and keys while a very large amount is added and build them afterwards, if the database allows. Large and priming loads go in as files and set-based inserts, not row by row through the triggers of the latest views (`loading.md`, route B); SSIS packages generated from BIML were "magnitudes faster" in the author's experience (no figures).

## Indexes and layout (SQL Server's terms)

- **Cluster each table on its primary key.** Attribute: the owner ascending and the changing time **descending**, so the latest version is read first and a latest lookup needs no sort. Tie: the identifier roles ascending and the time descending. Knot: the identity, with a unique index on the value.
- **A tie's column order cannot be derived from its identifier**: choose by the expected queries, and add a second index in another order if a second direction is common. Few other indexes are needed, because the tables are narrow.
- **Partition** on a knot's value or on the changing time where tables are large; compression helps attribute tables.
- For large networks of connections a plain parent-child table is right for small hierarchies; a recursive query over a big network can run for hours (*Networks*, below).

## Views over history

- **The latest view** joins each attribute to the anchor with a subselect for the latest version (`MAX` of the changing time per identity). That form "normally gives the best performance" and keeps table elimination; on SQL Server 2016 (expected from 2008) `ROW_NUMBER()` with a redundant `GROUP BY` also kept it.
- **Inline scalar functions** that find the previous and following value in insert triggers: in the author's profile they were the bottleneck of loads through the latest views.
- **The point-in-time view for a bitemporal model needs "the row in effect" twice:** on SQL Server one million rows ran in 3.9 s with `OUTER APPLY` for the appearance lookup and a `TOP 1` subselect for the assertion lookup, against 8.0 s with `TOP 1` for both. A version with a worse estimated cost ran faster. **Choose by running**, not by the estimate.

## As-of joins: many reference times against a long history

*For every row of a table, what was the value in effect at that row's time?* Two situations, and the technique differs.

- **The time is a constant** ("as of 2021-06-30"): resolve each history table to its row in effect (the point-in-time perspective), then join as usual. For an outer join, left-join it, and say *why* a value is missing instead of showing a bare null: no history at all for the identity (join a `SELECT DISTINCT id` of the history), or history that starts only after the time asked about. A third reason is a null driving date.
- **The time comes from another table** (a purchase date for each purchase): this is a *temporal dependent join*. The direct way derives the end of each interval (`LEAD(valid_from, 1, end_of_time) OVER (PARTITION BY id ORDER BY valid_from)`) and joins on `valid_from <= t AND valid_to > t`; or `QUALIFY ROW_NUMBER() ... ORDER BY h.t DESC` after an inequality join. Both are correct and the first things to try. Optimizers plan inequality joins poorly (a `BETWEEN` join on SQL Server was the author's example), and a join that multiplies rows before it picks one is costly on large inputs.

**The twine** replaces the inequality join with one ordered pass over the history rows and the reference rows together: tag each row with the timeline it came from, put both on one line sorted by (identity, time), and let a window function carry the latest history time forward to each reference row. No end dates are needed, which suits insert-only warehouses. The author reports a query cancelled after four hours that ran in seconds as a twine, and 53.5 s against billions of estimated operations on 52 million facts (below).

```sql
-- history h(id, t, v) and reference rows r(id, t): the version in effect at each r.t
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
SELECT r.id, r.t, h.v                -- one exact key lookup in the history per reference row
FROM carried c
JOIN r ON r.id = c.id AND r.t = c.t AND c.origin = 'R'
LEFT JOIN h ON h.id = c.id AND h.t = c.since;
```

(A sketch of the idea, not the author's code. History rows sort first at equal times, so a version that starts at `t` counts at `t`. Both the history and the reference need one row per identity and time, or rows join twice; `since` is null for a reference that comes before any history. Checked on Snowflake against a row-number join on 8,000 reference rows over about 20,000 history rows, the same result for every row; speed was not measured.)

Rules for choosing and writing one:

1. **Pick the variant by cardinality.** One driving row per identity and many history rows: the author's *specialized* twine takes the value and time of the *preceding row* of the sorted line (`LAG` over the same partition and order) and keeps the driving rows, needing no second join. Many driving rows per identity (the sketch above, which is his *generalized* twine): carry the history time forward with the conditional running `MAX`, then fetch the value by a key lookup; a one-pass form that also carries the value is slightly slower. **In the many-to-many test (4 million against 4 million rows) the twine was not faster** (49% against 51% of the batch cost): the slides say "YMMV", so compare on the user's data.
2. **The cost is the sort.** The combined set is sorted by (identity, time); in the one-to-many test the sort was a third of the plan and the memory and temporary-space risk. A primary key of (identity, time) on the history gives it in order. If the query is repeated, an index that precomputes the order turns it into a merge join and moves the cost from reading to writing.
3. **Several timelines in one pass:** give each history table its own timeline number, the driving rows number 0, one conditional running `MAX` for each, and one key lookup for each. Cast the time types of the tables to the **most granular** one first, or the `UNION ALL` may fail or convert implicitly; the same holds for the comparisons of a plain temporal join.
4. **Ties at equal times** are decided by the sort: make the order explicit as above, and decide whether a change on the same day as the reference counts (it should, for `<=`).
5. **Measured, one-to-many, SQL Server, parallel plans, one million persons and about four million history rows:** the inequality outer join and the twine had plans costed 63% and 37% of the batch, and the twine's sort took 0.24 s; an inner join returned 734,367 rows (18% of the history). No absolute speed-up was given in the deck.

## Temporal dimensions and the three questions

A dimension is an immutable key table plus one or more mutable history tables (key, valid-from, properties); the fact references the key. Nothing is ever updated, the foreign keys let the key table be eliminated, and facts and dimensions stay independent in time. The paper compares it with slowly changing dimension (SCD) types 1 to 7 and with junk dimensions, on 1,048,576 keys, 21.5 million dimension rows and 52 million facts on SQL Server 2017, median seconds of several runs:

| Question | Temporal dimension | What the SCD types did |
|---|---|---|
| **TIY** (today is yesterday: facts show the current value) | 10.4 | type 1 and 3 about 0.8; type 2 9.1 |
| **YIT** (yesterday is today: the value at a chosen date) | 6.4 | types 1 and 3 cannot; type 2 9.1; type 4 60.2 |
| **TOY** (today or yesterday: the value in effect when the fact happened) | 53.5 as a twine | type 2, 5, 7 about 3 (they store it per fact) |
| Write 2 million dimension rows | 14.2 | type 2 23.9, type 5 271.2, type 7 31.8 |
| Write 2 million fact rows | 10.8 | type 2 74.2, type 5 74.9, type 7 254.2 |

- **Which to use:** current values only: type 1. Historically correct values dominate and slow writes are acceptable: type 2. Read-heavy with both current and historical: types 5 or 7, weighing their write costs. Current *and* arbitrary-date values both common, and writes must stay fast: the temporal dimension. Avoid types 5 and 7 where loads are near real time: their updates find the version in effect and then rewrite rows.
- **TIY and YIT** are a point-in-time view (`ROW_NUMBER() OVER (PARTITION BY id ORDER BY valid_from DESC)`, keep 1, filter `valid_from <= @t`); **TOY** is a twine, not a `CROSS APPLY` of the view per fact (that estimated billions of operations; one run was halted after four hours).
- **An optional "valid from" stored in the fact** only halved the TOY time (53.5 to 23.7 s), enlarges the fact, and is wrong if that version is later corrected.
- Loading type 2 facts was seven times slower than temporal, because finding the version in effect needs a twine too. Use the twine at load time wherever the version in effect has to be found.

## Massively parallel databases (Vertica, from Avito)

The author and Avito's warehouse team ran an anchor model on Vertica 7.1 (clusters of 5, 10 and 12 nodes, 256 GB RAM each) for click-stream data (300 to 740 million events a day; 51 TB licensed; the largest anchor warehouse the author names is 279 TB on Vertica):

1. **Segment each anchor, and every attribute of it, by a modulo hash of the identity**, with no duplication: an instance and its whole history sit on one node, so a join needs no data from another node. The Vertica generator does this for the attribute tables (`SEGMENTED BY MODULARHASH` on the owner).
2. **Duplicate a tie once per role**, each copy segmented by that role's identity, so every relationship an instance takes part in resolves locally. It costs storage.
3. **Replicate each knot to every node**: knots are small, so every join to one is local. A knotted attribute turned a referer URL stored 80 billion times into one million knot values, which also let the same licence hold far more.
4. **The benchmark** (cookies created in a month with events of two types, count distinct users; 3.4 billion cookies, about 50 billion events): Anchor 2,643, 1,174 and 959 s on 5, 10 and 12 nodes; the 3NF join with enough RAM 3,133, 662 and 491 s, and the 3NF join that spilled 3,017, 1,703 and 1,172 s. So the anchor model **beat the spilled 3NF join** (1.1 to 1.5 times) and did **not** beat the in-RAM one at 10 and 12 nodes. The anchor model's time also scales with nodes.
5. **Expect poor plans from about 100 million rows**, and RAM estimates that get less accurate as joins grow. Avito forced the plan: filter on the most selective attribute first, then merge-join through the tie, passing the key set on through sorted temporary tables, so each step shrinks the keys before the next attribute is read. Merge joins are nearly as fast as hash joins without their memory.
6. **Reporting needed denormalized marts** (views, or materialized views, under BI software): business users did not want fully historized versions, and the marts held aggregation and business logic. See `warehouse-practice.md` for how the author's later position treats this.
7. The model grew from fewer than 30 to more than 70 source attributes without remodeling (new attributes are new tables); loads were 15-minute batches of 5 to 15 million rows.

The author's thought experiment for allocating ids so that a child's node follows from its owner's id (one sequence per node) assumes a fixed node count and was not measured: do not build it without a test.

## Networks

SQL Server's `HIERARCHYID` handles the upper layers of a network (locations, devices, ports) well, but explodes in rows where connectivity is high. Split it into chunks, each (an integer id, a `HIERARCHYID`), and a plain table of connections between chunks; answer "connected through any number of edges" in two steps, candidates by path and then the connection table. SQL Server graph tables could not ask that question in 2018 and 2020.

## Sources

*Let's Twine Again*, *Information in Effect and Performance*, *Temporal joins and twines* (2023 slides), *Turning Horrible Joins into Wonderful Speedups*, *Temporal Dimensional Modeling* (paper), *Anchor Modeling* (the 2010 DKE paper, §7 and §8), *Big Data Normalization for MPP Databases* (Golov and Rönnbäck), *Performance improvements*, *Four features for performance*, *Optimizing BETWEEN joins*, *Oracle Table Elimination*, *Co-locating in an MPP-RDBMS*, *Representing Large Networks by HIERARCHYID Chunks*, *Anchor for Vaulters*, and the 2007 cheat sheet, at `https://www.anchormodeling.com/` and `.../publications/`.
