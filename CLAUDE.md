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

## Three principles: secure, private and accessible by design

These are decided when a feature is modelled and designed, not added after it works. Each one is a question to answer before writing the feature, and a point to report on when it is done.

- **Secure by design.** Every feature starts from "who may do this, and how does the server know?". Access is refused unless a rule grants it. Sessions, permission checks, input validation and database access go through the shared layer, never through code written for one feature. Secrets and tokens are stored hashed or outside the database, and nothing sensitive is ever sent to the front "just in case".
- **Private by design.** A piece of personal data exists only if it has a stated purpose, written in the model. Collect the minimum, make optional what can be, say who can see it, erase it when the purpose ends (a member who leaves), and never write it to a log, a test, or the repository. Examples in the code, the tests and the documentation are made up.
- **Accessible by design.** The default design is not required to reach the highest level of the accessibility guidelines (WCAG AAA). What is required is that a member can turn on accessibility options that bring the app to level AA at least, and to AAA wherever feasible. So: the options are part of the member's account (see `model/members.md`), every screen is built to honour them (text that can grow without breaking the layout, colours and motion that come from variables an option can change), and the basics hold with no option at all: real buttons and links, labels on every field, a visible focus, nothing conveyed by colour alone, everything reachable without a pointer.

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
| Design | Figma, read through the Figma connector: [Brass band manager](https://www.figma.com/design/xYuIOrGu1cS6ocbMo7M5dD/Brass-band-manager) | Follow "Reading the design" below and the `brass-band-design` skill. Implement what is there; do not redesign |
| Decisions and scope | `docs/scoping.md` | Read before proposing anything structural |
| Project skills | `skills/` | Versioned with the code, changed through a commit. Claude loads them from the owner's account, so a change made here is also made there |

When the code disagrees with the model or with Figma, the code is wrong. When the model or the design is missing something a task needs, stop and report it: do not invent a field, a status or a screen.

## Reading the design

The design is made in the design conversations of the project and changes there. Here it is read, never altered.

- **Start with the "Read me" note of the feature's page.** It gives the status of the page, what is decided, the components the screens use and the points still open. Build what is marked validated. For a page marked "to validate", ask the owner what is settled before writing screens.
- **A variable is a CSS custom property with the same name**: `accent` in Figma, `--accent` in the CSS. Components use the `Scheme` collection (semantic colours) and the `Size` collection, never `Primitives` or `Theme` directly. In Figma the `Scheme` values are aliases of `Theme` and `Primitives`: keep that chain in the CSS, so that changing the scheme or the theme is one change at the root.
- **The two axes are settings of the member.** `colorScheme` chooses the mode of `Scheme` (`AUTO` follows the device). `accentTheme` is the name of a mode of `Theme`, in lowercase (`copper`). The list of themes is written once and shared by the API, which refuses any other value, and by the CSS. The default theme of a band is not modelled yet: until it is, the first mode of `Theme` applies.
- **A component keeps its Figma name**: `Button`, `BottomSheet`, and `SectionCard` for `Section/Card`. A variant becomes a prop with the same values, a slot becomes `children`, an exposed nested instance is the nested component itself. A component that Figma does not have is not created here: ask for it.
- **Text uses the text styles** (`display` to `micro`); nothing else sets a typeface, a size or a weight. Figma gives sizes in pixels at 100 %: write sizes and spacing so that the text size option of the member (100 to 200 %) scales them.
- **The typefaces are served by the app**, from `web/public/`, never loaded from a font service: no visitor is reported to a third party, and nothing the app needs can disappear. The two families are the values of `fontDisplay` and `fontText` in Figma.
- **Four widths are drawn: 390, 768, 1280 and 1920.** The layouts change at 768, 1024 and 1920: phone below 768, tablet from 768, two panes from 1024 (drawn at 1280, used earlier so that a laptop window that is not full screen keeps the desktop layout), the wide layout from 1920.
- **What a still screen does not say.** Safe areas come from `env(safe-area-inset-*)`, never from a fixed padding. A `BottomBar` is pinned to the bottom when its screen scrolls. A panel is a `BottomSheet` below 1024 and a `Dialog` from 1024. A column drawn at a fixed width is a `max-width`. The halo is decoration: it is hidden from assistive technology, and the high contrast option removes it.
- **The copy is in the screens, in French.** Take it as it is drawn, with its no-break spaces before `?`, `!`, `;` and `:`, and give each string a key in `fr.json`.
- **When a screen and the model disagree, or a screen lacks something the API asks for, stop and report it.** The fix is made in the model or in Figma first, never by a field or a screen invented here.

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

1. Read the domain in `model/` and the screens of the feature in Figma, starting with the "Read me" note of its page.
2. List what is missing or unclear, and ask before starting.
3. Write the migration, then the API, then the interface.
4. Write the end-to-end tests, including the cases of a member without the right and of empty data.
5. Check on a phone-sized viewport first, then at the three larger widths, in the light and the dark scheme.
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
| Test | `npm test`. Runs against the test server (port 8081) and its own database, never the data of 8080 |
| Check the code | `npm run check` (Biome, TypeScript, PHPStan). `npm run format` fixes the layout |
| Apply the migrations | `npm run db:migrate`, on the local database only |
| Empty the local database | `npm run db:reset`. Deletes local data: ask first |
| Add a PHP library | `docker compose run --rm php composer require vendor/name:1.2.3` |

Deployment is not set up yet. The hosting will be the cheapest OVH shared plan that fits, so plan for no command line on the host.

## Shared layer

Written once, used by every feature. A feature never does these things by itself. Details and examples in `docs/architecture.md`.

| Need | Use |
|---|---|
| Declare an address of the API | One line in `api/routes.php`, pointing to an action class in `api/src/<Domain>/`, written in the block that says who may call it: public, signed in, or with a permission |
| Know who is asking | `CurrentMember::of($request)`, behind `RequireSession` |
| Restrict an action | `->add(new RequirePermission(Permission::...))` on the route. Never test a role; the table of who gets what is in `Permission.php` |
| Read or write data | The DBAL connection given to the action, with placeholders and the values passed apart |
| Receive data from the front | `Input::from($request, SomeInput::class)`: a typed class, filled and checked by Valinor. Then `FieldErrors` for lengths and formats, and `Text::clean()` before saving a text |
| Answer | `Json::write()` |
| Refuse | `throw new ApiError(status, 'errorKey')`. The front translates the key; the server writes no sentence |
| Call the API from the front | `api()` of `web/src/api.ts`, through TanStack Query |
| Show a text | `t('some.key')`, the key being in `web/src/locales/fr.json` |

A route is public only by decision: the list is short and written at the top of `api/routes.php`.

## How a feature is checked before it is committed

1. `npm run check` and `npm test` pass.
2. Its tests come from the dictionary: each line of the "Access rights" and "Roles and permissions" tables of `model/` is a test, refusals included.
3. An independent review, by an agent that did not write the code, read-only: security and privacy against the dictionary, and, when there are screens, conformity to Figma with the six accessibility options on. Figma does not say yet how each option looks: until it does, an option is checked for what it does (text grows without breaking the layout, motion stops, translucent surfaces turn opaque), not for a look. Its findings are fixed, each with a test, or reported to the owner.

## Still to fill in

- Deployment commands.
- The PHP and MySQL versions of the host, to keep `docker/Dockerfile` and `docker-compose.yml` equal to them (PHP 8.4 and MySQL 8.4 for now).
