# Anchor Modeling skill

An agent skill for [Anchor Modeling](https://www.anchormodeling.com/) that works with **any agent** and **any SQL database**. It covers the whole lifecycle of an Anchor model:

- **Reverse-engineer** an existing database or files into an Anchor model
- **Design** a model with the user, by asking about the domain in plain words and confirming sentences and examples, not diagrams
- **Generate** the DDL: knots, anchors, nexuses, attributes, ties, perspectives and triggers, for uni-, bi- and concurrent-reliance-temporal models, with the bundled generator (SQL Server, Snowflake, PostgreSQL, Vertica, BigQuery), or by hand for a uni-temporal model on any other database
- **Load** data incrementally and idempotently, and roll a batch back
- **Query** a model through its perspectives, **extend** it without altering existing tables, and **explain** it

The skill is written in the open [Agent Skills](https://agentskills.io/specification) format (`SKILL.md` with `name` and `description`, and reference files next to it). It names no tool of any host: it says what the agent needs to be able to do (run SQL, run JavaScript) and what to do when it cannot. The naming conventions follow the [Anchor Modeler](https://github.com/Roenbaeck/anchor), whose code generates the scripts.

For Snowflake with Cortex Code there is also [anchor-snowflake-skill](https://github.com/Roenbaeck/anchor-snowflake-skill), which has task-graph loading and a generator that runs inside Snowflake. This skill is the one for every other combination.

## Contents

```
skills/anchor-modeling/
  SKILL.md                  entry point: what the agent can do here, intent detection, step-by-step workflows
  references/
    constructs.md           the theory and the construct definitions
    modeling-practice.md    how to ask about the domain, what to check, how to present a model
    model-xml.md            the model XML, how to write it, and what the generator checks
    generator.md            the generator and every way to run it
    targets.md              the databases: what each has, how names and types differ, what has been run
    by-hand.md              the shape of every table and perspective, for writing DDL without the generator
    loading.md              incremental, idempotent loads (through triggers, or into the tables)
    naming-conventions.md   the names of everything a model generates
    metadata.md             the Metadata column, batch tracking and rollback
  generators/
    anchor-generator-sqlserver.js      the Anchor generator, one self-contained ES5 file per database
    anchor-generator-snowflake.js
    anchor-generator-postgresql.js
    anchor-generator-vertica.js
    run.js                             a command-line wrapper for Node
```

## Installation

Copy the folder `skills/anchor-modeling` (keeping `SKILL.md`, `references/` and `generators/` together) into the skills directory of your agent. The format is the same everywhere; the directory is not, so check your host's documentation. Common ones:

| Host | Project directory | Notes |
|---|---|---|
| Claude Code | `.claude/skills/anchor-modeling/` | or `~/.claude/skills/` for every project |
| Snowflake Cortex Code | `.snowflake/cortex/skills/anchor-modeling/` | |
| Hosts that read the shared directory (several do) | `.agents/skills/anchor-modeling/` | |
| GitHub Copilot, Cursor, Gemini CLI, Codex | their own skills directory | see their documentation |

A host that has no skills but reads an `AGENTS.md` can use the one in this repository: it points at `skills/anchor-modeling/SKILL.md`. A host with neither: give the agent `SKILL.md` and tell it to read the files in `references/` when `SKILL.md` says so.

## The generator

`generators/anchor-generator-<database>.js` is the code of the Anchor Modeler's *Generate SQL*, built into one file per database. It is **plain ES5 with no dependencies, no file system, no network and no browser**: model XML in, SQL script out, the same text the modeler gives. Any JavaScript runtime runs it (Node, Deno, Bun, a browser, Jint, QuickJS, a database's JavaScript functions); the skill tells the agent to find out which one it has, and `references/generator.md` lists the ways. With Node:

```
node generators/run.js postgresql --starter > model.xml       # a small model to start from
node generators/run.js postgresql --check model.xml           # what is wrong with it, or ok
node generators/run.js postgresql model.xml bi > script.sql   # the script
```

The files are generated, not written: `tools/build-portable-generator.ps1` in the [Anchor repository](https://github.com/Roenbaeck/anchor) builds them from the same templates that the modeler runs, and the sisula repository's `tools/portable-check.ps1` runs each one on every test model of its database and compares the script with the approved output, character for character. The commit a file was built from is in its first line and in `AnchorGenerator.version`.

| Database | Generator | What has been run on a real server |
|---|---|---|
| SQL Server | uni, bi, crt | yes |
| Snowflake | uni, bi, crt | yes |
| PostgreSQL | uni, bi, crt | yes (PostgreSQL 16) |
| Vertica | uni, bi, crt | no |
| BigQuery | uni, bi, crt | no |
| Oracle | none: the modeler has generators for it that were never run and have known defects | no |
| any other | none: by hand (uni), or adapt the closest generator | no |

## Requirements

- Any agent that can read these files.
- To run the generator: a JavaScript runtime. Without one the skill falls back to the by-hand route (uni-temporal models) or asks the user to generate the script in the Anchor Modeler.
- To run the DDL and the loads: a way to run SQL on the database (a tool, an MCP server or a command-line client). Without one the skill writes the SQL and the user runs it.

## Limitations

- Loading patterns are written for uni-temporal models, and for loading through the triggers of SQL Server and PostgreSQL in all three temporalizations. Bitemporal and concurrent-reliance-temporal loads into the tables are not written; the skill says so and asks.
- Natural-key views, integrity checks and triggers exist only where `references/targets.md` says so.
- A hand-adapted script for a database without a generator has not been run by anyone, and the skill says that every time.

## Updating the generators

Rebuild them from the Anchor repository (`tools/build-portable-generator.ps1 -Output skills/anchor-modeling/generators`) and run `portable-check.ps1` in the sisula repository, or take the files of a newer version of this repository.

## License

MIT. See `LICENSE`.
