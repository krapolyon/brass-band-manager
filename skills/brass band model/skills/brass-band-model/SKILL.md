---
name: brass-band-model
description: Data model of the brass band app, in DBML with camelCase names, plus the business dictionary and the MySQL migrations derived from it. Use whenever the work touches business objects, tables, fields, relations, statuses, personal data, a .dbml file, a dictionary entry or a migration, even if the request does not say "data model".
---

# Brass band app: data model

This skill governs the data model of the brass band app: an installable web app (React PWA, framework-free PHP API, MySQL on shared hosting) that a band hosts for itself. The code is meant to be open-sourced and used by other bands, possibly in other countries.

It is versioned in the repository at `skills/brass band model/skills/brass-band-model/SKILL.md`, and loaded by Claude from the owner's account: a change is made in both places. Change it through a commit, like any other file.

## Deliverables

For each domain:

1. **The model**: one DBML file, `model/<domain>.dbml` (`members.dbml`, `songs.dbml`, `gigs.dbml`).
2. **The business dictionary**: one Markdown file with the same name next to it, `model/<domain>.md`, with one entry per business object: meaning, displayed labels, rules, access rights.
3. **The migrations**: once the domain is validated, numbered MySQL scripts in `database/migrations/`, derived from the DBML.

Before any detailed domain, an **overview model** (`model/overview.dbml`) lays out every object at a coarse grain, including those of later features (setlists, rehearsals, song stats, quotes for paid gigs), so that the overall design has something to stand on.

These files stay in the repository and are kept up to date. When a feature or a fix changes the model, the DBML and the dictionary change in the same commit as the migration: a `model/` folder that lags behind the database is worse than none, because the design and the code both read it.

## Roles

- **The project owner** knows the band's way of working and validates every domain. He is not a developer, but he reads SQL fluently and PHP a little: he reviews the migrations himself, and a trade-off can be explained to him in SQL terms.
- **Claude** writes the logical model (what exists, what it means, how it is related, which rules apply) and the physical model (exact types, indexes, constraints, migrations). There is no third-party developer.
- The validated DBML is the reference. A migration never contradicts it: if the SQL has to change, the DBML changes first.

## Language

- **Everything in the repository is in English**: table and field names, notes, the dictionary, comments, commit messages, this skill.
- **Conversation with the project owner is in French.** Questions and summaries addressed to him are written in French.
- **Displayed text is never in the model.** Labels live in the translation files of the app. The dictionary records the English label and the French one, French being the first locale shipped.
- **The band's own vocabulary** (fanfaron, plan, brasser, pupitre) is French-locale wording. The model uses the neutral English term (`member`, `gig`), and the dictionary records the correspondence.

## Method

1. **The owner describes the domain** in free text. Do not interrupt with a questionnaire: start from what he says and from the scoping document.
2. **Claude writes a first draft**: DBML and dictionary. Each assumption is marked `TODO:` in a `Note` and repeated in the list of questions.
3. **Questions**: only those that block the design, grouped, numbered, each with Claude's default proposal.
4. **Iterate** until validation. A domain is validated only when it contains no `TODO:`.
5. **Migrations** are written after validation, never before.
6. **Visualisation**: the owner previews the DBML in VS Code with a DBML extension. Every committed `.dbml` file must therefore parse without error. Do not produce a separate diagram unless he asks for one.

On every change to a validated domain: update the history at the top of the DBML file, write the matching migration, and list the screens affected.

## Non-negotiable rules

1. **camelCase** for everything that has a name: tables, fields, enums, table groups. No snake_case and no PascalCase anywhere in the model or in the SQL. Enum values are the one exception: they are written in UPPERCASE, like constants.
2. **Every piece of personal data is marked** in its note, with its purpose.
3. **No implicit business rule**: a known rule (uniqueness, required value, allowed values, dependency) is written in the model or in the dictionary entry, not left "to the code".
4. **Nothing specific to one band in the model.** Name, logo, colours, default language and Discord settings are instance settings.
5. **One instance, one band, with the band as an object.** Instance settings live in a `band` table that holds a single row. Other tables carry no `bandId` for now. This keeps a later move to several bands in one database a mechanical migration, without paying for it today.
6. **The overview model reserves a place for later features** without detailing them.

## Naming conventions

| Element | Rule | Example |
|---|---|---|
| Table | English, camelCase, singular | `member`, `song`, `gig`, `songFile` |
| Join table | Both table names concatenated, the "owning" table first | `gigOrganizer`, `setlistSong` |
| Field | English, camelCase | `firstName`, `startedAt` |
| Primary key | `id` | `id` |
| Foreign key | `<table>Id` | `memberId`, `songId` |
| Date and time | Suffix `At` for an instant, `On` for a date without time | `startedAt`, `birthOn` |
| Boolean | Prefix `is` or `has` | `isActive`, `hasCar` |
| Enum | camelCase, singular, values in UPPERCASE | `memberStatus { ACTIVE  LEFT }` |
| Table group | Domain name, camelCase | `TableGroup songs { … }` |

When a join table has a life of its own (dates, status, role) and a business name would be clearly more telling, propose it without applying it unasked.

**Case and MySQL.** Table names are case-sensitive on the Linux hosting and not on macOS. Write each table name exactly the same way everywhere (DBML, SQL, PHP), and never create two tables that differ only by case.

## DBML conventions

