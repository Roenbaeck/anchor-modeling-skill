---
name: anchor-modeling
description: "Anchor Modeling on any SQL database, with any agent: reverse-engineer an existing database or files into an Anchor model, design a model with the user, generate its DDL (SQL Server, Snowflake, PostgreSQL and Vertica with the bundled generator, other databases by adapting), load data incrementally, query through perspectives, extend a model, or explain it. Use for ALL requests about Anchor Modeling. Triggers: anchor model, anchor modeling, 6NF, sixth normal form, anchor table, historized attribute, knot table, tie table, nexus table, perspective view, temporal model, bitemporal, uni-temporal, reverse engineer to anchor, create anchor model, generate anchor DDL."
license: MIT
compatibility: "Needs nothing but the ability to read this folder. Better with a way to run JavaScript (Node, Deno, Bun or any ES5 engine) for the generator, and a way to run SQL on the target database; without them the skill hands the work to the user."
---

# Anchor Modeling

Anchor Modeling is a database design technique that decomposes a domain into sixth-normal-form tables: identity tables (anchors), single-property tables (attributes), lookup tables (knots), relationship tables (ties) and event tables (nexuses). A model only ever grows, by adding tables; history is kept by adding rows. This skill covers the whole lifecycle on any SQL database and is written for any agent: it names no tool of any host, only what you need to be able to do.

## Setup

Reference files. Load each one when a step says so, not all up front:

- `references/constructs.md`: the theory and the construct definitions.
- `references/modeling-practice.md`: how to ask the user about the domain, what to check before presenting a model, and how to present it. Load it at R1, R2, G1, G2 and E2.
- `references/model-xml.md`: the model XML, how to write it, and what the generator checks.
- `references/generator.md`: the generator (`generators/anchor-generator-<database>.js`): what it is, and every way to run it. Load it when generating DDL.
- `references/targets.md`: the databases: what the generator has for each, how names, types and quoting differ, what is enforced, and what has been run on a real server. Load it as soon as the database is known.
- `references/by-hand.md`: the shape of every table and perspective, for writing DDL without the generator (uni-temporal only).
- `references/loading.md`: incremental, idempotent loads, and how to roll one back.
- `references/naming-conventions.md`: the names of everything the model generates.
- `references/metadata.md`: what the Metadata column is for, and batch tracking.

### What can you do here?

Settle this once, at the start, by looking at what you have, not by asking the user to guess:

1. **Which database?** The user says, or you can see it from the connection or the files. Without an answer, ask. The answer decides the generator file and `targets.md`.
2. **Can you run SQL on it?** A SQL tool, an MCP server, a command-line client (`psql`, `sqlcmd`, `snow`, `bq`, `sqlplus`, `vsql`), or a library. If not, you write SQL and the user runs it; say so once, and do not pretend that anything was run.
3. **Can you run JavaScript?** `node`, `deno`, `bun`, a browser, or any ES5 engine (`references/generator.md` lists ways). If so, run the generator. If not, the by-hand route covers uni-temporal models, and the Anchor Modeler (the online modeler linked from `https://www.anchormodeling.com/`, or `index.html` of `https://github.com/Roenbaeck/anchor` served by any web server; *Generate SQL*) gives the user the same script as the generator does.

Say which of these you found, in a sentence, before the first step.

## Intent detection

