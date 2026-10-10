# Architecture

How the app is built and how its pieces fit together. This document is for whoever takes the code over, person or AI: it should be possible to add a feature or fix a bug from here without guessing.

- What the app is for, and why each big choice was made: [scoping.md](scoping.md).
- The rules to follow when writing code: [../CLAUDE.md](../CLAUDE.md).
- This document: how things work, and how to do the usual tasks.

Keep it true. A change to something described here updates this document in the same commit.

## The picture

```
Phone or computer                       The host (OVH shared hosting)
┌──────────────────────┐                ┌────────────────────────────────────┐
│ The front            │   GET /        │ Apache                             │
│ React, in the browser│ ─────────────▶ │  /      static files (web/dist)    │
│                      │                │                                    │
│                      │   /api/...     │  /api   PHP (api/)  ───▶  MySQL    │
│                      │ ◀────JSON────▶ │                                    │
└──────────────────────┘                └────────────────────────────────────┘
```

- **The front** is a set of static files. The browser downloads them once, then React draws every screen and asks the API for data. There is no server-side rendering.
- **The API** is PHP. It answers JSON only, under `/api/`. It is the only thing that talks to the database.
- **The database** is MySQL.
- Nothing runs permanently on the host: PHP starts for each request and stops. This rules out real time, and is why screens refresh by asking again.

Locally, Docker plays the part of the host: one container with Apache and PHP, one with MySQL.

## Getting started

