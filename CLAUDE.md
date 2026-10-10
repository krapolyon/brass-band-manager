# Brass band app

An installable web app (PWA) that replaces the internal tools of a brass band: members, songs (recordings, MIDI, scores, a reading mode), gigs and attendance. One band hosts one instance. The code is meant to be open-sourced so that other bands can run it under their own name, logo and colours.

This repository is where the app is **built**. It is not where it is designed: the data model and the screens are decided elsewhere and arrive here as inputs (see "Sources of truth").

## Working with the owner

- Talk to him in French. Everything written into the repository is in English: code, comments, commit messages, documentation.
- He is not a developer. He reads SQL fluently, PHP a little, and is comfortable with Node and React. Explain a trade-off in plain words, or in SQL when it is about data.
- He maintains this alone and will not keep evolving it. Prefer the solution he can still understand in two years over the clever one.
- Ask before anything that cannot be undone: deploying, running a migration on the live database, deleting files, rewriting git history.

## Guiding principle: what is frozen must not age

The app will be changed rarely once it is stable, so nothing may force an update just to keep running. This is why there is no large framework (Laravel, Symfony as a whole, MUI and the like) and why versions are pinned.

Dependencies themselves are welcome: proven, maintained code is better than a home-made copy of it.

- When a need is one that libraries solve well (routing, data access, validation, translation, an ORM if it fits), propose the library that is the best fit, the most robust, the most secure and the easiest to maintain. Do not write a home-made version to keep the count low.
- The owner validates each dependency before it is installed. Asking is not a reason to propose fewer: give the recommendation, its maintenance record and what it pulls in, and say when writing it ourselves is honestly the better choice.
- What is refused is the large framework that dictates the structure of the app and forces upgrades, not the library.
- Where the platform already does the job, use it: PHP's password functions, browser APIs (`Intl` for dates and numbers), plain CSS.

## Stack

| Part | Choice | Constraint to remember |
|---|---|---|
| Front | React and TypeScript with Vite, built to static files. React Router for screens, TanStack Query for API calls, i18next for text | No server-side rendering |
| Interface | Components written for this app, plain CSS with custom properties | No component kit. A headless behaviour library is acceptable |
| Back | PHP with Slim (routing and error handling), Doctrine DBAL (data access, no ORM) and Valinor (input validation) | Runs on shared hosting. No full framework |
| Database | MySQL | Table names are case-sensitive on the Linux host and not on macOS |
| Hosting | OVH shared hosting | No Node at runtime, no long-running process, no websockets. Scheduled work goes through the host's scheduled tasks |
| Sign-in | Email and password, long server-side sessions that can be revoked | No magic link |
| Tests | Playwright, end to end | Each feature ships with its tests |
| Code checks | TypeScript, Biome, PHPStan | `npm run check` passes before a commit |
| Deploy | Files copied to the host from GitHub | No build step on the host |

The reasons behind these choices are in the scoping document, `docs/scoping.md`. A choice recorded there is settled: if one looks wrong, say so once with the reason, and do not work around it.

How the pieces work and fit together is in `docs/architecture.md`, with the reason for each dependency. Read it before writing code, and update it in the same commit as any change it describes: it is what lets the next person, or the next AI, take over without guessing.

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

## Where things are

| Folder | What it holds |
|---|---|
| `web/` | The front: `src/` (React, TypeScript), `src/locales/` (translations), `public/` (files copied as they are). Built to `web/dist/` |
| `api/` | The back: `public/index.php` (single entry point), `routes.php` (every address), `src/` (classes), `config.php` (server configuration, never committed) |
| `database/` | `migrations/` (numbered SQL scripts) and `migrate.php`, which applies them |
| `tests/` | Playwright end-to-end tests |
| `docker/`, `docker-compose.yml` | The local stand-in for the host |
| `scripts/` | Project tooling, `setup.mjs` first |
| `model/`, `docs/`, `skills/` | The sources of truth above |

## Commands

| To | Run |
|---|---|
| Set up a fresh copy, or repair one | `npm run setup` (Docker must be running) |
| Start / stop the local stack | `npm run stack:up` / `npm run stack:down`. The app is at http://localhost:8080 |
| Work on the front | `npm run dev`, then http://localhost:5173 |
| Build the front | `npm run build`. Needed before testing a change of the front |
| Test | `npm test` |
| Check the code | `npm run check` (Biome, TypeScript, PHPStan). `npm run format` fixes the layout |
| Apply the migrations | `npm run db:migrate`, on the local database only |
| Empty the local database | `npm run db:reset`. Deletes local data: ask first |
| Add a PHP library | `docker compose run --rm php composer require vendor/name:1.2.3` |

Deployment is not set up yet. The hosting will be the cheapest OVH shared plan that fits, so plan for no command line on the host.

## Shared layer

Written once, used by every feature. A feature never does these things by itself. Details and examples in `docs/architecture.md`.

| Need | Use |
|---|---|
| Declare an address of the API | One line in `api/routes.php`, pointing to an action class in `api/src/<Domain>/` |
| Read or write data | The DBAL connection given to the action, with placeholders and the values passed apart |
| Receive data from the front | `Input::from($request, SomeInput::class)`: a typed class, filled and checked by Valinor |
| Answer | `Json::write()` |
| Refuse | `throw new ApiError(status, 'errorKey')`. The front translates the key; the server writes no sentence |
| Call the API from the front | `api()` of `web/src/api.ts`, through TanStack Query |
| Show a text | `t('some.key')`, the key being in `web/src/locales/fr.json` |

Sessions and role checks are not written yet: they wait for the validated `members` domain in `model/`.

## Still to fill in

- Link to the Figma file.
- Deployment commands.
- The PHP and MySQL versions of the host, to keep `docker/Dockerfile` and `docker-compose.yml` equal to them (PHP 8.4 and MySQL 8.4 for now).
