# The Anchor generator

The generator turns an Anchor model (XML, `model-xml.md`) into the whole SQL script for a database: tables, keys, perspectives, triggers and the rest. It is the code of the [Anchor Modeler](https://github.com/Roenbaeck/anchor)'s *Generate SQL*, built into one self-contained file for each database, so the script is the same text that the modeler gives. Use it instead of writing DDL: it is faster, it covers bitemporal and concurrent-reliance-temporal models, and it keeps to the conventions a model is read by.

## The files

In `generators/`, next to this skill's other files:

| File | Database | Temporalizations |
|------|----------|------------------|
| `anchor-generator-sqlserver.js` | SQL Server | uni, bi, crt |
| `anchor-generator-snowflake.js` | Snowflake | uni, bi, crt |
| `anchor-generator-postgresql.js` | PostgreSQL | uni, bi, crt |
| `anchor-generator-vertica.js` | Vertica | bi, crt |

Other databases have no file: see `targets.md`. **Never read a generator file into the conversation**: each is 0.2 to 1.1 MB. Run it, and work with its output in files.

A file is plain ES5. It has no dependencies and uses no file system, network or browser. It defines one object, `AnchorGenerator` (also `module.exports` where there is a module system):

| | |
|---|---|
| `AnchorGenerator.generate(modelXml, t)` | the SQL script, one string. `t` is `'uni'`, `'bi'`, `'crt'` or `null` (what the model says). Throws an `Error` whose message says what is wrong with the model |
| `AnchorGenerator.check(modelXml)` | `null` if the model is fine, else the text that says what is wrong |
| `AnchorGenerator.metadataElement()` | the `<metadata .../>` element of a new model for this database (`model-xml.md`) |
| `AnchorGenerator.defaults()` | the same settings, as an object |
| `AnchorGenerator.bindings(modelXml, t)` | the JSON that the templates render (the modeler's *Generate > JSON bindings*), for looking at what a template sees |
| `AnchorGenerator.target`, `.temporalizations`, `.version` | which database, which temporalizations, and which Anchor commit it was built from |

It is deterministic and has no side effects: the same model gives the same script.

## Running it

Pick the first that works in your environment. Say which you used.

**1. Node, with the wrapper.** Needs only `node`.

```
node generators/run.js postgresql model.xml bi > script.sql        # the script, to a file
node generators/run.js postgresql --check model.xml                # what is wrong with the model, or ok
node generators/run.js postgresql --starter > model.xml            # a small model to start from
node generators/run.js --list                                      # the databases, and their temporalizations
```

**2. Any JavaScript runtime (Node, Deno, Bun, a browser's console, ...), without the wrapper.** Read the file as text and evaluate it; `Function` exists in all of them:

```js
const code = readText('generators/anchor-generator-postgresql.js');            // readFileSync, Deno.readTextFile, Bun.file(...).text()
const AnchorGenerator = new Function(code + '\n;return AnchorGenerator;')();
const sql = AnchorGenerator.generate(readText('model.xml'), 'bi');
writeText('script.sql', sql);
```

In a browser, a `<script src="anchor-generator-postgresql.js">` defines the global `AnchorGenerator`.

**3. Another ES5 engine.** Anything that runs ES5 runs it: Jint (.NET), QuickJS, Rhino, GraalJS, V8 through a binding, the JavaScript function of a database. For example with Jint from PowerShell, where `Jint.dll` is a Jint build (tested with 2.11):

```powershell
Add-Type -Path Jint.dll
$engine = New-Object Jint.Engine
[void] $engine.Execute([IO.File]::ReadAllText('generators/anchor-generator-postgresql.js'))
[void] $engine.SetValue('modelXml', [IO.File]::ReadAllText('model.xml'))
[void] $engine.Execute("var sql = AnchorGenerator.generate(modelXml, 'bi');")
[IO.File]::WriteAllText('script.sql', $engine.GetValue('sql').AsString())
```

**4. No way to run JavaScript.** For a uni-temporal model use `by-hand.md`. Otherwise the user opens the Anchor Modeler (the online modeler linked from [anchormodeling.com](https://www.anchormodeling.com/), or `index.html` of the [Anchor repository](https://github.com/Roenbaeck/anchor) served by any web server) in a browser, loads the model XML, picks the database and temporalization, and takes *Generate SQL*: the same script. Ask them for it, and do not improvise bi or crt DDL.

Write the model to a file and the script to a file. A script is hundreds of kilobytes for a real model: do not paste it into the conversation, show the user the file and a summary (how many tables, perspectives, triggers).

## What to do with an error

- `The model has N problems, so nothing was generated:` followed by a list. Each line says where (`anchor AC, attribute NAM:`) and what. Correct the model and run again. The list is complete, so most models need one round.
- `XML, line L column C: ...`: the XML is not well formed.
- `The temporalization has to be one of ... for <database>`: that database has no such generator file (Vertica has no `uni`).
- An error that does not look like a problem with the model, or a script that contains the text `undefined`: a defect in the generator. Do not run the script, and report it with the model that causes it at `https://github.com/Roenbaeck/anchor/issues`.

## Running the script

A script has several statements and, for most databases, bodies of functions and triggers that contain semicolons. Use a client that runs a whole file, not one that splits on `;`:

| Database | Run the file with | Note |
|---|---|---|
| SQL Server | `sqlcmd -i script.sql` (or SSMS) | the script uses `GO` between batches, which only these clients understand; a library that sends the text as one command fails |
| PostgreSQL | `psql -f script.sql` | functions are in `$$ ... $$` |
| Snowflake | `snow sql -f script.sql --enable-templating NONE`, or the worksheet | the Snowflake CLI otherwise reads `&` as a variable and changes the text; functions are in `$$ ... $$` |
| Vertica | `vsql -f script.sql` | not run on a server by the generator's authors: `targets.md` |

If the host runs SQL through a tool that takes one statement, split the script on `;` that is **outside** `$$ ... $$` and outside `BEGIN ... END`, and on `GO` lines for SQL Server, and run the statements in order. Run it in an empty schema or a scratch database first. **If a statement fails, stop and show the user the statement and the message; do not edit generated SQL to get past it.**

## Updating

The files are generated by `tools/build-portable-generator.ps1` in the Anchor repository (the commit is in `AnchorGenerator.version` and in the first line of each file). To update, take the files of a newer version of this skill.
