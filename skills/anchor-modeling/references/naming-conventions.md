# Anchor Modeling naming conventions

The names that a model makes, which are the same on every database. The generator writes them for you; this is for reading a model, extending one, and writing queries and loads that must name its objects exactly.

## Quoting and case

**Write every name that comes from the model in the database's quoting form** (`targets.md`): `[name]` in SQL Server, `"name"` in Snowflake, PostgreSQL and Vertica. The generator does, to keep the case of a name and to allow national characters (`FTG_Företag`).

- In the databases that fold unquoted names (to upper case in Snowflake, to lower case in PostgreSQL) a quoted name is **case sensitive**: `"AC_Actor"` is not `AC_ACTOR`. Copy names from the generated DDL; do not retype them in another case and do not mix quoted and unquoted forms for one object.
- Catalog views return the names as they were created, so a perspective's prefix can be told from a mnemonic by case (`lAC_Actor`). A database made without quotes has names in one case, and for that one classify objects by kind and structure (`SKILL.md`, Q1), not by name.
- The schema is written as the model gives it; a schema that needs quoting is written quoted, and has to be created with exactly that name.
- Switching a model from unquoted to quoted names makes a **second set** of objects (`IF NOT EXISTS` does not see the old ones): drop or rename the old ones first.
- If an audience wants all-ASCII names, transliterate them in the model (ö→o, å→a, ä→a); they are still quoted.
- PostgreSQL allows 63 bytes in a name. The generator keeps within it; a hand-written name must too.

## Mnemonics and descriptors

| Construct | Length | Scope | Case | Examples |
|-----------|--------|-------|------|----------|
| Anchor | 2 letters | unique in the model | UPPERCASE | AC, ST, PR, PN |
| Nexus | 2 letters | unique in the model (the same pool as anchors) | UPPERCASE | EV |
| Attribute | 3 letters | unique within its anchor or nexus | UPPERCASE | NAM, GEN, DAT |
| Knot | 3 letters | unique among all knots (and not shared with an anchor or nexus) | UPPERCASE | GEN, RAT, UTL |

Descriptors are PascalCase: `Actor`, `Stage`, `ProfessionalLevel`, `EventType`.

## Table names

| Object | Pattern | Example |
|--------|---------|---------|
| Knot | `{KNT}_{Descriptor}` | `RAT_Rating` |
| Anchor | `{AN}_{Descriptor}` | `AC_Actor` |
| Nexus | `{NX}_{Descriptor}` | `EV_Event` |
| Attribute (static, historized or knotted) | `{AN}_{ATR}_{AnchorDesc}_{AttrDesc}` | `AC_NAM_Actor_Name` |
| Tie | `{type}_{role}` for each role, joined by `_` | `AC_part_PR_in_RAT_got` |
| Sequence | `{AN}_{Descriptor}_ID_SEQ` | `AC_Actor_ID_SEQ` |

## Column names

| Column | Pattern | Example |
|--------|---------|---------|
| Anchor, nexus or knot id | `{AN}_ID` | `AC_ID` |
| Knot value | `{KNT}_{Descriptor}` | `GEN_Gender` |
| Attribute owner | `{AN}_{ATR}_{AN}_ID` | `AC_NAM_AC_ID` |
| Attribute value | `{AN}_{ATR}_{AnchorDesc}_{AttrDesc}` | `AC_NAM_Actor_Name` |
| Attribute knot reference | `{AN}_{ATR}_{KNT}_ID` | `AC_GEN_GEN_ID` |
| Changing time | `{AN}_{ATR}_ChangedAt` (a tie: `{tie_name}_ChangedAt`) | `AC_NAM_ChangedAt` |
| Metadata | `Metadata_{AN}`, `Metadata_{AN}_{ATR}`, `Metadata_{tie_name}` | `Metadata_AC_NAM` |
| Role column (tie or nexus) | `{type}_ID_{role}` | `AC_ID_part` |

In bi and crt the attribute and tie tables are split in a posit table and an annex table (`..._Posit`, `..._Annex`) with `PositedAt`, `Reliability` and, in crt, `Positor`; the suffixes are settings in the model's metadata.

## Roles and ties

Role names are camelCase and read as a sentence with the anchors: "Actor **part** Program **in**, **got** Rating" gives `AC_part_PR_in_RAT_got`. A role is unique within its tie.

## Perspectives

| Perspective | Prefix | Pattern | Is a |
|-------------|--------|---------|------|
| Latest | `l` | `l{AN}_{Descriptor}` | view |
| Point in time | `p` | `p{AN}_{Descriptor}(time)` | function |
| Now | `n` | `n{AN}_{Descriptor}` | view |
| Difference | `d` | `d{AN}_{Descriptor}(from, to)` | function |
| Time traveling (bi, crt) | `t` | `t{AN}_{Descriptor}(...)` | function |

Ties have the same prefixes over the tie's name: `lAC_part_PR_in_RAT_got`. Not every database makes every perspective (`targets.md`).

## Constraint names

| Constraint | Pattern | Example |
|-----------|---------|---------|
| Primary key | `pk{TableName}` | `pkAC_Actor` |
| Unique | `uq{TableName}` | `uqRAT_Rating` |
| Foreign key, attribute to owner | `fk{TableName}` | `fkAC_NAM_Actor_Name` |
| Foreign key, attribute to knot | `fk_{AN}_{ATR}_{KNT}` | `fk_AC_GEN_GEN` |
| Foreign key, tie role | `{TieName}_fk{type}_{role}` | `AC_part_PR_in_RAT_got_fkAC_part` |
| Foreign key, nexus role | `{NexusName}_fk{type}_{role}` | `EV_Event_fkST_wasHeldAt` |

## Comments

Every table and view has a comment that describes what an instance **is**, not how it is stored. Perspectives inherit the comment of their anchor, nexus or tie. It comes from the `<description>` of the construct in the model.
