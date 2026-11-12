# The Anchor Model XML

The input to the generator (`generator.md`). It is the XML that the [Anchor Modeler](https://github.com/Roenbaeck/anchor) saves: open the modeler, build or load the model, and take *Generate > XML code* (or the saved `.xml` file). Prefer that to writing XML by hand when the user has the modeler. When there is no model yet, design it with the user (G1, G2 in `SKILL.md`) and write the XML from the approved design.

`node generators/run.js <database> --starter` prints a small, complete model for a database to start from (the same as `AnchorGenerator.metadataElement()` plus a knot, an anchor and a historized attribute, with that database's data types).

## Structure

```xml
<schema format="0.101.2">
  <metadata .../>                      <!-- the settings of the whole model; complete, see below -->
  <description>...</description>       <!-- optional -->
  <knot mnemonic="GEN" descriptor="Gender" identity="tinyint" dataRange="varchar(42)">
    <metadata capsule="public" generator="false"/>
    <description>...</description>
  </knot>
  <anchor mnemonic="AC" descriptor="Actor" identity="int">
    <metadata capsule="public" generator="true"/>
    <attribute mnemonic="NAM" descriptor="Name" timeRange="datetime" dataRange="varchar(42)">
      <metadata capsule="public"/>     <!-- timeRange makes it historized -->
    </attribute>
    <attribute mnemonic="GEN" descriptor="Gender" knotRange="GEN">
      <metadata capsule="public"/>     <!-- knotRange makes it knotted -->
    </attribute>
  </anchor>
  <nexus mnemonic="EV" descriptor="Event" identity="int"> ... </nexus>   <!-- like an anchor, plus <role> elements -->
  <tie timeRange="datetime">           <!-- timeRange makes it historized -->
    <role role="part" type="AC" identifier="true"/>
    <role role="in" type="PR" identifier="true"/>
    <metadata capsule="public"/>
  </tie>
</schema>
```

The data types (`identity`, `dataRange`, `timeRange`) and the schema (`capsule`) are the **database's own**: `targets.md` lists them. `public` above is PostgreSQL's, Snowflake's and Vertica's default schema; SQL Server's is `dbo`. A model made for one database does not take another's types: change them (the Anchor Modeler converts them when you switch the database; the generator does not).

| Construct | Mnemonic | Naming |
|-----------|----------|--------|
| knot | 3 letters | `{KNT}_{Descriptor}` |
| anchor | 2 letters | `{AN}_{Descriptor}` |
| attribute | 3 letters | `{AN}_{ATR}_{AnchorDescriptor}_{AttributeDescriptor}` |
| tie | none; the name is built from its roles | `{type}_{role}_{type}_{role}...` |

- `dataRange` is a data type of the database (`varchar(42)`, `decimal(19,4)`, `timestamp`). `identity` is the type of the surrogate id of the construct. `timeRange` on an attribute or tie is the type of its changing time.
- A role of a tie names a construct by its mnemonic in `type`; a role on a knot takes the knot's mnemonic. `identifier="true"` marks the roles that identify a tie row.
- An attribute that holds the natural key of its anchor (every anchor needs one, see R2 in `SKILL.md`) is marked in the modeler's XML with `<key>` and `<identifier>` elements. They are not needed to get the DDL, and keep them when the XML comes from the modeler. Keys make the key views (`targets.md` says which databases have them), so they are worth adding by hand too: `<key stop="1" route="1st" of="{AN}" branch="1"/>` in the attribute, and `<identifier route="1st"/>` in the anchor, after its attributes.
- A key of several values, or through roles and ties, is a route of several `<key>` elements with the same `of` and `route`. Each `branch` is a path from the anchor or nexus to one value, and `stop` numbers the elements across the whole route: an attribute of what the path has reached is a value; a role of a nexus leads from the nexus to its anchor in one stop; a tie takes two stops in a row, the role the path enters it by and the role it leaves it by; a knotted attribute and a knot role give the value of the knot. The rules are in the Anchor repository, `docs/ANCHOR.md`, *Keys and identifiers*.
- `<metadata capsule="..."/>` on a construct is its schema. `generator="true"` on an anchor, a nexus or a knot gives its id a generator (a sequence or an identity column, whichever the database has), which the load patterns draw from.
- A `<description>` on a construct becomes a comment on its table and views.
- `<layout>` elements, with `x`, `y` and `fixed`, are positions in the modeler's drawing. The generator ignores them.

## The metadata element

The `<metadata>` directly under `<schema>` holds about fifty settings that decide the whole script: the names of the columns (`metadataPrefix`, `changingSuffix`, `identitySuffix`), the naming convention (`naming`), whether there are metadata columns (`metadataUsage`), equivalence (`equivalence`), checksums, the default for *now* (`now`), the data type of time stamps (`chronon`), whether the model is `uni`, `bi` or `crt` (`temporalization`), and whether there are triggers (`triggers`).

**It has to be complete.** The generator does not fill in a setting that is missing; a missing setting is an error that lists the settings, with the value that the modeler would give each. So:

- Start from `AnchorGenerator.metadataElement()`, which is the modeler's own default for the database of the generator file, and change only what the user asks for.
- If `check` or `generate` says `The model has N problems, so nothing was generated`, correct what it lists and run it again.
- `databaseTarget` is set by the generator, whatever the XML says. A temporalization given as the second argument of `generate` replaces the one in the XML.

## What the generator checks

Before it generates anything, the generator checks the model and lists all the problems it finds, with where they are:

- every setting of `<metadata>` is there, flags are `true` or `false`, `naming` is `original` or `improved`, and `temporalization` is one that the generator has for the database;
- knots, anchors and nexuses have a mnemonic, a descriptor, an identity (and, for a knot, a dataRange), and no two have the same mnemonic (an anchor, nexus or knot do not share one either; the attributes of one anchor or nexus do not either);
- an attribute has either a `dataRange` or a `knotRange`, never both and never neither, and a `knotRange` names a knot of the model;
- a role names an anchor, nexus or knot of the model; a nexus has at least one role that is an anchor, and none of its roles is an identifier;
- a tie has at least two roles that are anchors or nexuses (the same one twice is fine), no two of its roles are the same type with the same role name, and no other tie has the same name;
- a `<key>` is of an anchor or nexus of the model, and every `<identifier route="...">` is made up by keys of that anchor or nexus.

It does not check the meaning of the model (`modeling-practice.md` is for that), that the data types exist in the database, or that an anchor has an attribute that holds its natural key. A data type that the database does not have shows when the script is run: correct the model, not the script.

## Settings that users ask about

| Setting | Values | Effect |
|---------|--------|--------|
| `temporalization` | `uni`, `bi`, `crt` | uni-temporal (changing time only), bitemporal (positing and changing time), concurrent reliance temporal (positing, changing and reliability) |
| `naming` | `improved`, `original` | the naming convention of the Anchor Modeler; `original` gives knotted columns no equivalent or checksum names |
| `metadataUsage` | `true`, `false` | `Metadata_` columns on the tables |
| `equivalence` | `true`, `false` | equivalent knots and attributes, with the views that unfold them (uni only, on the databases that have it: `targets.md`) |
| `checksum` | `true`, `false` | checksum columns on attributes |
| `triggers` | `true`, `false` | the triggers of the latest views, on the databases that make them |
| `now` | an expression of the database | the time that the now perspectives use. It is the database's own: see `targets.md` for what each default means (time zone) |
| `encapsulation` | a schema | the default schema for the objects of the model |