| Intent | Triggers | Go to |
|--------|----------|-------|
| REVERSE-ENGINEER | "reverse engineer", "convert to anchor", "anchor model from", "from this database", "from these files" | [R1](#r1-discover-the-source) |
| GENERATE | "generate DDL", "create anchor model", "build anchor model", "new anchor model" | [G1](#g1-gather-the-domain) |
| QUERY | "query anchor", "how to query", "perspective", "latest view", "point in time" | [Q1](#q1-identify-the-model) |
| EXTEND | "add attribute", "add anchor", "add tie", "add knot", "extend model", "new property" | [E1](#e1-identify-the-target) |
| LOAD | "load data", "populate", "insert data", "load from source", "fill anchor model" | [L1](#l1-plan-the-load) |
| EXPLAIN | "explain anchor", "what is a knot", "how does", "anchor modeling concept" | [X1](#x1-explain) |

---

## Reverse-engineer

### R1: Discover the source

1. Ask for the source: a database and schema, or files.
2. Introspect it with what the database offers: `INFORMATION_SCHEMA` (most databases), or the catalog of the database, for tables, columns, keys, foreign keys and comments; for files, read a header and a sample and then ask the data (aggregates, not ten rows).
3. Build a catalog of entities, their columns, relationships (from foreign keys or naming) and candidate lookup tables.
4. Test your guesses against the data (`references/modeling-practice.md`, *Asking the data*): is each candidate key unique and never empty, is each relationship one-to-many or many-to-many, which columns hold a short stable list of values, which tables show that something changes. Keep the results as evidence.

**⚠️ STOP**: Present the entities and relationships, with what the data showed (and the surprises, as questions), for confirmation before modeling.

### R2: Propose the model

Load `references/constructs.md` and `references/modeling-practice.md`.

- Each entity with a surrogate or natural key → **anchor** (2-letter mnemonic).
- **Every anchor has at least one identifier attribute**: a static attribute that holds the source's natural key. Without it a load cannot map source rows to surrogate ids. A nexus needs one too, for the source key of the event.
- Each column → **attribute** (3-letter mnemonic). Static or historized: a snapshot shows nothing about change, so ask which properties change, in the user's words.
- A column that references a small lookup list → **knot** and a knotted attribute. If a dimension has both a code and a description and both are needed, make it an anchor with a code attribute and a historized description attribute.
- Each foreign key or join table → **tie**; cardinality from the keys. A join table with properties of its own, or events → **nexus**.

Present the model as the practice file says (*Presenting the model*): sentences in the user's words, examples with the case the model does not allow, assumptions, open questions with your proposed answers, and then the table of constructs.

**⚠️ STOP**: Approval of the sentences, the examples, the assumptions and the answers, not only the table.

### R3: Generate

Go to [G3](#g3-generate-the-ddl) with the approved model.

---

## Generate

### G1: Gather the domain

Load `references/modeling-practice.md`.

1. Ask the user to describe the domain: the main things, what they know about each, how they relate. Use any document, spreadsheet or system they point at, and test what you read in it against the data.
2. Work out what they have not settled: what has an identity and how two are told apart, which properties change and whose history is wanted, which values come from a short fixed list, how many of one relate to how many of another, which relationships are happenings with details of their own, and whether the model must tell what was true from what was known (uni, bi, crt).
3. Ask about those as the practice file says: in the user's words, an example from their domain and your own guess in each question, the costliest first, at most five in a round. Assume the cheap ones and say so.

**⚠️ STOP**: Confirm the understanding of the domain, as sentences, before designing.

### G2: Design the model

Load `references/constructs.md` and `references/modeling-practice.md`.

1. Mnemonics: 2 letters for anchors and nexuses, 3 for attributes and knots.
2. Ties with role names that read as a sentence.
3. Historization of each attribute and tie from what the user said; where they did not say, the cautious default, listed as an assumption.
4. A description for every construct, from the confirmed sentence, in the user's words (it becomes a comment on the table).
5. Check the model against the practice file (*Check before you present*), fix what it finds, then present it as it says.

**⚠️ STOP**: Approval of the design: sentences, examples, assumptions and answers.

### G3: Generate the DDL

Load `references/targets.md` for the database, then:

- **The database has a generator file and you can run JavaScript:** load `references/generator.md` and `references/model-xml.md`. Write the model XML from the approved design, starting from `AnchorGenerator.metadataElement()`, run `check` and then `generate`, and present the script. It is the same text as the Anchor Modeler's *Generate SQL*, for uni, bi and crt.
- **No generator file** (BigQuery, Oracle, and anything else) **or no way to run it:** for a uni-temporal model use `references/by-hand.md`, adapted to the database with `targets.md`, and say that the script is hand-written and has not been checked by the generator. For bi and crt, tell the user that the generator is needed, and how to get the script from the Anchor Modeler; ask before improvising.

If `check` or `generate` says the model has problems, correct the model as the list says and run it again. Never run a script from a call that failed.

**⚠️ STOP**: Present the DDL for review before running it.

### G4: Run the DDL

Run the approved script in order. A script from the generator is already in dependency order. Split it into statements with care: a function body between `$$ ... $$`, `BEGIN ... END` or a `GO` line is one batch (`references/generator.md`, *Running the script*). If a statement fails, stop and show the user the statement and the message; **do not edit generated SQL to get past it**, since a fix belongs in the generator's templates (report it: `https://github.com/Roenbaeck/anchor/issues`).

If you cannot run SQL, hand the script to the user as a file, and say in what order to run it.

---

## Query

### Q1: Identify the model

Load `references/naming-conventions.md`. Ask which database and schema hold the model. Classify the objects by **kind and column structure**, not by name alone (names may be upper-cased by a database that folds case):

- Only `{X}_ID` and `Metadata_{X}` → anchor. An id, one value column that is unique, and metadata → knot. An id, role columns `{T}_ID_{role}` and metadata → nexus. Only role columns, optional `…_ChangedAt`, and metadata → tie.
- An owner column `{AN}_{ATR}_{AN}_ID` → attribute; with `…_ChangedAt` it is historized; with `{AN}_{ATR}_{KNT}_ID` instead of a value column it is knotted.
- Views and functions prefixed `l`, `p`, `n`, `d` over an existing table's name are the perspectives. Table and view comments say what each object is: use them.

### Q2: Write the query

- Current state: the **latest** perspective (`lXX_…`), a view that joins the pieces. Point in time: the **point-in-time** perspective (`pXX_…(timestamp)`, a function). Change tracking: the **difference** perspective (`dXX_…(from, to)`). A simple lookup: the tables.
- Explain what the perspective joins. Pass timestamps in UTC. `targets.md` says which perspectives each database has and how to call them.

---

## Extend

### E1: Identify the target

Find the model (as in Q1) and ask what to add: an anchor, attribute, knot, tie or nexus. Introspect the existing objects to see the mnemonics in use.

### E2: Design the extension

Load `references/constructs.md`, `references/naming-conventions.md` and `references/modeling-practice.md`. A new construct raises the same questions of meaning as a new model (a thing or a property, how many relate, does it change), asked and confirmed the same way.

- A new attribute: a 3-letter mnemonic not yet used on that anchor. A new anchor or nexus: a 2-letter mnemonic not yet used in the model, and an identifier attribute. A new tie: from the existing mnemonics and role names.
- Generate DDL for the new objects **and the perspectives they change**. With the generator, add the construct to the model XML and generate again: it makes the whole script, and the objects that exist are left as they are by `IF NOT EXISTS` (or the database's form of it, `targets.md`). A name that already exists with another structure is compared, and the difference reported, not assumed away.

**⚠️ STOP**: Approval of the extension DDL.

### E3: Apply

Run the DDL, recreate the perspectives that changed, and extend the load (L1) with the new tables.

---

## Load

Load `references/loading.md`, `references/naming-conventions.md` and `references/metadata.md`.

### L1: Plan the load

A load is **incremental and idempotent**: it appends what is new or changed and never truncates, so running it twice with the same data changes nothing. Say which way the user's database loads (`targets.md`): through the latest views with triggers (SQL Server, PostgreSQL), or into the tables with every insert guarded (Snowflake, Vertica, and any database without triggers). Plan the order from the dependencies: knots, then anchors and nexuses and their identifier attributes, then the other attributes and the ties.

**⚠️ STOP**: Present the plan, the order and the load SQL for approval.

### L2: Run and verify

Run it as the user's scheduler or orchestrator does (`references/loading.md` says what the common ones need). Verify with row counts and the integrity checks of the database (`targets.md`). A full rebuild destroys history: run a truncate only after explicit confirmation.

---

## Explain

### X1: Explain

Load `references/constructs.md`. Cover the concept asked about with an example from the user's domain or the one in `references/constructs.md`, and: why Anchor Modeling (no `ALTER TABLE`, history built in, narrow tables), when to use what (anchor or knot, tie or nexus, static or historized), and the perspectives (latest for dashboards, point-in-time for audits, difference for changes).

---

## Pitfalls that hold on every database

- **Constraints are not enforced everywhere.** Some databases keep primary and foreign keys as metadata only; then every load has to filter out rows that exist, and the integrity checks matter (`targets.md`).
- **Quote names exactly as generated.** The generator writes names in the database's quoting form to keep their case and national characters; copy them, do not retype them in another case (`references/naming-conventions.md`).
- **Time is UTC.** `ChangedAt` and `PositedAt` hold UTC; use the database's UTC function for *now*. Check what the session's time zone does before using a local function.
- **Source decimals and dates may be text** in a locale: convert explicitly when loading numbers and dates from text.
- **Never edit generated SQL to get past an error**, and never run a script from a failed generator call.
- **Do not invent what has not been run.** `targets.md` lists what has been run on a real server for each database; say so when the user's database is one that has not.

## Stopping points

- ✋ After R1: source discovery confirmed
- ✋ After R2/G2: model design approved
- ✋ After G3: DDL reviewed
- ✋ After E2: extension DDL approved
- ✋ After L1: load plan and SQL approved
- ✋ Before any truncate or full rebuild: explicit confirmation

## Output

A model as XML, DDL scripts that are ready to run, load statements, or query guidance for an existing model.