You need [Node](https://nodejs.org) 22.12 or later and [Docker Desktop](https://www.docker.com/products/docker-desktop/), started.

```sh
npm run setup
```

That one command installs the packages, creates the local configuration, builds the Docker images, installs the PHP libraries, builds the front, starts the stack, applies the migrations and installs the test browsers. It prints each step. It can be run again at any time, for instance after pulling new code: each step either does its work or finds it done, and it never touches the data of the local database. The script is [scripts/setup.mjs](../scripts/setup.mjs).

The app is then at http://localhost:8080.

### Everyday commands

| To | Run | Notes |
|---|---|---|
| Start the stack | `npm run stack:up` | Rebuilds the image if `docker/` changed, and waits until the app answers |
| Stop the stack | `npm run stack:down` | The data is kept |
| Read the PHP log | `npm run stack:logs` | Errors of the API appear here |
| Work on the front | `npm run dev` | http://localhost:5173, reloads on every change. Calls to `/api` go to the stack, which must be running |
| Build the front | `npm run build` | Type-checks, then writes `web/dist/`, which is what port 8080 serves |
| Run the tests | `npm test` | Against port 8080: run `npm run build` first if the front changed |
| Check the code | `npm run check` | Biome, TypeScript and PHPStan. Must pass before a commit |
| Fix the layout of the code | `npm run format` | |
| Apply the migrations | `npm run db:migrate` | |
| Install the PHP libraries | `npm run api:install` | After `api/composer.lock` changed |
| Empty the local database | `npm run db:reset` | Deletes all local data, then applies every migration again |

Two addresses, two uses: **5173** to write front code comfortably, **8080** to see the app as the host will serve it. Tests always use 8080.

## Where things are

```
web/                      The front
  index.html              The single page
  public/                 Files copied as they are: manifest, icons, .htaccess
  src/
    main.tsx              Starting point
    router.tsx            Every address of the app and its screen
    api.ts                The only place that calls the API
    i18n.ts               Translation setup
    locales/fr.json       Every text shown to a member
    screens/              One file per screen
    base.css              Minimal styles (see "Styles")
  dist/                   The built front (not committed)

api/                      The back
  public/index.php        Single entry point: builds and runs the Slim app
  public/.htaccess        Sends every /api/... address to index.php
  routes.php              Every address the API answers
  bootstrap.php           Loads the libraries and the configuration
  config.example.php      Model of the configuration
  config.php              The real configuration (not committed)
  src/
    Database.php          Sets up the database connection
    Http/                 Shared layer: Json, ApiError, ErrorHandler, Input
    Health/               The one feature that exists: GET /api/health
  composer.json           PHP libraries, exact versions
  phpstan.neon            Settings of the PHP analysis
  vendor/                 The libraries themselves (not committed)

database/
  migrations/             Numbered SQL scripts
  migrate.php             Applies those that have not run yet

tests/                    Playwright end-to-end tests
docker/                   Image of the local web server (Apache with PHP)
docker-compose.yml        The local stack
scripts/setup.mjs         npm run setup
model/                    Data model (DBML and business dictionary)
docs/                     This document and the scoping
skills/                   Versioned copies of the project's Claude skills
```

There is one `package.json`, at the root, for the front, the tests and the tooling. PHP libraries are in `api/composer.json`.

## The local stack

Defined in [docker-compose.yml](../docker-compose.yml).

| Service | What it is | Reached at |
|---|---|---|
| `web` | Apache with PHP 8.4. Serves `web/dist` at `/` and `api/public` at `/api` | http://localhost:8080 |
| `db` | MySQL 8.4 | `127.0.0.1`, port `3307`, database `brassBand`, user `brassBand`, password `local-only` |
| `php` | The same image, used for command-line tools only. Not started with the stack | `docker compose run --rm php <command>` |

- The folders `web/dist`, `api` and `database` are shared with the `web` container, read-only: a change to a PHP file is live at once, no restart.
- **Table names are case-sensitive**, as on the Linux host and unlike a MySQL installed on a Mac. This is the reason for running MySQL in Docker: a table written `Member` instead of `member` fails here as it would in production. Do not point the app at another MySQL.
- The database's data lives in the Docker volume `dbData`. It survives `stack:down`. `npm run db:reset` deletes it.
- Port 3307 is used so that a MySQL installed on the Mac can keep 3306.
- The passwords in `docker-compose.yml` and `config.example.php` are for this local stack only. They are not secrets.
- The PHP and MySQL versions must stay equal to those of the host. They are written in `docker/Dockerfile` (`FROM php:8.4-apache`) and `docker-compose.yml` (`image: mysql:8.4`).

## The API

### How a request travels

Take `GET /api/health`.

1. Apache receives it. [api/public/.htaccess](../api/public/.htaccess) sends every `/api/...` address to `index.php`.
2. [api/public/index.php](../api/public/index.php) loads the libraries and the configuration (`bootstrap.php`), prepares the database connection, creates the Slim app, and registers the error handler.
3. It loads [api/routes.php](../api/routes.php), the list of every address.
4. Slim finds the route matching the method and the address, and calls its **action**: here `HealthAction`.
5. The action does its work and returns a JSON answer, written with `Json::write()`.
6. If anything is thrown on the way, `ErrorHandler` turns it into a JSON answer.

An address that is not in `routes.php` does not exist: Slim answers 404 through the same error handler.

### Adding an address

1. Create an action class in `api/src/<Domain>/`, the domain being the one of the model (`Members`, `Songs`, `Gigs`). An action is a class with an `__invoke()` method that receives the request and returns the answer. What it needs is received in its constructor.

   ```php
   // api/src/Songs/ListSongsAction.php
   namespace BrassBand\Songs;

   final class ListSongsAction
   {
       public function __construct(private readonly Connection $database)
       {
       }

       public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
       {
           $songs = $this->database->fetchAllAssociative('SELECT id, title, status FROM song ORDER BY title');

           return Json::write($response, $songs);
       }
   }
   ```

2. Add its line to `api/routes.php`:

   ```php
   $app->get('/api/songs', new ListSongsAction($database));
   ```

   A variable part of the address is written `{id}` and arrives as the third argument of `__invoke()`: `$app->get('/api/songs/{id}', ...)` then `array $arguments` with `$arguments['id']`.

3. Write its end-to-end test.

[HealthAction](../api/src/Health/HealthAction.php) is the smallest real example.

### Reading and writing data

Actions use the Doctrine DBAL connection they were given. It is set up in one place, [api/src/Database.php](../api/src/Database.php).

```php
$database->fetchAssociative('SELECT id, title FROM song WHERE id = ?', [$id]);   // one row, or false
$database->fetchAllAssociative('SELECT id, title FROM song WHERE status = ?', [$status]);
$database->fetchOne('SELECT COUNT(*) FROM song');                                // one value
$database->insert('song', ['title' => $title, 'status' => 'PROPOSED']);
$database->update('song', ['status' => 'ACTIVE'], ['id' => $id]);
$database->delete('song', ['id' => $id]);
$database->lastInsertId();
$database->transactional(function (Connection $database): void {
    // several writes that succeed or fail together
});
```

- **Values are always passed apart from the SQL**, through `?` or through the arrays of `insert()` and `update()`. Never build SQL by joining a value into a string: this is what prevents SQL injection.
- SQL is written by hand, on purpose: the owner reads SQL, and the schema is described once, in `model/`. There is no ORM and no entity class to keep in step with the tables.
- Table and field names are written exactly as in the DBML, in camelCase. What a query returns keeps those names all the way to the front.
- The connection opens on the first query. A request that needs no data opens nothing.

### Receiving data

Data sent by the front enters through [Input](../api/src/Http/Input.php), and nowhere else. The action describes what it expects as a small class with typed properties:

```php
final class AnswerInput
{
    public function __construct(
        public readonly int $gigSlotId,
        public readonly AttendanceAnswer $answer,     // a PHP enum with the values of the model
    ) {
    }
}

$input = Input::from($request, AnswerInput::class);
```

A stricter type than PHP's own is written as a comment above the property, for instance `/** @var non-empty-string */`. Valinor fills the class from the JSON body. It refuses a missing property, a wrong type (the text `"12"` is not the number `12`), a value outside an enum, and a property that was not expected. The API then answers:

```json
{ "error": "invalidInput", "fields": { "answer": "invalid" } }
```

with status 422. Past `Input::from()`, the data has the announced shape, and PHPStan knows its types.

Rules that are about meaning and not shape (this email is already used, this slot is in the past) are checked by the action, which throws an `ApiError`.

### Refusing, and the shape of errors

Every error of the API has the same shape: an HTTP status and `{"error": "<key>"}`. The key is a camelCase word that the front translates. **The server writes no sentence**: texts live in the front's translation files.

```php
throw new ApiError(409, 'emailAlreadyUsed');
```

| Status | Key | When |
|---|---|---|
| 400 | `invalidBody` | The body is not JSON |
| 404 | `notFound` | No such address, or no such object |
| 405 | `methodNotAllowed` | The address exists, not with this method |
| 422 | `invalidInput` | The data does not have the expected shape. Comes with `fields` |
| 500 | `serverError` | Anything that was not foreseen |
| 503 | — | Only `GET /api/health`, with `{"database": "unreachable"}` |
| other | the key given to `ApiError` | A refusal decided by an action |

All of this is in [ErrorHandler](../api/src/Http/ErrorHandler.php).

**An unforeseen error is logged with its class and its place, never with its message.** A database message can quote the value that caused it ("Duplicate entry 'someone@example.org'"), and values can be personal data. Keep it that way when adding logs.

Every JSON answer carries `Cache-Control: no-store` (answers hold members' data, nothing may keep a copy) and `X-Content-Type-Options: nosniff`. They are set in [Json](../api/src/Http/Json.php).

### Configuration

`api/config.php` returns an array. It is not committed: locally it is a copy of `config.example.php`, on the host it holds the real database password. A new setting is added to both files, and to the type written above `Database::connect()` if it concerns the database.

Secrets (database password, later the Discord bot token and the push keys) go there and nowhere else. Settings of the band (name, logo, colours) are not configuration: they belong to the `band` table.

### Not written yet

- **Install, sessions, sign-in and permission checks.** Their tables exist (`001_members.sql`); the rules are in [model/members.md](../model/members.md). Actions will check a permission, never a role, through one table in the code that says which roles grant it. Session and permission checks will be Slim middleware: written once, attached to groups of routes in `routes.php`, so that no action checks a session by itself.
- **Protection against forged requests (CSRF)** comes with the session cookie.
- **Serving files** (recordings, scores) to signed-in members only.

## The front

### How it starts

[web/index.html](../web/index.html) loads [web/src/main.tsx](../web/src/main.tsx), which sets up three things and draws the app:

- **translations** ([i18n.ts](../web/src/i18n.ts));
- **the query client** of TanStack Query, which keeps what the API answered;
- **the router** ([router.tsx](../web/src/router.tsx)), which picks the screen for the current address.

### Adding a screen

1. Create `web/src/screens/<Name>Screen.tsx`, a React component.
2. Add its line to `web/src/router.tsx`: `{ path: '/songs', element: <SongsScreen /> }`. A variable part is written `:id` and read with `useParams()`.
3. Link to it with `<Link to="/songs">`, never with a plain `<a>`, which would reload the whole app.

An address that matches no screen shows `NotFoundScreen`. On the host, [web/public/.htaccess](../web/public/.htaccess) answers any address that is not a file with `index.html`, so that opening `/songs/12` directly works.

Components that draw a business object will follow the names of the design (`Song/Row` in Figma, `SongRow` in code) and live in `web/src/components/`. None exists yet: the Figma file does not exist yet.

### Calling the API

Calls go through `api()` of [web/src/api.ts](../web/src/api.ts), wrapped in TanStack Query:

```tsx
// Reading
const songs = useQuery({
  queryKey: ['songs'],
  queryFn: () => api<Song[]>('/api/songs'),
});
// songs.isPending, songs.isError, songs.data

// Writing
const queryClient = useQueryClient();
const addSong = useMutation({
  mutationFn: (song: NewSong) => api<Song>('/api/songs', { method: 'POST', body: song }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['songs'] }),
});
```

- `queryKey` names the data. Two screens using the same key share one request and one copy.
- After a write, `invalidateQueries` tells the screens showing that data to ask again.
- TanStack Query asks again by itself when the app comes back to the foreground. This is how the app stays fresh without real time.
- A refusal of the API becomes an `ApiError` with `status`, `error` (the key) and `fields`. A server that cannot be reached gives the key `unreachable`.
- The types of what the API returns (`Song` above) are written in TypeScript with the field names of the model. Nothing generates them: they are kept true by hand, next to the code that uses them.

[HomeScreen](../web/src/screens/HomeScreen.tsx) is the smallest real example.

### Text and translations

**No text is written in a component.** Every string shown to a member is a key of [web/src/locales/fr.json](../web/src/locales/fr.json):

```tsx
const { t } = useTranslation();
<h1>{t('notFound.title')}</h1>
t('gigs.answersLeft', { count: 3 })     // variables and plurals
```

- Keys are grouped by screen or by object, in camelCase.
- French is the reference: a key is added there first. TypeScript knows the keys of `fr.json` ([i18next.d.ts](../web/src/i18next.d.ts)) and refuses one that does not exist.
- Plurals use i18next's suffixes in the JSON: `"answersLeft_one"`, `"answersLeft_other"`.
- Error keys sent by the API will be translated under `errors.<key>`.
- Dates and numbers are formatted with the browser's `Intl`, not with a library.
- Content typed by members (song titles, places) is never translated.
- To add a language: add `locales/<language>.json` with the same keys and list it in `i18n.ts`. The default language will come from the `band` table.

### Styles

[base.css](../web/src/base.css) is nearly empty on purpose. Colours, radii, spacing and type sizes will be CSS custom properties mirroring the Figma variables one for one, with two independent axes (light or dark, and the accent theme). The Figma file does not exist yet, so no value has been invented: the placeholder screens use the browser's own colours.

Styles are plain CSS. No component kit, no CSS framework.

### Installable app (PWA)

- [web/public/manifest.webmanifest](../web/public/manifest.webmanifest) is what makes the app installable.
- Its name is fixed ("Brass band") and its icons are grey placeholders. Both must come from the band's settings once the `band` table exists, which means the manifest will be served by the API.
- There is no service worker. It is not needed to install the app, and offline use is not a goal. One will be added with push notifications, which require it.
- The icons are in `appIcons/`, not `icons/`: see "Traps".

## Database and migrations

The schema is described in `model/` (DBML, one file per domain), and created by numbered SQL scripts in `database/migrations/`.

**The order is always: the model first, the migration second.** A migration is written only for a domain validated in `model/`. The rules for the model and for writing migrations are in the `brass-band-model` skill (`skills/`).

- A script is named `001_members.sql`, `002_songs.sql`: a number, then what it does.
- `npm run db:migrate` runs [database/migrate.php](../database/migrate.php), which applies, in order, the scripts that have not run yet.
- Scripts that have run are recorded in the `schemaMigration` table. It is technical: it is created by `migrate.php` itself and is not part of the model.
- **A script that has run is never edited**, since it would not run again. A correction is a new script.
- If a script fails halfway, the runner stops and says so. MySQL does not undo table changes: what ran before the error stays. Locally, fix the script and run `npm run db:reset`. On the host, the database must be repaired by hand before trying again, which is why a migration is always tried locally first.
- A migration, the DBML and the dictionary change in the same commit.

Migrations are plain SQL files rather than the PHP classes that migration libraries use, so that the owner can read and review them. This is why the runner is our own code (about 60 lines).

Two migrations exist: `001_members.sql` (sections, instruments, members, roles, sessions and password links) and `002_band.sql` (the band and its settings).

### Conventions of every table

Written once in [model/members.md](../model/members.md), "Storage conventions", and applied by every migration:

- `createdAt`, `updatedAt` and `updatedByMemberId` on every table: a technical trace, filled by the database for the two dates and by the API for the member.
- Instants are `DATETIME` columns holding UTC. The API sets its connection to UTC (`Database.php`), so that `CURRENT_TIMESTAMP` and every value read or written agree whatever the clock of the host. `TIMESTAMP` is not used: in MySQL it stops in January 2038. Converting to the member's local time is the front's job, with `Intl`.
- Tables are `utf8mb4` with the `utf8mb4_unicode_ci` collation: text is compared without regard to case or accents, which is what makes a nickname unique in the way a person expects. Hashes and codes that must be compared exactly are declared `ascii_bin`.
- Every rule of the model is a constraint in the database (`NOT NULL`, `UNIQUE`, `FOREIGN KEY`, `CHECK`), not only a check in PHP. A refused write is a bug in the API, which should have refused first with a proper error key.
- When reading the database by hand with the `mysql` command, add `--default-character-set=utf8mb4`: without it, accents typed in a query are stored wrongly.

## Tests

Tests are end to end, with Playwright: they drive a real browser against the local stack on port 8080, so they exercise the front, the API and the database together. They are in `tests/`, in TypeScript.

- Each test runs twice, as an Android phone (Chromium) and as an iPhone (WebKit). The phone is the main use; there is no desktop run.
- `npm test` needs the stack running and the front built.
- After a failure, `npx playwright show-report` opens the report, with a recording of each failed test.
- A test finds elements by their role or their state (`getByRole('status')`), not by their French text, so that a change of wording does not break it.
- Each feature ships with its tests, including a member without the right and empty data.

There are no unit tests. Code checks (below) cover what unit tests would catch at this size.

## Code checks

`npm run check` runs three tools. It must pass before a commit.

| Tool | Checks | Settings |
|---|---|---|
| Biome | Layout of the code and common mistakes, in TypeScript, JSON and CSS | [biome.json](../biome.json) |
| TypeScript | Types of the front and of the tests: a misspelt field or translation key is an error | [tsconfig.json](../tsconfig.json) |
| PHPStan | Types of the PHP code, level 8 | [api/phpstan.neon](../api/phpstan.neon) |

`npm run format` lets Biome fix the layout.

## Dependencies

Each one was validated by the owner. The rule ([CLAUDE.md](../CLAUDE.md), "Guiding principle"): proven and maintained libraries are preferred to home-made code; what is avoided is the large framework that dictates the structure of the app and forces upgrades.

### PHP, used by the running app

| Library | Version | What it does here | Why this one |
|---|---|---|---|
| `slim/slim` | 4.15.3 | Routing, middleware, error handling | A micro-framework that stops there. On the same major version since 2019, still maintained |
| `slim/psr7` | 1.8.0 | The request and response objects Slim works with | Slim's own |
| `doctrine/dbal` | 4.5.0 | Database access: prepared statements, insert and update helpers, transactions | The most widely used database layer in PHP. Doctrine ORM is built on it and can be added later without a rewrite |
| `cuyz/valinor` | 2.6.0 | Turns incoming JSON into typed objects, or refuses it | No dependency of its own, strict by default, works with PHP enums |

To come: `minishlink/web-push` for push notifications, with the gigs feature.

### PHP, development only

| Library | Version | What it does here |
|---|---|---|
| `phpstan/phpstan` | 2.3.1 | Static analysis |

### JavaScript, built into the front

| Library | Version | What it does here | Why this one |
|---|---|---|---|
| `react`, `react-dom` | 19.3.0 | The interface | Settled in the scoping |
| `react-router` | 8.4.0 | Addresses and screens | The standard router of React |
| `@tanstack/react-query` | 5.104.1 | API calls: loading, error, keeping and refreshing data | Fits an app without real time |
| `i18next`, `react-i18next` | 26.4.3, 17.0.16 | Translations, variables, plurals | The standard; its file format is known to contributors |

### JavaScript, development only

| Library | Version | What it does here |
|---|---|---|
| `vite`, `@vitejs/plugin-react` | 8.3.4, 6.1.2 | Development server and build |
| `typescript` | 7.0.2 | Type checking |
| `@types/react`, `@types/react-dom`, `@types/node` | 19.3.0, 19.3.0, 24.19.2 | Types of React and Node for TypeScript |
| `@biomejs/biome` | 2.5.15 | Formatting and linting |
| `@playwright/test` | 1.64.0 | End-to-end tests |

### Written here on purpose

| What | Why not a library |
|---|---|
| The migration runner (`database/migrate.php`) | Migration libraries impose PHP classes; the project wants plain SQL scripts |
| Sessions and passwords (to come) | PHP provides password hashing natively, and authentication libraries impose their own tables, which would contradict the model |
| `ApiError`, `Json`, `ErrorHandler`, `Input` | A few lines each, gluing the libraries to this app's error format |

### Adding or updating one

- **Ask the owner first**, with the recommendation, its maintenance record and what it pulls in.
- Versions are exact, with no `^` or `~`: an install next year gives the same code as today. The lock files (`package-lock.json`, `api/composer.lock`) are committed.
- JavaScript: `npm install --save-exact name@1.2.3` (add `--save-dev` for a development tool).
- PHP: `docker compose run --rm php composer require vendor/name:1.2.3` (add `--dev` for a development tool). Composer runs in Docker; it is not needed on the Mac, and the host never runs it.
- Add the library to the tables above, with its reason.

## Deployment

Not set up yet. The owner has decided to take the cheapest OVH shared hosting plan that can run the app (decision of 2026-10-10); the exact plan is still to be picked against what it offers: PHP 8.4, one MySQL database, scheduled tasks, and the kind of access (FTP, SFTP or SSH).

Expect the cheapest plans to have no command line (SSH). Deployment must therefore work by copying files, and migrations must be runnable without a terminal.

What is already decided:

- The host receives files and builds nothing: the built front (`web/dist/`) and the API with its `vendor/` folder are copied as they are.
- `api/config.php` is written once on the host, by hand, and is never part of what is copied.
- Migrations are applied on the host by `database/migrate.php`, after having run locally.
- The Apache rules the app needs are in the two `.htaccess` files, which travel with the code.

To settle then: how `api/src`, `api/vendor` and `api/config.php` are kept out of the folder Apache serves, and how `migrate.php` is run without a command line (today it refuses to run outside one).

## Traps

- **`/icons/` is reserved by Apache** for its own files: anything the app puts at that address answers 404. The app's icons are in `web/public/appIcons/`.
- **Table names and case.** Covered by the local MySQL; see "The local stack".
- **Port 8080 serves the built front.** After changing front code, `npm run build` before looking at 8080 or running the tests. Port 5173 has no such step.
- **A migration file holds several statements**, which MySQL's real prepared statements refuse. `migrate.php` switches that setting for itself only; the API keeps real prepared statements.
- **`npm run db:reset` and `docker compose down -v` delete the local data.**

## Not built yet

In the order of the scoping document:

1. Install (sections, instruments, first admin), sign-in, sessions and permissions: the `members` domain is validated and its tables exist; the code is next.
2. Deployment to OVH: the cheapest plan that fits, still to be picked and ordered.
3. The design system in CSS and the first real screens: wait for the Figma file.
4. Every feature (members, songs, gigs, and the later ones).
