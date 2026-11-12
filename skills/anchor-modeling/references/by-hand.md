# Writing the DDL by hand (uni-temporal)

For a database the generator has no file for, or an environment that cannot run it. It covers **uni-temporal** models. Bitemporal and concurrent-reliance-temporal models have posit and annex tables, assembled views and rules that are easy to get subtly wrong; use the generator for them, or the Anchor Modeler, and ask the user before improvising.

The shapes below are the generator's, in a neutral notation. Write the SQL of the user's database (`targets.md`; its own documentation for what is not there) and keep the names exactly (`naming-conventions.md`): a model written by hand and one generated then agree, and either can be extended by the other. Tell the user that the script is hand-written and has not been through the generator, and run it in a scratch schema first.

Notation: `{AN}` an anchor or nexus mnemonic, `{ATR}` an attribute mnemonic, `{KNT}` a knot mnemonic, `{AnchorDesc}`, `{AttrDesc}`, `{KnotDesc}` descriptors, `{tie_name}` the name built from the roles of a tie. `{int}` the integer type of the identity, `{time}` the time stamp type (UTC), `{value_type}` the data type of a value. Every name is quoted in the database's way.

## Rules for every table

- Every table has a `Metadata_{...}` column, `{int} not null` (`metadata.md`), unless the model says `metadataUsage="false"`.
- Declare every primary key, unique constraint and foreign key. A database that does not enforce them (`targets.md`) still gets them declared, since optimizers and tools read them, and loads then have to guarantee uniqueness themselves (`loading.md`).
- A comment on every table and view from the description of the construct.
- Create in this order: knots, anchors, nexuses, attributes, ties, then the perspectives. Use the database's `IF NOT EXISTS` for tables; it **silently skips a table that exists with another structure**, so when extending a model compare what exists (`DESCRIBE`, `INFORMATION_SCHEMA`) and report the difference.
- Time is UTC, and *now* is the database's UTC function (`targets.md`).

## Tables

**Knot**: `{KNT}_{KnotDesc}`

```
{KNT}_ID {int} not null                       -- from a sequence/identity when generator="true"
{KNT}_{KnotDesc} {value_type} not null
Metadata_{KNT} {int} not null
primary key ({KNT}_ID), unique ({KNT}_{KnotDesc})
```

**Anchor**: `{AN}_{AnchorDesc}`: `{AN}_ID {int} not null` (from a sequence or identity), `Metadata_{AN}`, primary key on the id. An anchor holds nothing else.

**Nexus**: `{AN}_{NexusDesc}`: like an anchor, plus one column per role, `{type}_ID_{role}`, each a foreign key to the anchor, nexus or knot it names. Roles are never part of a key.

**Attribute**: `{AN}_{ATR}_{AnchorDesc}_{AttrDesc}`. One table per property:

```
{AN}_{ATR}_{AN}_ID {int} not null             -- foreign key to the owner
{AN}_{ATR}_{AnchorDesc}_{AttrDesc} {value_type} not null      -- knotted: {AN}_{ATR}_{KNT}_ID {int} not null, foreign key to the knot
{AN}_{ATR}_ChangedAt {time} not null          -- historized only
Metadata_{AN}_{ATR} {int} not null
primary key ({AN}_{ATR}_{AN}_ID)                                -- historized: ({AN}_{ATR}_{AN}_ID, {AN}_{ATR}_ChangedAt)
```

**Tie**: `{tie_name}` (the roles, `{type}_{role}` joined by `_`): one column per role `{type}_ID_{role}`, each a foreign key to the construct it names, `{tie_name}_ChangedAt {time} not null` if historized, and `Metadata_{tie_name}`. The primary key is the identifier roles (all the anchor roles when none is marked), plus `ChangedAt` if historized:

| Identifier roles | Cardinality |
|---|---|
| all anchor roles | many to many |
| some | many to one, from the identifier side |
| none | one to one |

A knot role that is an identifier makes the key one per knot value; one that is not carries a value of the relationship.

## Perspectives

All of them LEFT JOIN from the anchor (or nexus) to its attribute tables, and to the knots of its knotted attributes (one alias per attribute, since a knot can serve several).

- **Latest**, `l{AN}_{AnchorDesc}` (a view): every column of the anchor and its attributes. A static attribute joins on its key. A historized attribute joins to **its latest row per owner**: use the database's window function (`row_number() over (partition by owner order by ChangedAt desc) = 1`), or a correlated `max(ChangedAt)` where correlated subqueries work. A knotted attribute shows the knot's value too.
- **Point in time**, `p{AN}_{AnchorDesc}(changingTimepoint)` (a function returning a table; a database that cannot has no such perspective: say so): the latest perspective with each historized attribute first filtered to `ChangedAt <= changingTimepoint`.
- **Now**, `n{AN}_{AnchorDesc}` (a view): the point-in-time perspective called with *now* (UTC).
- **Difference**, `d{AN}_{AnchorDesc}(intervalStart, intervalEnd)` (a function): every change of a historized attribute in the interval, with the values in effect at that time. For each change, join each historized attribute to the version in effect (`ChangedAt <= the time` and the next version's `ChangedAt` null or later).
- **Ties** have the same four, over the tie and the anchors and knots of its roles: the latest shows each identifier combination at its latest `ChangedAt`.

Do not call a point-in-time function once for each row of another table inside a join; that fails or is slow on many databases. Call it once for each time.

## After writing

Run the DDL in a scratch schema, query every perspective once (also with no data in the tables, which hides some errors, and with a little), and show the user the script before the real run. Add the integrity checks that the database does not enforce: duplicate keys in every table, duplicate `(owner, ChangedAt)` in historized attributes, foreign keys without a parent.
