# Brass band app

An installable web app (PWA) that replaces the internal tools of a brass band: members, songs (recordings, MIDI, scores, a reading mode), gigs and attendance. One band hosts one instance. The code is meant to be open-sourced so that other bands can run it under their own name, logo and colours.

This repository is where the app is **built**. It is not where it is designed: the data model and the screens are decided elsewhere and arrive here as inputs (see "Sources of truth").

## Working with the owner

- Talk to him in French. Everything written into the repository is in English: code, comments, commit messages, documentation.
- He is not a developer. He reads SQL fluently, PHP a little, and is comfortable with Node and React. Explain a trade-off in plain words, or in SQL when it is about data.
- He maintains this alone and will not keep evolving it. Prefer the solution he can still understand in two years over the clever one.
- Ask before anything that cannot be undone: deploying, running a migration on the live database, deleting files, rewriting git history.

## Guiding principle: what is frozen must not age

The app will be changed rarely once it is stable, so nothing may force an update just to keep running. This is why there is no PHP framework and why dependencies are few and pinned.

- Do not add a dependency without asking, and say what it would cost to do without it.
- Prefer what the platform already provides: native PHP functions, browser APIs (`Intl` for dates and numbers), plain CSS.

## Stack

| Part | Choice | Constraint to remember |
|---|---|---|
| Front | React with Vite, built to static files | No server-side rendering |
| Interface | Components written for this app, plain CSS with custom properties | No component kit. A headless behaviour library is acceptable |
| Back | PHP without a framework, a few small pinned libraries (routing, input validation, web push) | Runs on shared hosting |
| Database | MySQL | Table names are case-sensitive on the Linux host and not on macOS |
| Hosting | OVH shared hosting | No Node at runtime, no long-running process, no websockets. Scheduled work goes through the host's scheduled tasks |
| Sign-in | Email and password, long server-side sessions that can be revoked | No magic link |
| Tests | Playwright, end to end | Each feature ships with its tests |
| Deploy | Files copied to the host from GitHub | No build step on the host |

The reasons behind these choices are in the scoping document, `docs/scoping.md`. A choice recorded there is settled: if one looks wrong, say so once with the reason, and do not work around it.

## Sources of truth

| What | Where | How to use it |
|---|---|---|
| Data model | `model/` (one DBML file and one business dictionary per domain) | Follow the `brass-band-model` skill. The model changes first, the migration second |
| Design | Figma, read through the Figma connector | Follow the `brass-band-design` skill. Implement what is there; do not redesign |
| Decisions and scope | `docs/scoping.md` | Read before proposing anything structural |
| Project skills | `skills/` | Versioned with the code, changed through a commit. Claude loads them from the owner's account, so a change made here is also made there |

When the code disagrees with the model or with Figma, the code is wrong. When the model or the design is missing something a task needs, stop and report it: do not invent a field, a status or a screen.

## Rules that apply everywhere

- **Names.** camelCase for tables, fields and enums, exactly as in the DBML. The same field name travels unchanged from the database to the API to React.
- **No text in the code.** Every string shown to a member goes through a translation key. French is the first locale. Content typed by members (song titles, places) is never translated.
- **Nothing specific to one band.** Name, logo, colours, default language and Discord settings come from the `band` table. Secrets stay in the server configuration, outside the database and outside the repository.
- **Theming.** Colours, radii, spacing and type sizes are CSS custom properties that mirror the Figma variables one for one. No value typed by hand in a component. Two independent axes: the scheme (light, dark) and the accent theme.
- **Business objects.** Interface components follow the objects of the model and their representations, named as in Figma (`Song/Row` in Figma, `SongRow` in code).
- **Security goes through the shared layer.** Database access with prepared statements, sessions, role checks and input validation are written once and reused. Never an ad hoc query or check inside a feature.
- **Personal data.** The app holds members' contact details. Serve files and data only to signed-in members, check the role on the server for every write, and never log personal data.
- **Migrations.** Numbered scripts in `database/migrations/`, never edited once they have run. A migration, the DBML and the dictionary change in the same commit.
- **A clean repository.** No secret, no personal data, no music file committed, even in tests.

## Building a feature

Features are built one at a time, in the order set by the scoping document.

1. Read the domain in `model/` and the screens of the feature in Figma.
2. List what is missing or unclear, and ask before starting.
3. Write the migration, then the API, then the interface.
4. Write the end-to-end tests, including the cases of a member without the right and of empty data.
5. Check on a phone-sized viewport first.
6. Say what was done, what was not, and what could not be verified.

## To fill in when the repository is scaffolded

- Folder layout of the front and the back.
- Commands: install, run locally, build, test, deploy.
- Link to the Figma file.
- Local database setup, with MySQL configured to treat table names as the host does.
