# Constraints beyond the keys

Load this when the user states a rule that the model should enforce: "names are unique", "no two performances on the same stage on the same day", "a customer must not...", or asks how to validate data. The pattern is the author's (*Sources* at the end); its SQL Server form is his, the others are translations that nobody has run yet, and each says so.

## What the generated model already enforces

Do not rebuild these:

- **Identity and shape:** primary keys (an anchor's identity; an attribute's owner, plus the changing time if historized; a tie's identifiers, plus the changing time), foreign keys to anchors, knots and nexuses, no NULLs, a knot's values unique. Where a database keeps keys as metadata only (`targets.md`), the integrity checks and the loads' own filters stand in for them.
- **Versions, with triggers where the database has them:** a row that is already there is not stored again, another value at a time that already has one is a contradiction, and a value that repeats the one before it is skipped (idempotent) or refused (restatement), as the model says.
- **How many:** a tie's identifiers say how many of each can relate at the same time.

What is left is the user's own rules: a value that must be unique across things, a combination that must not repeat, a range, a rule that spans several tables.

## The principle

In a historized model **a constraint has to hold in every time slice**, not in the rows that happen to be in the table. A name that is unique today and was used by another stage last year is a violation in last year's slice only if both were in effect then. So:

- **Do not use a CHECK constraint or a unique index** for a rule over a historized value. They see rows, not slices, and checking every time point that exists is a very large number of checks.
- **Check when a row is inserted, and only the slices that the row touches:** an AFTER INSERT trigger on the table that can break the rule, which evaluates the **point-in-time perspective** of the affected anchor at the inserted row's changing time (`p<Anchor>(timestamp)`: the whole anchor as it was then) and raises an error, which rolls the transaction back.
- **In bi, check the slices of both timelines; in crt, every positor's slice.** The point-in-time perspective takes the arguments for that: read them from the generated script.
- **A non-historized construct has no slices:** read the table or the latest view and leave the time out.

## Pattern 1: a value that must be unique (SQL Server)

The author's example is that no two stages share a name. The trigger sits on the attribute table, and the check is the point-in-time perspective of the stage at the time of each inserted row:

```sql
CREATE TRIGGER uq_ST_NAM_Stage_Name
ON [dbo].[ST_NAM_Stage_Name]
AFTER INSERT
AS
IF EXISTS (
    SELECT i.ST_NAM_Stage_Name
    FROM inserted i
    CROSS APPLY (
        SELECT st.ST_NAM_Stage_Name
        FROM [dbo].[pST_Stage](i.ST_NAM_ChangedAt) st
        WHERE st.ST_ID <> i.ST_NAM_ST_ID
        AND   st.ST_NAM_Stage_Name = i.ST_NAM_Stage_Name
    ) ts
)
BEGIN
    DECLARE @msg varchar(2047) = 'Duplicate stage name found.';
    RAISERROR (@msg, 16, 1);
    ROLLBACK TRANSACTION;
    RETURN;
END;
```

## Pattern 2: a rule across a tie

*No two performances on the same stage on the same day.* The date is an attribute of the performance and the stage is on a tie (`PE_wasHeld_ST_at`). The same trigger shape, with the tie joined: the trigger on the date attribute joins the tie of each inserted performance to the stage, and looks among the other performances on that stage (through the latest views, or the point-in-time perspectives if they are historized) for one with the same day (`DATEDIFF(day, ...) = 0`). Make the rule independent of the order of loading in one of two ways:

1. **Load in this order:** create the identities of the performances, fill the tie, then fill the attributes. The trigger on the attribute then finds the tie. Wrap the steps in **one transaction**, so that a failure leaves what was there before.
2. **Or put a second trigger on the tie**, which joins the date attribute and checks the same thing. If the attributes arrive first, their trigger finds no tie and passes; the tie's trigger catches it.

## The same rule in other databases

- **PostgreSQL** (not run): a statement-level AFTER INSERT trigger with a transition table, which calls the point-in-time function:

  ```sql
  CREATE FUNCTION uq_ST_NAM_Stage_Name() RETURNS trigger AS $$
  BEGIN
      IF EXISTS (
          SELECT 1 FROM inserted i
          CROSS JOIN LATERAL "pST_Stage"(i."ST_NAM_ChangedAt") st
          WHERE st."ST_ID" <> i."ST_NAM_ST_ID" AND st."ST_NAM_Stage_Name" = i."ST_NAM_Stage_Name"
      ) THEN RAISE EXCEPTION 'Duplicate stage name found.'; END IF;
      RETURN NULL;
  END $$ LANGUAGE plpgsql;
  CREATE TRIGGER "uq_ST_NAM_Stage_Name" AFTER INSERT ON "ST_NAM_Stage_Name"
  REFERENCING NEW TABLE AS inserted FOR EACH STATEMENT EXECUTE FUNCTION uq_ST_NAM_Stage_Name();
  ```

- **Oracle** (not run): a row-level trigger cannot read its own table (ORA-04091). Put the check in the `AFTER STATEMENT` section of a compound trigger, which collects the inserted keys in `AFTER EACH ROW`.
- **Snowflake, BigQuery, Vertica and any database without triggers on tables:** nothing stops the insert, so the same rule becomes a **violation query** that the load runs after every batch (the way the generated integrity checks work) and treats as a failure. It needs no point-in-time function, which not every database can call with a column as its argument. For uniqueness of an attribute `A` of `owner`, with changing time `t` (checked on Snowflake on a small example, where it found exactly the conflicts that were there, including a value taken by two owners after one of them had changed it, and not a value reused after it had stopped being in effect):

  ```sql
  SELECT i.owner, o.owner AS other_owner, i.value, i.t
  FROM   attr i
  JOIN   attr o ON o.value = i.value AND o.owner <> i.owner AND o.t <= i.t
  WHERE  NOT EXISTS (SELECT 1 FROM attr n WHERE n.owner = o.owner AND n.t > o.t AND n.t <= i.t)  -- o's version is in effect at i.t
  ```

  A row is a violation: two different owners have the value at the same time. A rule over a non-historized attribute needs only the latest view: `GROUP BY value HAVING COUNT(DISTINCT owner) > 1`.

## How to add a rule

1. **Ask what the rule means in time**, in the user's words, with the case that must fail: "Can two stages have the same name at the same time? Can a stage that was closed give its name to a new one?" A rule that holds only *now* and a rule that holds *in every slice* are different, and the second is stricter.
2. **Choose the mechanism** from the database: trigger, compound trigger or violation query, as above. Say which one and why.
3. **Keep the rule's SQL in its own file next to the model XML, not in the generated script**, named for what it enforces (`uq_...`). Generated SQL is never edited (`SKILL.md`), and the generator does not know the rule, so it survives regeneration only if it is a separate script. Run it after the model's script, and again after a change that recreates the tables it sits on.
4. **Test it with three inserts:** one that must be accepted, one that must be refused, and one that reuses a value after it has stopped being in effect (accepted).
5. **Rules of other shapes** (a value range, a value that must exist, a rule over several tables) have the same form: a trigger on the table that can break it, or a violation query, checking the slices of the rows inserted. These shapes are not in the author's examples and have not been run.

## Sources

*Implementing constraints* (`https://www.anchormodeling.com/implementing-constraints/`, with its script), *Modified Trigger Logic* (AFTER triggers instead of CHECK constraints for version rules), *Temporal Entity Integrity*.