- `Project` declares `database_type: 'MySQL'`.
- Each table carries a `Note`: its business definition in one or two sentences.
- Each field or enum value whose meaning is not obvious carries a `note`.
- A table from another domain appears only through its key, with a note pointing to its domain, inside an `external` group.
- Cardinalities: `>` many to one, `<` one to many, `-` one to one. Never `<>`: always an explicit join table.
- **Technical audit trail** (`createdAt`, `updatedAt`, author): a global convention, present on every table in the SQL, never repeated in the DBML. Only history that has a business meaning is modelled.
- **Personal data**: start the note with `🔒 Personal data`, then the purpose. Sensitive data in the GDPR sense is marked `🔒🔒 Sensitive data` and has to be justified to the owner before it is added.
- **File header**: a history, most recent version first.

```dbml
// Domain: Members
// v0.2 — 2026-10-14 — secondary instruments added
// v0.1 — 2026-10-11 — first draft

Project brassBand {
  database_type: 'MySQL'
  Note: 'Brass band app — Members domain'
}

Enum memberStatus {
  ACTIVE
  LEFT [note: 'Has left the band; access removed, history kept']
}

Enum role {
  ADMIN
  SONG_MANAGER [note: 'Manages songs and their files']
}

Table instrument {
  id integer [pk]
  name varchar [not null, unique]
  Note: 'An instrument played in the band; the list is managed by the band.'
}

Table member {
  id integer [pk]
  firstName varchar [not null, note: '🔒 Personal data — purpose: identification']
  instrumentId integer [ref: > instrument.id, note: 'The instrument the member plays']
  status memberStatus [not null]
  Note: 'A person who plays or has played in the band.'
}

Table memberRole {
  memberId integer [not null, ref: > member.id]
  role role [not null]
  Note: 'A management role held by a member.'

  indexes {
    (memberId, role) [pk]
  }
}

TableGroup members {
  member
  memberRole
  instrument
}
```

## Design principles

1. **One concept, one table.** Do not mix two notions; do not split one without a business reason.
2. **One piece of information in one place.** No copied data, no list inside a text field. Exception: the snapshot of a value at the time of an event, explicit and documented as such.
3. **Explicit relations.** For each one: how many of each side, whether the link is required, whether it changes over time and the old value must be kept.
4. **Business history or technical audit.** Audit stays out of the model. Business history is modelled as soon as a user consults it or a rule depends on it (who attended which gig).
5. **Status rather than deletion** when history matters. Document the life cycle: statuses, transitions, triggers, effects on access. Real deletion is kept for data without historical value and for GDPR erasure.
6. **Enum or reference table.** Enum: a fixed list that changes only with a new version of the app. Reference table: a list the band manages, or one that would differ from band to band (instruments, track-name aliases).
7. **Translatable or not.** Enum values are translated by the app, through a key built from the enum and the value. Rows of a reference table and user content (song titles, place names) are stored in the band's own language and never translated.
8. **Instance settings under control.** What varies from one band to another goes through typed, deliberate settings in `band`, not through an "everything generic" model or a catch-all JSON field. Secrets (the Discord bot token, for instance) stay in the server configuration, outside the database and outside the repository.
9. **Rules live in the model**: uniqueness, required values, allowed values, dependencies between fields, bounds.
10. **Personal data**: collect only what serves an identified purpose, mark each field, and say in the dictionary entry who can see what.
11. **Keep it small.** About thirty members and fifty songs per band. Do not model what no planned screen uses.

Anti-patterns: polymorphic reference (`targetType` + `targetId`), implicit many-to-many, a "type" field that changes the meaning of the other fields, a status deduced from several fields, an ambiguous field name (`date`, `type`, `value`).

## Business dictionary

One Markdown file per domain, one entry per business object (not per table: join and reference tables are described in the entry of the object that owns them). A section with nothing to say is left out.

```markdown
# Business dictionary — <Domain> domain

> v<x.y> — <date> · Model: `<domain>.dbml`

## 1. <Business name> (`<table>`, `<joinTable>`…)

### Definition
<One or two sentences.>

### Fields
| Field | Label (en) | Label (fr) | Required | Example | Realistic length | Rules |
|---|---|---|---|---|---|---|

### Life cycle
| Status | Meaning | Goes to | Trigger | Effects |
|---|---|---|---|---|

### Relations
- <Related object>: <cardinality, business meaning, history or not>

### Access rights
| Who | View | Create | Edit | Change status |
|---|---|---|---|---|

### Instance settings
- <What can vary from one band to another>

### Personal data
- <Field>: purpose, who can see it

### Display
- Truncation, format, missing value
- Representations in the design library (mention, row, card, tile, header: see the `brass-band-design` skill): which exist, which are missing

## N. Open questions
1. …
```

Writing rules: **realistic examples** rather than "John Smith" (compound names, long song titles, edge cases), a **realistic length** rather than the technical maximum, and unknown information stays in "Open questions", never guessed. Examples about people are always made up: no real member, name, phone number or address is written in the repository. Names of songs, instruments and sections can be real.

## Migrations

- One script per change, numbered and never edited once it has run: `001_members.sql`, `002_songs.sql`.
- The indicative DBML types (`varchar`, `integer`, `date`, `timestamp`, `boolean`, `decimal`) become exact MySQL types in the script.
- Every rule of the model (uniqueness, required value, foreign key) becomes a constraint in the database, not only a check in the PHP.
- `utf8mb4` everywhere.
- Table and field names are written in camelCase, exactly as in the DBML.
