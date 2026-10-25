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
| Run the tests | `npm test` | Against the test server on port 8081: run `npm run build` first if the front changed |
| Check the code | `npm run check` | The checks of the changelog and of the email theme, then Biome, TypeScript and PHPStan. Must pass before a commit |
| Fix the layout of the code | `npm run format` | |
| Apply the migrations | `npm run db:migrate` | |
| Install the PHP libraries | `npm run api:install` | After `api/composer.lock` changed |
| Empty the local database | `npm run db:reset` | Deletes all local data, then applies every migration again |
| See what the host would receive | `npm run release:assemble` | After `npm run build`. Writes `build/release/`; see "Deployment" |

Three addresses, three uses: **5173** to write front code comfortably, **8080** to see the app as the host will serve it, **8081** for the tests, which have a database of their own and empty it at will.

## Where things are

```
web/                      The front
  index.html              The single page
  public/                 Files copied as they are: neutral icons, .htaccess
    fonts/                The typefaces of the design and the legible one, with their licences
  src/
    main.tsx              Starting point
    router.tsx            Every address of the app and its screen
    api.ts                The only place that calls the API
    i18n.ts               Translation setup
    themes.ts             The list of accent themes
    locales/fr.json       Every text shown to a member
    styles/               The design system in CSS: tokens, text styles, fonts, base
    components/           The components of the Figma library, one file each
    screens/              One file per screen; one folder per feature
  dist/                   The built front (not committed)

api/                      The back
  public/index.php        Single entry point: builds and runs the Slim app
  public/.htaccess        Sends every /api/... address to index.php
  routes.php              Every address the API answers
  bootstrap.php           Loads the libraries and the configuration, and says where the data folder is
  config.example.php      Model of the configuration for the host
  config.local.php        Configuration of the local stack
  config.php              The configuration in use (not committed)
  resources/              Data shipped with the app: starting library of instruments
  src/
    Database.php          Sets up the database connection
    Http/                 Shared layer: Json, ApiError, ErrorHandler, Input, FieldErrors, Text
    Access/               Shared layer: sessions, sign-in, roles and permissions
    Install/              First-time setup of an instance
    Band/                 The band and its settings
    Health/               GET /api/health
    Migrations/           Applies the migrations: from the command line, at install, for the admin
    Mail/                 Emails, and the addresses an instance may write to
  tasks/                  Scripts run by the scheduled tasks of the host
  composer.json           PHP libraries, exact versions
  phpstan.neon            Settings of the PHP analysis
  vendor/                 The libraries themselves (not committed)

database/
  migrations/             Numbered SQL scripts
  migrate.php             Applies those that have not run yet, from the command line

tests/                    Playwright end-to-end tests
  api/                    The API alone, without a browser
  support/                Made-up band and members, access to the test database
docker/                   Image of the local web server (Apache with PHP)
docker-compose.yml        The local stack
scripts/                  setup.mjs (npm run setup), prepare-test-database.mjs, assemble-release.mjs
deploy/                   What only the host needs: its .htaccess files and the relay of /api
.github/workflows/        beta.yml (builds beta from main), release.yml (beta to release, by hand)
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
| `web-test` | The same server, on the database `brassBandTest` | http://localhost:8081 |
| `db` | MySQL 8.4 | `127.0.0.1`, port `3307`, databases `brassBand` and `brassBandTest`, user `brassBand`, password `local-only` |
| `web-test-no-mail` | The test server again, without a mail server, to test an instance that cannot send email | http://localhost:8082 |
| `web-test-allowed` | The test server again, allowed to write to one address only (`allowedRecipients`) | http://localhost:8083 |
| `mail` | Mailpit: the mailbox of the local stack. It receives every email the app sends and sends none further | http://localhost:8025 |
| `php` | The same image, used for command-line tools only. Not started with the stack | `docker compose run --rm php <command>` |

- The folders `web/dist`, `api` and `database` are shared with the `web` container, read-only: a change to a PHP file is live at once, no restart.
- **Table names are case-sensitive**, as on the Linux host and unlike a MySQL installed on a Mac. This is the reason for running MySQL in Docker: a table written `Member` instead of `member` fails here as it would in production. Do not point the app at another MySQL.
- The files members upload live in the Docker volumes `storage` (for `web`) and `storageTest` (for `web-test`), mounted at `/var/www/storage`: the only folder the server writes to. They survive `stack:down`.
- The database's data lives in the Docker volume `dbData`. It survives `stack:down`. `npm run db:reset` deletes it.
- Port 3307 is used so that a MySQL installed on the Mac can keep 3306.
- The passwords in `docker-compose.yml` and `config.local.php` are for this local stack only. They are not secrets, and must never reach the host.
- `web-test` reads the same code and the same `config.php`; only the name of its database and its own address differ, through the `BRASS_BAND_DATABASE` and `BRASS_BAND_APP_URL` variables set in `docker-compose.yml`.
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
           $songs = $this->database->fetchAllAssociative('SELECT id, name, status FROM song ORDER BY name');

           return Json::write($response, $songs);
       }
   }
   ```

2. Add its line to `api/routes.php`, **in the block that says who may call it** (see "Who can call a route"):

   ```php
   $group->get('/api/songs', new ListSongsAction($database));
   $group->post('/api/songs', new CreateSongAction($database))
       ->add(new RequirePermission(Permission::MANAGE_SONGS));
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

Valinor judges the shape. The content of each field (length, format, duplicates) is then checked with [FieldErrors](../api/src/Http/FieldErrors.php), which collects every fault and refuses them together, in the same 422 format, so that a form can show them all at once:

```php
$errors = new FieldErrors();
$errors->text('name', $input->name, 80);      // not blank, 80 characters at most
$errors->email('email', $input->email);
$errors->throwIfAny();
```

The problems a field can have are `required`, `tooLong`, `tooShort`, `invalid` and `duplicate`. A one-line text is saved after [Text::clean()](../api/src/Http/Text.php), which removes invisible characters and outer spaces of every kind; `FieldErrors::text()` judges it in that form.

Only JSON is accepted. Form data is refused on purpose: a page of another site can send a form without the browser asking, but not JSON. One exception: a file of a song, sent alone as the body of its request (see "Songs").

Rules that are about meaning (this email is already used, this slot is in the past) are checked by the action, which throws an `ApiError`.

### Refusing, and the shape of errors

Every error of the API has the same shape: an HTTP status and `{"error": "<key>"}`. The key is a camelCase word that the front translates. **The server writes no sentence**: texts live in the front's translation files.

```php
throw new ApiError(409, 'emailAlreadyUsed');
```

| Status | Key | When |
|---|---|---|
| 400 | `invalidBody` | The body is not JSON |
| 401 | `notSignedIn` | The route needs a signed-in member |
| 401 | `invalidCredentials` | Sign-in refused, whatever the reason |
| 403 | `forbidden` | The member does not hold the permission |
| 403 | `crossSiteRequest` | A browser says the request comes from another site |
| 404 | `notFound` | No such address, or no such object |
| 405 | `methodNotAllowed` | The address exists, not with this method |
| 422 | `invalidInput` | The data does not have the expected shape or content. Comes with `fields` |
| 500 | `serverError` | Anything that was not foreseen |
| 503 | — | Only `GET /api/health`, with `{"database": "unreachable"}` |
| other | the key given to `ApiError` | A refusal decided by an action |

All of this is in [ErrorHandler](../api/src/Http/ErrorHandler.php).

**An unforeseen error is logged with its class and its place, never with its message.** A database message can quote the value that caused it ("Duplicate entry 'someone@example.org'"), and values can be personal data. Keep it that way when adding logs.

Every JSON answer carries `Cache-Control: no-store` (answers hold members' data, nothing may keep a copy) and `X-Content-Type-Options: nosniff`. They are set in [Json](../api/src/Http/Json.php).

### Configuration

`config.php` returns an array and is never committed. Locally it is `api/config.php`; on a host it is in the data folder, beside the deployed folder (see "Deployment"). It is a copy of one of two files:

- [config.local.php](../api/config.local.php) for the local stack, copied by `npm run setup`. Every value in it is public.
- [config.example.php](../api/config.example.php) for the host, to fill in by hand. Its defaults are the safe ones: install is refused until an install key is written, and the session cookie only travels over HTTPS.

A new setting is added to both files. When the safe value and the convenient value differ, the code takes the safe one when the setting is missing, and only `config.local.php` says otherwise.

Secrets (database password, password of the mail server, the private key of push notifications, the token of the Discord bot under `discord.botToken`, the key that encrypts members under `encryptionKey`) go there and nowhere else. So do `timeZone`, the clock of the band, and `mapTilesUrl`, where the map of a gig reads its tiles. So does `appUrl`, the public address of the app: the links written in emails start with it, never with the host a request claims. Settings of the band (name, logo, colours) are not configuration: they belong to the `band` table.

### Who can call a route

Decided in [api/routes.php](../api/routes.php), by the block a route is written in. There are four, and nothing else decides access:

| Block | Who | How |
|---|---|---|
| 1. Public | Anyone | Written directly on `$app`. Today: health, the name, logo and icons of the band, the manifest, install, sign-in, a forgotten password, checking, validating and using a password link, and the calendar feed of a member, whose address carries its key. Adding a route here is a decision to justify |
| 2. Signed in | Any current member (`ACTIVE` or `POWER_MEMBER`) | Inside the group that carries `RequireSession` |
| 3. Oneself or one's own gig, or a permission | The member the address names, or a member holding a permission; for a gig, its organisers or who manages gigs | A route of block 2 with `->add(new RequireSelfOrPermission(Permission::...))`, or `->add(new RequireGigEditor($gigs))` |
| 4. Permission | A signed-in member holding a permission | A route of block 2 with `->add(new RequirePermission(Permission::...))` |

A new route goes in block 2 unless there is a reason. An action behind `RequireSession` gets the member with `CurrentMember::of($request)`: its `id`, and `can(Permission::...)` for a finer check inside the action.

**Roles and permissions.** A member holds roles ([Role](../api/src/Access/Role.php)). Code never tests a role: it asks for a [Permission](../api/src/Access/Permission.php), and the table inside that file is the only place that says which roles grant what. It mirrors "Roles and permissions" in [model/members.md](../model/members.md); the two change together. The permissions of a member are sent to the front in `/api/me`, to show or hide actions. Hiding is a comfort; the check that counts is the server's.

### Sessions and sign-in

All of it is in `api/src/Access/`, and the rules come from [model/members.md](../model/members.md).

- **The token.** Signing in creates a random token ([Sessions](../api/src/Access/Sessions.php)). The device keeps it in a cookie; the database keeps only its SHA-256. A copy of the database lets nobody sign in.
- **The cookie** ([SessionCookie](../api/src/Access/SessionCookie.php)) is `HttpOnly` (page code cannot read it), `SameSite=Strict` (not sent with a request coming from another site) and, on the host, `Secure` with the `__Host-` prefix.
- **Every request** behind `RequireSession` looks the session up again: it must exist, be less than a year old, have been used in the last 90 days, and belong to a member who can still sign in. A member marked as gone, or a role taken away, takes effect at the next request.
- **Sign-in** ([SignInAction](../api/src/Access/SignInAction.php)) gives one answer to every refusal, `invalidCredentials`, and takes the same time for an unknown email as for a wrong password: the route cannot be used to find out who is a member. After five wrong passwords in a row, sign-in for that member is refused for fifteen minutes, right password included. Tries are judged one at a time for a given member (the row is locked with `SELECT ... FOR UPDATE`), so that sending many at once gives no extra guesses.
- **Passwords** ([Passwords](../api/src/Access/Passwords.php)) are hashed by PHP's own `password_hash()`. Never stored, logged or sent back.
- **The rule of a new password** (1.0.0, NIST SP 800-63B-4; model/members.md, "passwordHash"). `Passwords::check()` refuses, in this order: a NUL character (`invalid`), fewer than 15 characters (`tooShort`), more than 72 bytes (`tooLong`), a password of the list of the most used (`tooCommon`), and one that holds the part of the member's email before the `@` or a word of the band's name, 4 characters or more, compared without case or accents (`tooPersonal`, with [PasswordContext](../api/src/Access/PasswordContext.php): the email of the first member and the name typed at install, the email an invited member sends, the saved email otherwise). Nothing else: no composition rule, no expiry. Hashes made under the former rule (10 characters) are kept. The front shows one hint line under every field that chooses a password, never under one that asks it ([password.ts](../web/src/screens/access/password.ts), `usePasswordHint`; `TextField` `hintTone`, Figma Hint=Success).
- **The list of the most used passwords** is [api/resources/common-passwords.txt](../api/resources/common-passwords.txt), read once per request: one per line, lowercase, sorted, lines starting with `# ` are comments. It comes from SecLists (MIT), at the commit its header names: the first 20,000 lines of `100k-most-used-passwords-NCSC.txt` and `xato-net-10-million-passwords-1000000.txt`, and `French-common-password-list-top-20000.txt`, kept at 15 characters and more, 72 bytes at most, without `@`. Entries that read like the name of a person, a birth date or a phone number were removed by hand: lists built from leaks hold them, and the repository holds no personal data, which is also why the list stops at the most used and is short (about fifty entries: few common passwords are that long). To refresh it: download the same files at a newer commit, filter them the same way (lowercase, deduplicated, sorted), read every line before committing, and change the commit in the header.
- **Forged requests (CSRF).** Three barriers: the `SameSite=Strict` cookie, [SameSiteOnly](../api/src/Access/SameSiteOnly.php) which refuses a write that a browser announces as coming from another site, and JSON-only input.
- **Limits per visitor** ([RequestLimit](../api/src/Http/RequestLimit.php), 1.0.0, issue #51; model/members.md, "Limits per visitor"). A middleware added in `routes.php` to the public routes that check a secret (sign-in, install key, install, the check, validation and use of a password link: 30 refusals in 15 minutes) or send an email (forgotten password: 10 requests an hour). It counts the refusals the route throws (any 4xx), or every request, in the table `requestLimit`, and beyond the limit answers 429 `tooManyRequests` with `Retry-After`. The visitor is `REMOTE_ADDR`, never `X-Forwarded-For`, stored as an HMAC with a key derived from `encryptionKey` (or `installKey` before the install); the rows of ended windows are deleted at each count. A database without the table (before its migration) is not limited, so that sign-in still reaches the migrations screen. The sign-in screen shows a 429 as its refusal; the other screens as "try again in a moment". Counting refusals rather than requests lets a band sign in from one network at a rehearsal. The calendar feed is not limited (see "The calendar feed").
- **The numbers** (durations, number of tries, password length, limits per visitor) are in [AccessRules](../api/src/Access/AccessRules.php).
- **What a member receives about themself** is built by [Profile](../api/src/Access/Profile.php) from an explicit list of columns: a column added to the table is never sent by accident.

| Route | Does |
|---|---|
| `POST /api/session` | Signs in. Answers the member's profile and sets the cookie |
| `GET /api/me` | The signed-in member: record, preferences, roles, permissions. 401 when nobody is signed in |
| `DELETE /api/session` | Signs this device out |
| `DELETE /api/sessions` | Signs every device of the member out |

### Install

`api/src/Install/`. Rules: "Install" in [model/members.md](../model/members.md) and [model/band.md](../model/band.md).

- `GET /api/install` says whether the app is installed (it is as soon as one member exists). While it is not, it also gives the languages the install can be done in and the starting library of sections and instruments, read from `api/resources/instrumentLibrary.<language>.json`. Each instrument of the library says whether it is preselected.
- `POST /api/install/key` tells whether a text is the install key. The welcome screen asks it before the first step, so that a wrong key is found at once. With the right key, it applies the migrations a database still waits for: on a host the tables are created here (see "Deployment"). It changes nothing else.
- `POST /api/install` receives everything at once (band name, language, sections and instruments, first member), saves it in one transaction, and signs the first member in as admin.
- This route is public and creates an admin. It is protected twice: it works only while no member exists, and it asks for the **install key**.

**The install key** ([InstallKey](../api/src/Install/InstallKey.php)) is a text that the person who puts the app online writes in `config.php`, the file where the database password already is. The install asks for it again: only someone who can read the files of the server knows it, so nobody else can install the app and become its admin while it sits online, not yet installed. Once the app is installed the key is of no use.

- A key shorter than 16 characters counts as no key: install stays closed until a real one is written.
- Wrong keys are counted per visitor (see "Limits per visitor"). Until 1.0.0 a wrong key cost a second instead, which held a PHP worker of the host.
- Locally, `npm run setup` writes a public key (`config.local.php`); nothing to do.

**The install screens** are in `web/src/screens/install/`, one file per screen of Figma:

| Address | Screen | What it does |
|---|---|---|
| `/install` | `WelcomeScreen` | Asks for the install key and checks it; shows `AlreadyInstalledScreen` on an installed app |
| `/install/band` | `BandScreen` | Name of the band, logo |
| `/install/sections` | `SectionsScreen` | Sections and instruments, ticked from the starting library; its panels add, rename, move and remove them |
| `/install/member` | `MemberScreen` | The first member; sends the install |
| `/install/done` | `DoneScreen` | What was installed |

- What the member enters is kept in memory by [InstallDraft](../web/src/screens/install/InstallDraft.tsx) and sent once, at the last step. Nothing is written on the device: reloading the page starts again from the welcome screen, and a step opened without the key sends back there. Once the install has succeeded, the key and the password are dropped from the memory.
- [sections.ts](../web/src/screens/install/sections.ts) holds the sections of the draft. Until step 2 changes something they are the starting library; what is sent is the ticked instruments, in the sections that have some. Two names are the same when they differ only by case or accents, as for the database.
- Each screen checks what it can before sending (required fields, the length of the password, the weight and the type of the logo), with the rules of the API copied as constants at the top of the file. The API checks everything again: the screens only save the member a round trip.
- [FlowLayout](../web/src/screens/FlowLayout.tsx) is the frame shared by the five screens. Its CSS also holds the three layout helpers of the steps: `FlowLayout-pair` (two fields side by side from the tablet width), `FlowLayout-columns` (cards in two then three columns, filled one after the other as drawn) and `FlowLayout-start`.
- The logo chosen at step 1 is prepared for the API as soon as it is chosen ([logo.ts](../web/src/screens/install/logo.ts)) and sent with the rest at the last step.
- The last screen leads to inviting the first members, or to the home screen.
- [Languages](../api/src/Install/Languages.php) lists the languages the app is shipped in.

### Members

`api/src/Members/`, `api/src/Sections/` and, for what touches sign-in, `api/src/Access/`. Rules: [model/members.md](../model/members.md). Every line of its tables of rights is a test in `tests/api/`.

| Address | Who | What |
|---|---|---|
| `GET /api/members`, `GET /api/members/{id}` | Signed in | The directory. Current members for everyone; invited members and those who left for who manages members |
| `GET /api/members/{id}/photo` | Signed in | The profile photo, for the members the viewer may see |
| `PUT /api/members/{id}` | Oneself, or `MANAGE_MEMBERS` | The whole record (names, email, contact details, instrument) |
| `PUT`, `DELETE /api/members/{id}/photo` | Oneself, or `MANAGE_MEMBERS` | Gives, replaces or removes the photo |
| `POST /api/members` | `MANAGE_MEMBERS` | Invites: creates the member and their password link; with a mail server, sends it to the address of the record (0.4.0, #50) and answers `invitationEmailed: true` |
| `POST /api/members/{id}/invitation` | `MANAGE_MEMBERS` | "Renvoyer l’invitation" (#50): a new link for an invited member, sent by email; the former one stops. Refused without a mail server (`emailUnavailable`), for a member who is not invited (`notInvited`), within 5 minutes of the previous email (`emailedRecently`). The token is not in the answer |
| `DELETE /api/members/{id}` | `MANAGE_MEMBERS` | Cancels an invitation |
| `PUT /api/members/{id}/status` | `MANAGE_MEMBERS` | Moves a member along the life cycle |
| `POST`, `DELETE /api/members/{id}/passwordLink` | `MANAGE_MEMBERS` | Creates or cancels a password link |
| `PUT /api/members/{id}/roles` | `MANAGE_ROLES` | Sets the roles, all at once |
| `GET /api/sections` | Signed in | Sections with their pictogram, and their instruments with the number of members who play each |
| `POST`, `PUT`, `DELETE` on `/api/sections` and `/api/instruments` | `MANAGE_SECTIONS` | Adds, renames, moves, deletes; sets the pictogram of a section, one of `SectionIcons::AVAILABLE` |
| `PUT /api/me/preferences`, `PUT /api/me/password` | Oneself | Preferences; password, with the current one |
| `GET`, `PUT /api/me/notifications` | Oneself | The seven notification settings of the account, all at once, each `OFF`, `PUSH`, `EMAIL` or `PUSH_AND_EMAIL` (`NotificationsAction`); the reminders never `OFF`, the live setlist never by email. Not in `/api/me`: see below |
| `GET`, `POST`, `PUT /api/me/calendar` | Oneself | The calendar token of the member: read it, create it when there is none, replace it (`CalendarAction`). Not in `/api/me` either |
| `GET /api/calendar/{token}.ics` | Anyone holding the address | The calendar feed of a member (`CalendarFeedAction`, `CalendarFeed`); see "The calendar feed" |
| `POST /api/passwordLink/check`, `/use` | Anyone holding a link | Says who a link is for; chooses a password with it and signs in. For an invitation, `check` gives the invited member their own record, their photo and the instruments of the band, and `use` takes the whole account (record, photo, accessibility options, password), saved together or not at all |
| `POST /api/passwordLink/validate` | Anyone holding the link of an invitation | Says whether a record would be accepted, and saves nothing: the first step of an invitation asks it. A refusal for a nickname or an email already taken is counted on the link, here and in `use`: the tenth deletes the link (`PasswordLinks::checkRecord`) |
| `POST /api/passwordLink/request` | Anyone | Forgotten password: sends a link, valid one hour, to the address given if it is the one of a current member. Always the same answer |

- **[Members](../api/src/Members/Members.php)** holds what the actions share: who sees whom, the columns that are sent (listed one by one, so that the password hash, the sign-in counters and the preferences never leave by accident), and the two rules that protect accounts.
- **"Oneself, or a permission"** is the middleware [RequireSelfOrPermission](../api/src/Access/RequireSelfOrPermission.php), declared on the route like `RequirePermission`.
- **Nobody acts on the access of someone who may do more than them** (`Members::mustCover`, `CurrentMember::covers`): the email of another member, their password link and their status. Without it, who manages members could take the password link of an admin and become one.
- **Changing the roles of a member cancels their pending password link**: the link was created by someone allowed to for the roles of then.
- **Requests that cross each other.** An action that changes a member first holds their row (`Members::target(lock: true)`), and every action takes its locks in the same order: the current admins, then the member, then their link. A record, a photo or a link sent at the instant a member leaves is then handled wholly before or wholly after the departure.
- **Always one admin**: status and roles are changed inside a transaction that first holds the rows of the current admins (`Members::lockCurrentAdmins`), so that two changes sent together cannot both remove "the other" admin.
- **A record is sent whole** (`PUT`): a contact field left out is erased. So are the preferences and the roles. No route patches one field.
- **A password link** ([PasswordLinks](../api/src/Access/PasswordLinks.php)) is a random token of which the database holds only the SHA-256, like a session. The token is in the answer that creates it, once. The front builds the address with the token after a `#`, a part of an address that browsers never send: it does not end in the log of the host. A link that opens nothing gets one answer, whatever the reason.
- **Profile photos** ([PhotoStore](../api/src/Members/PhotoStore.php)) follow the logo: the browser makes the photo a small square, the server checks it and keeps the file in `storage/members/`. Unlike the logo, a photo is served to signed-in members only, browsers are told not to share it and to ask again each time (`Cache-Control: private, no-cache`, with an `ETag` so that an unchanged photo is not sent twice).
- **Storage** is shared by the logo and the photos: [Files](../api/src/Storage/Files.php) writes and deletes, [Images](../api/src/Storage/Images.php) says what a file really is, [ServeFile](../api/src/Storage/ServeFile.php) sends it with protective headers.
- **Order of sections and instruments**: a place is asked as a number (1 is the first) and the whole list is numbered again (`Sections::place`).
- **The names, email, phone and address of a member are encrypted in the database** (0.3.1, issue #32; [model/members.md](../model/members.md), "Encryption"). Every read and write of them goes through [PersonalData](../api/src/Members/PersonalData.php); no other code touches those columns.
  - *How.* XChaCha20-Poly1305 of libsodium, which PHP ships: a fresh random nonce for each value, the name of the column as associated data, stored in the column itself as `v1:` + base64. The email is found through `emailHash`, the HMAC-SHA256 of the address in lowercase: sign-in, the forgotten password and the uniqueness of the email compare it ("Jibé@" and "jibe@" are two addresses). Nothing is searched or sorted on these columns in SQL: the lists are ordered by nickname, which stays in clear.
  - *The key* is `encryptionKey` in `config.php`, 32 random bytes in base64, made on a computer with `npm run encryption:key` (one per instance). The key that encrypts and the key that hashes are derived from it (`sodium_crypto_kdf_derive_from_key`). Without it, the install and the database update are refused (`encryptionKeyMissing`); with another key, a value does not open and the request fails (`encryptionKeyWrong`) rather than show something wrong. Locally, `npm run setup` writes one in `api/encryptionKey.local`, never committed, which `config.local.php` reads.
  - *What it protects*: a dump or a backup of the database read without the configuration. *What it does not*: someone who can read the files of the server, where the key is, as the password of the database is. **A lost key is lost data**: keep a copy apart from the backups of the database (see "What to back up").
  - *Moving to it.* Migration 015 widens the columns, adds `emailHash` and drops the checks an encrypted value cannot pass (lowercase email, two capital letters, the unique index on `email`). The SQL cannot use the key: every run of the migrations then encrypts, with PHP, the rows that have no `emailHash` yet (`PersonalData::sealExisting()`, safe to run again). Until a row is encrypted it is read in clear, and sign-in looks for it by its email in clear, so that the new code signs in on the database of the version before ("Not locking oneself out"). The release after 0.3.1 makes `emailHash` required and drops the reading of rows in clear.
  - *Trap.* `PersonalData` asks once, when it is made, whether the database has the columns of 0.3.1. A look at the columns of a table inside a transaction fixes what MySQL reads before the row it locks is held: two forgotten-password requests at once then sent two emails.
- **What sign-in answers reads only old columns.** The notification settings and the calendar token have routes of their own instead of being in `Profile`: a database not yet migrated lacks them, and sign-in must keep working to reach the migrations screen (see "Not locking oneself out").
- **The invitation leaves by email** (0.4.0, #50, [Invitations](../api/src/Members/Invitations.php)): with a mail server, inviting, bringing a member back and "Renvoyer l’invitation" send the link to the address of the record, in the language of the band, after the answer; the screen still shows the link once ("Invitation envoyée", [LinkPanel](../web/src/screens/members/LinkPanel.tsx)), to send by hand if the email does not arrive. The link of an invitation lasts 7 days whether the app sent it or not; `emailedAt` says when the app did, and the record of an invited member reads it (`passwordLinkEmailedAt`, "Invitation envoyée le 24 octobre"). A failed email is logged by its kind and changes nothing that was saved. Without a mail server, the screens are those of before.
- Not written: the export of the directory.

### The calendar feed

`api/src/Calendar/`. Rules: [model/members.md](../model/members.md) ("Calendar address") and [model/gigs.md](../model/gigs.md) (entry 5). Issue #21, decided on 2026-10-16: a subscribed calendar, never a write into anybody's calendar.

- **The address** is `/api/calendar/<calendarToken>.ics`, under `/api` so that it reaches PHP like every other route. The token is 32 hexadecimal characters drawn at random (`CalendarFeed::newToken()`), stored in clear because the screen shows the address again; it gives read access to the gigs of one member and nothing else. `POST /api/me/calendar` creates it the first time the member copies or adds the address, `PUT` replaces it ("Réinitialiser la synchro"), leaving the band erases it (`ChangeStatusAction`).
- **A wrong address** (unknown, reset, a member who left, not 32 hexadecimal characters) is answered the same 404, at once: nothing says why, and 32 random characters are not guessed. It is not limited per visitor (see "Limits per visitor"): Google Agenda reads the addresses of many people from the same network address. Until 1.0.0 the answer came after a second, which held a PHP worker of the host for each wrong address (issue #51).
- **What it holds** ([CalendarFeed](../api/src/Calendar/CalendarFeed.php)): iCalendar written by hand (a few lines, no library), one `VEVENT` per gig in `PROPOSED`, `ACCEPTED` or `CONFIRMED` where the member said yes, maybe or if needed on a slot, whose last day is less than 12 months ago. `STATUS:CONFIRMED` for a yes, `TENTATIVE` otherwise; the title is "<band> – <gig>", with the status in front when the gig is not confirmed (texts in `api/resources/push.<language>.json`, `calendar.*`). From the meeting time of the first day to the midnight that ends the last day, written in UTC from `timeZone` of `config.php`; whole days without a meeting time. `UID` is `gig-<id>@<host of appUrl>`; `SEQUENCE` counts the minutes since 2026 to the last change of the gig or of the member's answers, so that it grows when the event changes. Lines are folded at 75 bytes and texts escaped.
- **Headers**: `text/calendar`, `Cache-Control: private, max-age=0`, `X-Robots-Tag: noindex`. Nothing about the token or the feed is logged by the app. The access log of the host does hold the addresses it is asked (see "To check on the real host").
- **The screen** ([CalendarScreen](../web/src/screens/settings/CalendarScreen.tsx), [calendar.ts](../web/src/calendar.ts)) follows the device from its user agent: an iPhone, an iPad or a Mac opens its Calendar app with `webcal://`; anything else copies the `https://` address, with the steps of Google Agenda, which subscribes from a computer only. When the browser refuses to copy, the address is shown selected, to copy by hand. The app does not record when a calendar reads the feed (decided with the owner): the screen never says "in your calendar since".

### Emails

The app sends the link of a forgotten password ([ForgotPasswordAction](../api/src/Access/ForgotPasswordAction.php)), the invitation of a new member (0.4.0, #50, [Invitations](../api/src/Members/Invitations.php)), and the notifications a member chose to receive by email ([Push](../api/src/Push/Push.php), see "Push notifications" under "Gigs").

- **[Mailer](../api/src/Mail/Mailer.php)** sends through the mail server written in `config.php` (`mail`), with PHPMailer. The exchange is encrypted (`tls` or `ssl`); a configuration that says anything else, or a password without encryption, counts as no mail server at all. Without that configuration, or without `appUrl`, it sends nothing and `GET /api/band` answers `canSendEmail: false`: the forgotten password screen then sends the member to those who manage members, and an invitation is copied by hand.
- **Every email is HTML, with its plain text beside it** (0.4.0, #65; Figma, page `Emails`): `isHTML` and `AltBody` of PHPMailer. [EmailLayout](../api/src/Mail/EmailLayout.php) writes both from the same parts: Email/Header (the icon of the band, or the accent with a note), one sheet with a title, one or two sentences, the cards of what the email is about, one Primary button and its link written under it, then Email/Footer. It is written for mail clients: a table layout, inline styles, a button that is a link drawn by its padding, no halo, no glass, and every value escaped (names of gigs and songs are typed by members). [AccountEmails](../api/src/Mail/AccountEmails.php) writes the forgotten password and the invitation; [NotificationEmails](../api/src/Push/NotificationEmails.php) the notifications, from the `email` part a sender adds to its notification (`kind`, the gigs or the song), which never reaches a device: a gig is drawn as Gig/Card (date, place, meeting, status, the answer of the member, "Jouable" or "Manque : …"), a song as Song/Tile with its placeholder: the cover is served to signed-in members only, so an email cannot show it.
- **The colours of an email are those of the app, from one source.** An email is drawn in the Dark scheme and the default theme of the band (`EmailBand`), never the theme of a member. [scripts/email-theme.mjs](../scripts/email-theme.mjs) (`npm run email:theme`) reads `web/src/styles/tokens.css`, resolves for each theme the colours of the Dark scheme (translucent ones flattened over the sheet: Outlook draws no transparency) and the sizes in pixels, and writes `api/resources/emailTheme.json`, which is committed: the host builds nothing. `npm run check` fails when the file is not what `tokens.css` gives, so a change of the tokens cannot leave the emails behind.
- **The typefaces** are offered by `@font-face` from the app (`/fonts/…woff2`); `web/public/.htaccess` lets another origin read them (`Access-Control-Allow-Origin`, with `mod_headers`, enabled in the local image as on the host). A client that refuses them (Gmail) takes the sans-serif of the system. The only image is the icon of the band (`/api/band/icon/192`, public), when it has one.
- **The texts are in `api/resources/emails.<language>.json`**, in the language of the member (of the band for an invitation). An email is the one text the server writes; everything else is translated by the front. The subject of a notification is the title of its push.
- **An email leaves after the answer** ([AfterResponse](../api/src/Http/AfterResponse.php), run by `index.php` once the answer was handed over). Sending takes a second or two: the time of the answer must not tell whether an address is the one of a member. The host has no background process, so this is the end of the same request: with PHP-FPM the answer is closed first; elsewhere the `Content-Length` of the answer tells the browser that it has everything.
- **An email goes to the address the database holds**, never to the one that was typed: the database compares addresses without regard to accents, so a look-alike address finds a member, and must not receive their link. The forgotten password route also asks that the two be equal character for character.
- **Nothing about an email is logged**: when sending fails, the log holds the kind of failure only.
- Locally the emails land in Mailpit (http://localhost:8025); the tests read them there, text and HTML ([mail.ts](../tests/support/mail.ts)).

### The logo of the band and the icons of the app

`api/src/Band/`. Rules: [model/band.md](../model/band.md).

| Address | Who | What |
|---|---|---|
| `GET /api/band` | Anyone | The name, the three defaults (language, accent theme, country), whether the instance can send email and whether the band has a Discord server (`hasDiscord`, not the server), and the addresses of the logo, of the icons and of the icon of the app (null when there is none). The table holds nothing private |
| `GET /api/band/logo`, `GET /api/band/icon/{180, 192 or 512}` | Anyone | The files |
| `GET /api/manifest` | Anyone | What a phone reads to install the app: the name and the icons of the band |
| `PATCH /api/band` | `MANAGE_BAND` | Changes what is sent among the name, the accent theme, the default language and the country |
| `PUT /api/band/logo`, `DELETE /api/band/logo` | `MANAGE_BAND` | Gives, replaces or removes the logo |
| `PUT /api/band/appIcon`, `DELETE /api/band/appIcon` | `MANAGE_BAND` | Gives, replaces or removes the icon of the installed app (#34). Answers with the addresses, as `GET /api/band` |

- **The icons are drawn by the browser, not by the server.** A phone wants square PNG icons whatever the format of the logo, and the logo may be an SVG, which PHP cannot draw without an image extension that a shared host may not have. The browser of the admin reads the four formats: [logo.ts](../web/src/screens/install/logo.ts) fits the logo in a white square at the three sizes and sends the icons with the file. The server needs no image library, and nothing here depends on the host.
- **A logo travels as JSON**, like everything the API receives: the content of the file and of the three icons in base64 ([LogoInput](../api/src/Band/LogoInput.php)). No form upload, so the rule "JSON and nothing else" of `Input` has no exception.
- **[LogoStore](../api/src/Band/LogoStore.php) is the only code that touches the files.** It decides what a file is from its content (never from a name or a type that was sent), refuses what is not a PNG, a JPEG, a WebP or an SVG, refuses an SVG that declares a document type, and checks that each icon is a PNG of the exact size.
- **The files are in `storage/`**, a folder the web server does not serve: next to `api/` locally, in the data folder on a host (see "Deployment"; `bootstrap.php` gives its path as `storageFolder`). Each logo has a folder under a name drawn at random (`storage/band/<16 characters>/`); `band.logoPath` holds the path of the logo. Replacing a logo writes a new folder and deletes the old one.
- **Serving** ([ShowLogoAction](../api/src/Band/ShowLogoAction.php)): the type comes from the stored extension, the browser is told not to guess another one, and a policy forbids the file to run or load anything, because an SVG can carry scripts. An address carries the version of the logo (`?v=...`): with the current version the browser may keep the file for good, otherwise it asks again.
- **What is checked, and what is not.** A logo is at most 2 MB and 4096 pixels a side; a PNG must end as a PNG; an SVG must be written in UTF-8 and declare no document type. What an icon shows is not checked: only someone who manages the band can send one. Replacing a logo holds the row of the band until it is done, so that two replacements at the same instant leave the files of one logo only.
- **`storage/.htaccess`** is written by [Files](../api/src/Storage/Files.php) and tells Apache to serve nothing from the folder, should a host put it where it can be reached.
- **No request body above 8 MB** is read ([BodyLimit](../api/src/Http/BodyLimit.php), for every route): it is refused with 413 before anything else, signed in or not.
- **At install**, the files are written before the transaction and removed if it fails: the band is saved with its logo or not at all.
- **On the page**, [band.ts](../web/src/band.ts) gives the tab the name of the band and its icon, and the icon an iPhone takes when the app is added to its home screen.
- **The icon of the installed app** (0.3.0, #34, `band.iconPath`): a square PNG, JPEG or WebP of 512 pixels a side at least, kept with its three icons in a folder of its own (`appIcon.<ext>`, `icon-180.png`…), checked by `LogoStore::readAppIcon()` (`notSquare`, `tooSmall`, `tooBig`, `invalid`). The browser draws its icons without a margin ([appIcon.ts](../web/src/screens/band/appIcon.ts)) and refuses an image that is not square, with its size, before sending anything. `/api/band/icon/{size}` serves the icons of the band's icon when it has one, else those of the logo; removing it goes back to the icons of the logo. The settings show it as a phone does (`BandTile`).
- `LogoStore` reads the row of the band with `SELECT *`, and so does `Bands::view()`: the sign-in screen reads them before a migration is applied, when a column of the new version is not there yet ("Not locking oneself out").

### Songs

`api/src/Songs/`. Rules: [model/songs.md](../model/songs.md). Every line of its tables of rights is a test in `tests/api/songs.spec.ts`.

| Address | Who | What |
|---|---|---|
| `GET /api/songs`, `GET /api/songs/{id}` | Signed in | Every song, whatever its status. The list gives the weight of each file and the averages of the band; one song also gives its files, its parts and the levels of the member who asks |
| `GET /api/songs/{id}/cover`, `/clipThumbnail`, `/audio`, `/midi`, `/museScore`, `/parts/{instrumentId}` | Signed in | A file. With `?download`, saved under a readable name |
| `GET /api/songs/archive?kind=...&songs=1,2` | Signed in | "Download everything": a `.zip` of the parts of the member's instrument, the recordings, the MIDI or the MuseScore files of the songs given |
| `PUT /api/songs/{id}/levels` | Oneself | The two levels the member gives the song, dated today (`ratedOn`, by the clock of the band). The address names no member: nobody sets the levels of someone else. "Toujours d'accord" sends the same levels again (0.3.2, #44) |
| `POST /api/songs`, `PUT /api/songs/{id}` | `MANAGE_SONGS` | Creates a song; saves its whole record |
| `PUT /api/songs/{id}/status`, `DELETE /api/songs/{id}` | `MANAGE_SONGS` | Sets the status; deletes the song with its files, its parts and its levels |
| `PUT`, `DELETE /api/songs/{id}/cover`, `/museScore`, `/midi`, `/audio`, `/parts/{instrumentId}` | `MANAGE_SONGS` | Gives, replaces or removes a file |
| `PUT /api/songs/{id}/audio/peaks` | `MANAGE_SONGS` | Keeps the outline of the recording, computed by the browser that sent it |
| `POST /api/songs/fileNames` | `MANAGE_SONGS` | Says where each file of a list of names would go. Changes nothing |
| `POST /api/songs/trackNames` | Signed in | Says which instrument each track of a MIDI file is, from `{ names }` (100 names at most): `[{ name, instrumentId }]` in the same order, `instrumentId` null when the name tells no instrument or several. Changes nothing |
| `GET /api/instrumentAliases` | `MANAGE_SONGS` | Every instrument in the order of the band, each as `{ id, name, aliases: [{ id, alias }] }`, its aliases from A to Z |
| `POST /api/instruments/{id}/aliases` | `MANAGE_SONGS` | Gives the instrument a known spelling, from `{ alias, songName? }`. Answers with the instrument as in the list |
| `DELETE /api/instrumentAliases/{id}` | `MANAGE_SONGS` | Deletes a known spelling. Answers with its instrument as in the list |

- **[Songs](../api/src/Songs/Songs.php)** builds what is answered about a song, from columns listed one by one. One thing is not for everyone: the levels of a member and the day they were given (`ownLevels`, with `ratedOn`, that member only). The others get the average of the current members who answered and their number, rounded to one decimal, never the level of a named member. The Discord channel is sent to every member since 0.3.0, with `discordUrl`, the link that opens it (see "Discord").
- **What the setlist generator reads** (0.3.0, #25; 0.3.1, #47; model/songs.md "Setlist attributes"): `durationSeconds`, `inRepertoireOn`, `mood` (`CHILL`, `MEDIUM`, `PARTY`), and three lists replaced whole by the form, `positions` (`songPosition`: `START`, `FIRST_HALF`, `MIDDLE`, `SECOND_HALF`, `END`, in the order of a set), `tiringSectionIds` and `trickySectionIds` (`songTiringSection`, `songTrickySection`). They come with every song of the list, which the setlist editor already loads, with `copyright` (the authors, as the Sacem knows them). A song has at least one position: the API refuses an empty list (`positions: required`), and a record sent without the field gets those of a new song, the three middle ones (`SetPosition::ofNewSong()`). The categories of 0.3.0, "can also be" and "never first" went with migration 015: no song had them filled. `inRepertoireOn` is set by the API the first time the status becomes `IN_REPERTOIRE` (`SaveSongAction`, `ChangeSongStatusAction`) when it is empty; the songs of before 0.3.0 stay empty until the owner's script fills them, and an empty day is never "new".
- **The length of a song is proposed by the browser** from the MIDI file the files of an import or an edit give ([files.ts](../web/src/screens/songs/files.ts), `proposedLength()`, and `lengthOf()` in [midi.ts](../web/src/screens/songs/midi.ts)): to the end of its last note, repeats played, at the tempo of the band when `bpm` is filled; never from the recording. The MuseScore file is read once (`scoreFilesOf()` keeps its reading), for the proposal and for the files sent. A length already in the form, saved or typed, is not replaced: the model has no field that says whether a saved length came from a file.
- **A file of a song is the one exception to "JSON and nothing else"**: it is sent alone, as the body of its request, announced as `application/octet-stream` ([FileBody](../api/src/Http/FileBody.php)). A recording of 10 MB written in base64 would weigh a third more and be decoded twice in memory. Like JSON, this type cannot be sent by a page of another site without the browser asking first. [BodyLimit](../api/src/Http/BodyLimit.php) lets these addresses, and only them, receive 10 MB; it lists them, and must be kept in step with `routes.php`.
- **[SongFiles](../api/src/Songs/SongFiles.php) is the only code that touches the files.** It decides what a file is from its content: a square PNG, JPEG or WebP of 1024 pixels at most for the cover (2 MB), a zip that holds a `.mscx` for MuseScore (10 MB), `MThd` for MIDI (1 MB), MusicXML as it is (`<score-partwise`) or compressed (a zip with `META-INF/container.xml` and no `.mscx`, 10 MB), an mp3 or an m4a for the recording (10 MB), `%PDF-` for a part (5 MB). Each file has a folder of its own under `storage/songs/`, under a name of the app; replacing a file writes the new one, saves its path, then deletes the old one, with the row of the song held so that two requests cannot leave a file behind.
- **The MIDI file and the MusicXML come from the MuseScore file**, and the server takes no part in it: MuseScore cannot run on the host. The browser that sends a MuseScore file reads it (see "The front") and sends the two files it gives to `/midi` and `/musicXml`, like any other file. The server only checks what each one is.
- **Serving** ([ServeFile::privately](../api/src/Storage/ServeFile.php)): `private, no-cache` with an `ETag`, as for a photo, and ranges of bytes (`Range`), without which an iPhone plays no recording.
- **The outline of a recording** (its "peaks") is `peaks.json` beside the recording, in the same folder: it goes when the recording goes. The server has nothing to read a recording with, so the browser that sends one computes it (Web Audio, the loudness of each of 200 slices: `peaksOf()` in [files.ts](../web/src/screens/songs/files.ts)) and sends it right after, with the version of the recording it was computed from: an outline that arrives after another recording took the place is refused. The file says how it was computed (`{"kind": 2, "peaks": [...]}`): an outline written before 0.2.0, a bare list of the loudest samples, was flat on every recording (#29) and counts as none. The MP3 mode of a song without its outline asks the browser of who manages songs to compute it (`useOutline()` in [SongView](../web/src/screens/songs/SongView.tsx)); a member's browser draws plain bars.
- **The notifications of songs** ([SongPush](../api/src/Songs/SongPush.php)): a song created (`SaveSongAction`, to every current member), a MuseScore file that replaces another (`UpdateSongFileAction`, to every current member), a part added or replaced (to the members who play its instrument), each by its setting. The files sent in the first hour after a song was created notify nothing: an import sends them one by one, and "Nouveau morceau" said it.
- **The clip** ([ClipThumbnails](../api/src/Songs/ClipThumbnails.php)): an address is accepted when it is one YouTube gives for a video (`youtube.com/watch?v=`, `youtu.be/`). When the video changes, the server fetches its thumbnail once from YouTube's image server and keeps it like the other files: showing it then reports no member to YouTube. It only asks the addresses written in the class for an identifier it has checked, never the address that was typed; `clipThumbnailUrls` in `config.php` replaces them, which the test server uses to fetch a file of its own. If the host does not let PHP reach another site, or the fetch fails, the clip is saved all the same and the cover art stands in.
- **Reading the name of a file** ([FileNames](../api/src/Songs/FileNames.php)): the kind from the extension, and for a PDF the instrument whose name or alias (`instrumentAlias`) has all its words in the name of the file, the spelling with the most words winning. It is written once, on the server, and the import screen asks it before sending anything. The name of a track of a MIDI file is read by the same rule, on its whole name (`FileNames::tracks()`). Aliases come from the starting library (`api/resources/instrumentLibrary.<language>.json`), copied at install with the instruments that are kept.
- **The known spellings** ([InstrumentAliases](../api/src/Songs/InstrumentAliases.php)) are listed in the band settings but belong to whoever manages songs (`MANAGE_SONGS`, not `MANAGE_BAND`). A spelling is cleaned with `FileNames::words()` before it is saved, its words joined by one space; with `songName`, the words of the name of the song are taken out first (the box "Remember this name for next time" of the import sends the name of the file without its extension). Giving an instrument a spelling it has, or its own name, changes nothing and answers normally. A refusal is the usual 422 `invalidInput` on the field `alias`: `required` (no letter and no digit, or nothing left without the words of the song), `tooShort` and `tooLong` (2 to 25 characters), or `aliasTaken` when another instrument has the spelling or bears it as its name. With `aliasTaken`, `fields` carries one more entry, `takenByInstrumentId`, the id of that instrument written as a text since the fields of a refusal are texts: `{"error": "invalidInput", "fields": {"alias": "aliasTaken", "takenByInstrumentId": "7"}}`. It is the only refusal that names something.
- **The archive** is refused above 600 MB of files, more than a whole repertoire. It is built with PHP's `ZipArchive` (the `zip` extension, added to the local image) in the temporary folder, files stored as they are, and removed from the folder as soon as it is opened for sending. Its name is given by the screen (`download` attribute): the server writes no sentence.
- **A song not rated, or rated more than a year ago** (0.3.2, #44, model/songs.md entry 3): the sheet reads `ownLevels`. Both levels empty: a Neutral `Message` at the top, a button that scrolls to the card "Toi et ce morceau" and gives it the focus; the card is outlined (`Sheet` `outlined`). `ratedOn` more than 12 months old, counted in days of the device: the card is outlined and offers "Toujours d'accord". Migration 016 dated the levels given before from their `updatedAt`, without changing it. A check of the database keeps a day with a level and a level with a day.
- **A member who leaves** loses the levels they gave ([ChangeStatusAction](../api/src/Members/ChangeStatusAction.php)); an instrument that has a part cannot be deleted (the database refuses, `instrumentInUse`).

### Gigs

`api/src/Gigs/`. Rules: [model/gigs.md](../model/gigs.md). Every line of its tables of rights is a test in `tests/api/gigs.spec.ts`. Its screens: "The front", below.

| Address | Who | What |
|---|---|---|
| `GET /api/gigs` | Signed in | The gigs to come, the nearest first, each with its slots, the answer of the member who asks and whether it is playable. With `?all`, the cancelled gigs and those already played too |
| `GET /api/gigs/{id}` | Signed in | One gig: its record, its organisers, its costumes, its slots and the answer of every member |
| `GET /api/gigs/{id}/discord` | Signed in, who sees the gig | Every message of the channel of the gig that tags the app, the latest first, without the tag of the app (0.3.2, #45). Never an error: nothing to show is none |
| `PUT /api/gigs/{id}/slots/{slotId}/answer` | Oneself | The answer of the member who asks, from `{ answer }`. The address names no member |
| `PUT /api/gigs/{id}` | Who may edit the gig | Saves its whole record, with `organizerIds` and `costumeIds` |
| `PUT /api/gigs/{id}/status` | Who may edit the gig | Moves the gig along its life cycle. The first time it reaches a status members see, `proposedAt` is set, and never again: the home screen marks the gig as new for 15 days |
| `POST /api/gigs/{id}/slots`, `PUT`, `DELETE /api/gigs/{id}/slots/{slotId}` | Who may edit the gig | Adds, saves or deletes a slot |
| `PUT /api/gigs/{id}/slots/{slotId}/answers/{memberId}` | Who may edit the gig | The answer of a member who told them |
| `POST /api/gigs`, `DELETE /api/gigs/{id}` | `MANAGE_GIGS` | Creates a gig, in `DRAFT` with one slot; deletes a draft |
| `GET /api/costumes` | Signed in | The costumes of the band, in its order |
| `GET /api/costumes/{id}/picture` | Signed in | The picture of a costume |
| `POST /api/costumes`, `PUT`, `DELETE /api/costumes/{id}` | `MANAGE_COSTUMES` | Adds, renames, moves or deletes a costume. Answers with the whole list |
| `PUT`, `DELETE /api/costumes/{id}/picture` | `MANAGE_COSTUMES` | Gives, replaces or removes the picture, from `{ image }` in base64. Answers with the whole list |
| `GET /api/setlists/{id}` | Signed in | One setlist with its songs, where its live session is, and the name of its gig. From the moment the gig is confirmed; asked every few seconds by the live screen |
| `POST /api/gigs/{id}/setlists`, `PUT /api/setlists/{id}` | `MANAGE_SETLISTS` | Writes a setlist: its slot (asked when the gig has several), its description, its songs in order. Answers with the gig |
| `DELETE /api/setlists/{id}` | `MANAGE_SETLISTS` | Deletes a setlist; the others keep their numbers. Answers with the gig |
| `POST`, `PUT`, `DELETE /api/setlists/{id}/live` | `MANAGE_SETLISTS` | Starts the setlist live on its first song (and ends any other live setlist), moves it to `{ position }`, ends it. Answers with the setlist |
| `POST /api/gigs/{id}/reminder` | Who may edit the gig | "Relancer": a notification at once to the members who have not answered, and `remindedAt` set. Answers with the gig |
| `GET /api/push`, `PUT`, `DELETE /api/push/subscription` | Oneself | Whether the device that asks receives notifications, and the public key a browser subscribes with; keeps or forgets what the browser gave. The address names no member and no device |
| `GET /api/spokenNames`, `POST /api/songs/{id}/spokenNames/learned` | `MANAGE_SETLISTS` | What the dictation of a setlist reads (the phrases of the songs a setlist can hold) and what it learns, from `{ phrase }` |
| `GET`, `POST /api/songs/{id}/spokenNames`, `DELETE /api/songSpokenNames/{id}` | `MANAGE_SONGS` | The phrases of one song, edited by hand in its form. Answers with the phrases of the song |
| `GET /api/band/gigReminders` | `MANAGE_BAND` | The screen "Plans et setlists": the days of the two reminders of a gig, the hour they are sent from, the time between two songs of a setlist and the length of a proposed setlist (`setlistTargetMinutes`, 0.4.0) |
| `PUT /api/band/gigReminders` | `MANAGE_BAND` | The same five, all at once. `setlistTargetMinutes` from 5 to 180 by steps of 5 |

- **Who may edit a gig** is whoever holds `MANAGE_GIGS` and the organisers of that gig. It is the one right of the app that depends on the object and not only on a role, so it has its own check, [RequireGigEditor](../api/src/Gigs/RequireGigEditor.php), set on every route that changes a gig; `Gigs::mayEdit()` is the only place that says it. Each gig is answered with `canEdit`, for the screen.
- **A draft does not exist for who cannot edit it**: it is left out of the list, and its address answers 404, the same as a gig that is not there. An organiser who takes themself off a draft gets `{ id, canEdit: false }` as the answer of that save. Who may edit a gig keeps it in the list once its date has passed while it is a draft, proposed or accepted: it waits to be deleted or cancelled.
- **[Gigs](../api/src/Gigs/Gigs.php)** builds what is answered about a gig, from columns listed one by one. The Discord channel is sent to every member who sees the gig since 0.3.0, with its link (see "Discord"), and so is `setlistGapSeconds`, the time the setlist editor counts between two songs.
- **Playable** is computed from the answers each time, never stored: a slot is playable when every section that has a current member has a yes or an "if needed" from a current member (0.3.1, #37: an "if needed" is not a yes, but it counts here), a gig when one of its slots is. Each slot is answered with `isPlayable`, `missingSectionIds` (the sections with nobody who answered yes or if needed), `playableThanksTo` (the members who answered if needed in a section without a yes, `{memberId, nickname, sectionId}`: the screen names them, "Jouable, grâce à Riton (si besoin)") and `ownYesMakesPlayable` (the member answered neither yes nor if needed, and their section is the last one without anyone). The app confirms an accepted gig, and notifies it as playable, thanks to an "if needed" as well.
- **The status** follows `GigStatus::next()`, the table of the dictionary; anything else is 409 `invalidTransition`. The app changes a status by itself in one case, `Gigs::confirmIfPlayable()`: an accepted gig that is playable becomes confirmed, after an answer or when it becomes accepted. It then writes no author (`updatedByMemberId` empty). A confirmed gig never goes back by itself.
- **"In progress" and "past" are not statuses** and the server does not answer them: the screen reads them from `startsOn`, `endsOn` and `meetingTime`, on the clock of the device. The server only needs to know that a gig is over, to stop the answers and to shorten the list, and it is generous about it: a gig is over once the day after its last day has ended by the clock of the server (UTC), so that no time zone closes it early. `Gigs::firstOpenDay()` is the only place that says it.
- **Answers** are accepted while the gig is proposed, accepted or confirmed and not over (409 `gigNotOpen` otherwise), from current members and for current members.
- **Slots.** A gig always has one: the last one is not deleted (409 `lastSlot`). A slot needs a name as soon as its gig has several, so the only slot of a gig is named before a second one is added (409 `slotWithoutName`). The costume of a slot is one of the costumes of its gig, which the database checks too (a reference from `gigSlot` to `gigCostume`); taking a costume off a gig empties it on its slots first.
- **Deleting** is for a draft (409 `gigNotDraft`) nobody answered for (409 `gigHasAnswers`: a cancelled gig reopened as a draft keeps its answers). A costume a gig has, even a gig already played, is not deleted (409 `costumeInUse`).
- **The picture of a costume** ([CostumePictures](../api/src/Gigs/CostumePictures.php)) follows the photo of a member: the browser makes it small before it is sent (1200 wide at most, what the top of a gig needs on the densest phone, about 150 kB as a JPEG), and the server only checks what it receives: a PNG, a JPEG or a WebP, 1200 by 2400 at most, 800 kB at most. Nothing on the host resizes an image, so no PHP extension is needed for it. Each costume of the list is answered with `pictureUrl` and `gigCount`, the number of gigs that have it: what keeps it from being deleted.
- **The reminders of the band** are three columns of `band`, answered by `GET /api/band/gigReminders` to who manages the band (they are not in the public `GET /api/band`) and saved together by `PUT /api/band/gigReminders`, where a number of days left out means that this reminder is not sent. They are read by the hourly task below.
- **Push notifications** (`api/src/Push/`). What a member receives, and how, is a setting of the account ([NotificationSetting](../api/src/Push/NotificationSetting.php), seven columns of `member` holding a [NotificationChannel](../api/src/Push/NotificationChannel.php), `OFF`, `PUSH`, `EMAIL` or `PUSH_AND_EMAIL`, read and written by `GET`/`PUT /api/me/notifications`; `NotificationSetting::allows()` and two checks of the database refuse the reminders off and the live setlist by email); whether a device receives is the device. A sender names the setting its notification depends on, and `Push::toMembers()` sends it to each member by the channels they chose (0.3.0, #27): the push to the devices of the members who chose it, the device that made the request left out (`exceptSessionId`): it does not ring for what it just did; the email to the address of the members who chose it, whatever the device. The reminders (`notifyGigReminder`) chosen by push alone go by email when no device of the member accepts notifications. Without a mail server (`Mailer::canSend()`), a choice saved with email is read as push. One email per member and per event, all sent once the answer has left; a refusal of the mail server is logged with the kind of failure only. A device is a session: [Push](../api/src/Push/Push.php) keeps one subscription per session (`pushSubscription`), deleted with it, and only accepts the address of a push service of a browser (the list is in that class), so that a member cannot make the server call an address of their choice. What the browser gave is never answered back. Sending is done once the answer has left (`AfterResponse`), through a [PushTransport](../api/src/Push/PushTransport.php): the Web Push library on the host ([WebPushTransport](../api/src/Push/WebPushTransport.php)), a file on the test server ([RecordedTransport](../api/src/Push/RecordedTransport.php)). A device the push service says is gone is forgotten. The keys of the instance (VAPID) are in `config.php` under `push`, made once with `npm run push:keys`; without them `GET /api/push` answers `publicKey: null` and the app offers no push notification (the emails a member chose still leave).
- **The text of a notification is written by the server**, like an email, because the phone shows it while the app is closed: `api/resources/push.<language>.json`, read by [PushTexts](../api/src/Push/PushTexts.php) in the language of each member.
- **The live setlist is announced at each change** ([LivePush](../api/src/Gigs/LivePush.php)): to the members who said yes to the slot of the setlist and want it (`notifyLiveSetlist`), the device that pressed spared, the song being played and the two after it. The title starts with the position ("3/6 · Prochain : Toxic") because an iPhone cannot replace a notification: they pile up, and each one must read alone. On Android the tag makes it replace the one before, and who manages setlists gets the action "Suivant". Nothing is sent when nothing moved (the button pressed twice).
- **A gig that becomes playable, or confirmed** ([GigPush](../api/src/Gigs/GigPush.php)), is told to its organisers and to who said yes, maybe or if needed on one of its slots (`notifyGigPlayable`, `notifyGigConfirmed`). `AnswerAction` compares the playability before and after the answer it saves; when the same answer also confirms the gig, only "Plan validé" is sent. `ChangeGigStatusAction` sends "Plan validé" when a gig becomes confirmed, by hand or by the app. Every change counts: a gig put back and confirmed again is told again.
- **Reminders** ([Reminders](../api/src/Gigs/Reminders.php)): one notification per member, with one line per gig, to the `ACTIVE` members who have not answered for one slot at least; never to a power member. By the channels of `notifyGigReminder`. The two numbers of days of the band can come in any order since Band v1.9: two reminders that fall on the same day are sent once. The button of a gig sends it for that gig. The automatic ones are sent by [api/tasks/gigReminders.php](../api/tasks/gigReminders.php), a script to run every hour as a scheduled task of the host (see "Deployment"): it reminds for the gigs in `PROPOSED` and `ACCEPTED` that start in exactly the first or the second number of days of the band, from the hour of the band, unless they were already reminded for that day. Running it twice changes nothing. The clock is the one of `timeZone` in `config.php`.
- **What the dictation learned** ([SpokenNames](../api/src/Songs/SpokenNames.php), `songSpokenName`): a phrase is cleaned the same way by the server and by the front (`cleanPhrase` in [dictation.ts](../web/src/screens/gigs/dictation.ts)): lowercase, no accents, letters said one by one joined. A phrase names one song: learned for another it moves; added by hand it is refused with the song that has it (`phraseTaken`, `takenBySongId`) until `moves` is sent. Beyond 20, the oldest phrase of the song leaves, learned or typed. The name of the song itself is never saved.
- **The map of the meeting point** needs nothing from the server but its address: `mapTilesUrl` of `config.php` (the vector tiles of the OpenStreetMap Foundation when left out, no map when empty), answered with a gig that has coordinates.
- **A member who leaves** no longer organises the gigs that are not over, and stays on those already played, with their answers ([ChangeStatusAction](../api/src/Members/ChangeStatusAction.php)). An organiser and an answer are sent with the nickname, so that they still read once the member is out of the directory.

### Export, import and reprise

`api/src/Transfer/`. Rules: [model/export-import.md](../model/export-import.md). 0.4.0, issue #43 (and #50 for the invitations). Every route asks for `TRANSFER_DATA`, which only `ADMIN` grants (export-import.md: "the admin only"; Members, "Roles and permissions").

| Address | What |
|---|---|
| `GET /api/transfer` | How much each part holds (members, songs and the weight of their files, gigs), the zips waiting in the folder "import", and whether the instance can send email |
| `POST /api/transfer/export` | From `{ parts, password }`: the zip of format 1, as a download. The password is asked again ([CurrentPassword](../api/src/Access/CurrentPassword.php)) |
| `GET /api/transfer/templates` | "Télécharger les modèles": the zip of the templates of a reprise, made for this installation |
| `PUT /api/transfer/upload?name=…` | A zip dropped on the screen, sent alone as the body (`application/octet-stream`, like a file of a song), copied piece by piece to the folder "import". Up to 250 MB ([BodyLimit](../api/src/Http/BodyLimit.php) lets this address alone receive it) |
| `POST /api/transfer/read` | From `{ name, parts? }`: what a zip of the folder holds and what it would add and update, or every problem, with its file and line. Writes nothing |
| `POST /api/transfer/import` | From `{ name, parts, password, sendInvitations }`: loads it, all or nothing. Answers `signedOut: true` when every session ended (an export that holds members) |

- **The folder "import"** is at the root of the data folder, beside `config.php` and `storage/` (decided with the owner): `<folder>-data/import/` on a host, `/var/www/import` in the local image. An admin drops a zip there by FTP when it is too large for the browser; a zip sent from the browser is kept there between the reading and the loading. A zip is named by its file name alone ([TransferFolder](../api/src/Transfer/TransferFolder.php)); it is deleted once loaded, refused at the loading, or read with problems (the admin corrects the files and drops it again).
- **An export** ([Exporter](../api/src/Transfer/Exporter.php)) writes the parts ticked as the document describes: `manifest.json` with the SHA-256 of every file, one folder per part with its `data.json` and its files. The logo and the icon of the app travel with the icons drawn from them; a recording with its outline (`peaks.json`). The encrypted fields of a member are written in clear (the password is asked again), passwords as their hashes; the preferences of an account never.
- **An import of format 1** ([ExportImport](../api/src/Transfer/ExportImport.php)) checks the manifest (the format, the hash of every file) and that the admin who imports is an admin in the file, then applies each part chosen, settings, members, songs, gigs, inside one transaction, every row checked by the same classes as the forms of the app (`MemberRecord`, `SongRecord`, `GigRecord`, `PhotoStore::read()`, `LogoStore::read()`, `SongFiles::nameOf()`…). Reading a file for the screen is the same work, undone at the end: what the screen counts, and every problem, is what the import would do, references between parts included. **Add or update, never delete** (decided with the owner on 2026-10-24, the model over the wording drawn in Figma): a row of the installation the file does not hold stays; inside a row of the file its own lists are replaced. After an import that holds members, every session ends.
- **A reprise** ([Reprise](../api/src/Transfer/Reprise.php) reads, [Loader](../api/src/Transfer/Loader.php) writes) reads `members.csv`, `songs.csv`, `gigs.csv`, `slots.csv`, `answers.csv` with PHP's own `fgetcsv` ([Csv](../api/src/Transfer/Csv.php)): no library, this is all a spreadsheet writes. The separator is `;` or `,`, found from the header row; a row is numbered as the spreadsheet numbers it. A value of a list is its code or its label in the app, case and accents ignored ([Values](../api/src/Transfer/Values.php), labels in `api/resources/transfer.<language>.json`). Every row is checked by the same records as the forms; a row whose key exists updates it, an empty cell leaves a value as it is. A mobile number without its "+" is refused: the server has no rules of the numbers of every country, and the owner chose not to add a library for it. A new member is invited unless written as having left; a member who left loses what served only while they played, as in the app. The files of a song are placed by `FileNames::place()`, as the import of songs does. No notification leaves; a gig loaded is never shown as new (its `proposedAt` is put before the 15 days).
- **What the server writes is never trusted from the file**: a file is checked as an upload is, and written to a new folder of `storage/` under a name of the app. If anything fails, the files written are deleted and nothing is saved; the files a load replaces are deleted only once the rows are saved.
- **A file of a zip is read through [ZipFiles](../api/src/Transfer/ZipFiles.php)**, never with `getFromName()` alone: the size the zip gives is checked first, and no more than the limit is ever unpacked (20 MB for a table or a `data.json`, the limit of its kind for a file of a song, 10 MB for any other). A zip of 250 MB can hold gigabytes once unpacked; read whole, it would stop PHP, and the zip, kept in the folder, would stop every later reading.
- **Roles and links.** A load that changes the roles of a member cancels their pending password link, as the app does (Members, "Roles"). An import refuses a file in which the admin who imports could no longer sign in (`importerCannotSignIn`: no password, or a status other than active).
- **The invitations** of the members a load adds without a password leave after the answer ([Invitations](../api/src/Members/Invitations.php)), when the switch is on and the instance has a mail server. A member already in the installation is never invited again by a load: loading twice sends nothing.
- **The scores of a reprise.** A reprise gives a song its MuseScore file alone; the MIDI file and the MusicXML are produced from it by a browser, never by the host (model/songs.md, "Generated files"). `GET /api/transfer` lists the songs that have a MuseScore file and neither of the two (`scoresToRead`); the import screen reads them right after a load, one after the other, in the admin's browser ([ScoreReading](../web/src/screens/band/ScoreReading.tsx), [readScores.ts](../web/src/screens/band/readScores.ts), with `scoreFilesOf()` of the import of songs), sends the two files through the routes of a song, and gives a song without a length the one of its MIDI file. A page closed halfway leaves the rest listed, read again from the button "Lire les partitions". A score the engine cannot read stays listed too, and is named on the screen; it is not read again unless asked.
- **The screens** ([BandImportScreen](../web/src/screens/band/BandImportScreen.tsx), [BandExportScreen](../web/src/screens/band/BandExportScreen.tsx), [transfer.ts](../web/src/screens/band/transfer.ts)) are reached from the row "Exporter et importer" of the band settings. The export downloads the zip through a link made from the answer; the templates are a plain link. The problems are written by the front from the keys the server gives (`band.transfer.problem.*`), a key it does not know reading as "not valid".
- The tests write and read zips with Node's own zlib ([tests/support/zip.ts](../tests/support/zip.ts)) and drop one in the folder as FTP would (`dropByFtp`).

### Discord

`api/src/Discord/`, [DiscordSettingsAction](../api/src/Band/DiscordSettingsAction.php), [DiscordMessagesAction](../api/src/Songs/DiscordMessagesAction.php), [GigDiscordMessagesAction](../api/src/Gigs/GigDiscordMessagesAction.php). Rules: model/band.md ("Discord"), model/members.md (`section.discordRoleId`), model/songs.md ("Display"), model/gigs.md ("Discord on a gig"); creating the bot: [docs/discord-bot.md](discord-bot.md). Issues #33 and #45.

| Address | Who | What |
|---|---|---|
| `GET /api/band/discord` | `MANAGE_BAND` | The server of the band, whether the configuration holds a token (`hasBot`, never the token), whether the bot reaches the server (`bot`: `none`, `connected`, `refused`, `unreachable`, with its name), the name of the app on Discord (`botName`, the name of the bot, 0.3.2), the roles a section can be tagged with, and the sections with their role. With `?withoutBot`, Discord is not asked: the summary of the settings only needs to know whether a server is set |
| `PUT /api/band/discord` | `MANAGE_BAND` | From `{ link, sectionRoles }`: the server, read from the link of any of its channels (or its identifier), and the role of each section. One role tags one section. Another server, or none, empties the roles |
| `GET /api/songs/{id}/discord` | Signed in | Every message of the channel of the song that tags both the app and the section of the member who asks, the latest first, without the tag of the app, and the name of the role (0.3.2, #45). Never an error: nothing to show is none |

- **A link is read by [DiscordLinks](../api/src/Discord/DiscordLinks.php)**: `https://discord.com/channels/<server>/<channel>` (and `discordapp.com`, `ptb.`, `canary.`, a link of a message), or the identifier alone. The app keeps identifiers, never links. The channel of a song or a gig is refused when it names another server than the band's (`otherServer`), or when the band has none; a channel the object already has is kept as it is, so that a form sends back what it was given. The links the app shows are written by the server (`discordUrl`, the `url` of each message), never by the front from the identifiers.
- **The bot reads, through the REST API, version 10** ([Discord](../api/src/Discord/Discord.php)), with Guzzle, already there for the push notifications: no new library. It never connects to the gateway, which a host without a long-running process cannot keep open, so it shows offline in Discord. It asks `GET /guilds/{id}` (does the bot reach the server, and its name), `GET /users/@me` (the bot itself: who the app is, and its name), `GET /guilds/{id}/roles` (a section chooses among them, without `@everyone` and the roles Discord manages for bots; the role Discord made for the bot, `tags.bot_id`, is how the app is tagged by role) and `GET /channels/{id}/messages?limit=100`. The token goes in the header `Authorization: Bot …`, with the `User-Agent` Discord asks for.
- **What Discord answers is kept 10 minutes** in the temporary folder of the server (`sys_get_temp_dir()`), in a folder of this instance only (its name comes from the storage folder), readable by PHP alone, never in the database: the messages belong to Discord. An answer past its time is erased at the next request to Discord, not only skipped. The folder is used only when this app made it: one that belongs to another account, or that anyone can open, is left alone and Discord is asked each time (its name can be guessed). A refusal or a silence is kept a minute, so that a member opening songs does not hammer a Discord that says no. The settings screen asks again each time. Nothing about Discord is logged: an address names a channel, an answer holds messages.
- **The messages meant for the app** (0.3.2, #45, `Discord::messagesForApp()`) are those that tag it: the bot in `mentions`, or its role in `mention_roles`. Nothing is typed in the settings: the app reads who it is from Discord. A gig shows every one of them; a song only those whose `mention_roles` also hold the role of the section of the member (the section of their instrument). There is no limit: all of the last 100 messages that qualify, the latest first. The tag of the app (`<@id>`, `<@!id>`, `<@&role>`) is taken out of the text. The rest of the text is cleaned by `Discord::readable()`: a mention of a role or of a member becomes `@name`, a custom emoji its `:name:`; what cannot be named keeps its sign alone, since the server writes no word of its own. Without a bot, a role, a channel or a server, or when Discord refuses or does not answer, the answer has no message: the card shows its sentence and its button.
- **The test server reads a made-up Discord** from files the tests write (`BRASS_BAND_DISCORD_ANSWERS` in docker-compose.yml, [tests/support/discord.ts](../tests/support/discord.ts)): `discord.answersFrom` in `config.php` replaces the requests to Discord by those files. No test ever reaches Discord. What only a real bot can tell is in "To check on the real host".

### Not written yet

- **The export of the directory**, which asks for the password again: not drawn, not built.

## The front

### How it starts

[web/index.html](../web/index.html) loads [web/src/main.tsx](../web/src/main.tsx), which sets up three things and draws the app:

- **translations** ([i18n.ts](../web/src/i18n.ts));
- **the query client** of TanStack Query, which keeps what the API answered;
- **the router** ([router.tsx](../web/src/router.tsx)), which picks the screen for the current address.

### Who is in front of the app

The session is a cookie the page cannot read. The front learns who is signed in by asking `GET /api/me` ([session.ts](../web/src/session.ts), `useMe()`): a member, or nobody.

- **Every address is under one of two guards** ([Guards.tsx](../web/src/screens/access/Guards.tsx)), set in `router.tsx`: `MembersOnly` around the app (anyone else goes to `/sign-in`, or to `/install` when no band exists), `VisitorsOnly` around the screens shown before sign-in. The guards are a comfort: what protects the data is the API, which refuses every request without a session.
- **A password link opens `/password#<secret>`.** What follows the `#` is never sent to a server; the page reads it and sends it in the body of its requests ([PasswordLinkScreen.tsx](../web/src/screens/access/PasswordLinkScreen.tsx)).
- **Signing out empties the memory of the page** (`useSetMe(null)` clears every answer kept by TanStack Query): nothing a member saw stays for the next person on the device.
- **[AppearanceOf](../web/src/AppearanceOf.tsx)** decides the look and the language: the choices of the account when someone is signed in; otherwise the scheme of the device, the theme and the language of the band, and the accessibility options chosen before sign-in. Those are kept in the storage of the browser, on the device only ([deviceAccessibility.ts](../web/src/deviceAccessibility.ts)); the options of an account are never written there. **The text size is the exception** (Members v1.20, issue #18): it is a setting of the device, signed in or not, kept in that same storage and never sent to the server; signing in or out does not change it. The column `member.textSizePercent` was dropped in 0.2.0 (migration 013), a release after the code stopped reading it.
- **The record of a member is one form**, [MemberRecordFields](../web/src/screens/members/MemberRecordFields.tsx), used by an invitation, the profile and those who manage members; [record.ts](../web/src/screens/members/record.ts) turns what is typed into what the API receives. A phone number is typed the local way and stored in the international one ([phone.ts](../web/src/screens/members/phone.ts), with libphonenumber-js): a number without a prefix belongs to the country of the member, or to the one of the band. A photo is cropped to a square and redrawn by the browser before it is sent ([photo.ts](../web/src/screens/members/photo.ts)).
- **Managing members** ([screens/members/](../web/src/screens/members/)): the list is a `Sheet` of `MemberRow` below 1024 px and a `MemberTable` from there; each exists once on the screen, the other is not drawn. A screen offers only what the member may do (`permissions` of `GET /api/me`, and `covers()` in [manage.ts](../web/src/screens/members/manage.ts) for the access of someone who may do more), and an action that cannot be done stays visible, disabled, with its reason. This is a comfort: the API decides. A password link is shown once, in [LinkPanel](../web/src/screens/members/LinkPanel.tsx), as `/invitation#<secret>` or `/password#<secret>`, and is kept nowhere.
- **The settings of the band** ([screens/band/](../web/src/screens/band/)), for admins: the appearance (name, logo, accent colour, default language) is saved with its button, since it changes what everyone sees; a section or an instrument is saved at once, from its sheet, and the API answers with the whole list. What is still used cannot be deleted: the button stays, disabled, with the numbers that explain it: `memberCount` of `GET /api/sections` counts the current members who play an instrument, and `otherMemberCount`, given to admins only, the invited and former members whose record still holds it. One entry is not for admins alone: the known spellings ([BandSpellingsScreen](../web/src/screens/band/BandSpellingsScreen.tsx), `/band/spellings`) are for whoever holds `manageSongs`. A member who manages songs without being an admin sees the entry of the band settings in the Settings tab, and the summary with that single row; any other member is sent back to the settings. A spelling is added or deleted at once from the sheet of its instrument; after a deletion the focus goes to the spelling that took its place, or to the line that adds one.
- **A preference applies at once** ([preferences.ts](../web/src/screens/settings/preferences.ts)): appearance and accessibility have no save button. The choice is shown in the same instant as the press, then saved, and put back if the server refuses. A form that changes what others see or how the member signs in (profile, password) keeps its button.
- **Songs** ([screens/songs/](../web/src/screens/songs/)). [SongsScreen](../web/src/screens/songs/SongsScreen.tsx) is the list, and from 1024 px the list beside the song; below that width a song takes the whole screen. [SongView](../web/src/screens/songs/SongView.tsx) is the song in its modes; the Live mode takes the whole screen over it. The view of the list (rows or grid) and the mode last used are kept on the device ([device.ts](../web/src/screens/songs/device.ts)): comforts, nothing about the member.
- **Home** ([screens/home/](../web/src/screens/home/)). [HomeScreen](../web/src/screens/home/HomeScreen.tsx) is the first tab: the confirmed gig of the day (`GigHero`), the gigs that wait for an answer of the member (`AlertCard`, whose filter narrows the list), every gig to come the member sees, and the three latest songs of the repertoire (`SongLatest`), pinned above the tab bar below 1024 px and in a column on the right from there (provisional). It asks nothing new of the API: the list of gigs (`GET /api/gigs`, with `proposedAt`), the gig of the day alone for its costumes, its address and its coordinates (`GET /api/gigs/{id}`), the list of songs (with `createdAt`), and the action that saves an answer. A card is the one of the list of gigs ([ListedGig](../web/src/screens/gigs/ListedGig.tsx)) with its own link, so that the four answers of a gig with one slot sit under it, outside the link; an answer is written into the list kept in memory at once, and the focus goes to the card, or to the title of the list when the filter takes the card away. What depends on the clock (the gig of the day, “Nouveau” for 15 days, how long before the band meets) is read on the device and looked at again every 30 seconds. The cross of the latest songs is a variable of the module: it holds from a tab to another, and a reload forgets it.
- **Gigs** ([screens/gigs/](../web/src/screens/gigs/)). [GigsScreen](../web/src/screens/gigs/GigsScreen.tsx) is the list, by month, and from 1024 px the list beside the gig (300 wide at 1024, growing to 390 at 1280, 440 from 1920); below that width a gig takes the whole screen. On a desktop the gig opened when the address names none is written into the address at once, so that it stays open when an action moves it in the list. [GigView](../web/src/screens/gigs/GigView.tsx) is one gig, and decides what comes first from its state: the answers while it is proposed or accepted, the meeting once it is confirmed, and what a draft, a gig to close, a cancelled and a past gig say of themselves. [WhoComesScreen](../web/src/screens/gigs/WhoComesScreen.tsx) lists every answer of a slot, and lets who may edit the gig note the answer of a member; a gig of several slots shows one slot at a time, chosen by a row of chips (`?slot=`). [ManagePanel](../web/src/screens/gigs/ManagePanel.tsx) changes the status, among those the model allows after the current one, and deletes a draft. [GigFormScreen](../web/src/screens/gigs/GigFormScreen.tsx) creates and edits a gig.
- **What the dates say is read on the device** ([gigs.ts](../web/src/gigs.ts), `momentOf()`): in progress, past, to close, and a draft out of date are never stored and never answered by the API. The same file holds the types of what the API answers.
- **Who comes is put together on the device** ([attendance.ts](../web/src/screens/gigs/attendance.ts)): the API answers the answers given; the directory and the sections say who could answer, in which section, and in which order. A slot is shown with the count of yes "out of" the current members.
- **An answer shows in the instant it is pressed**, then it is saved, and goes back to what was saved if the server refuses. The four answers are radio buttons drawn as buttons (`ChoiceButton`): the arrows move between them without choosing, unlike the radio buttons of the browser, because an answer is saved when chosen and one answer can confirm a gig for good; Space chooses. They stay usable while an answer is being saved.
- **The form of a gig saves in two times**: the record with its organisers and its costumes, then its slots (those taken off, those kept, the new ones), since a slot chooses its costume among those the gig has just been given. Until the button is pressed nothing is changed, a deleted slot included. A slot that is saved can be taken off only while another saved one stays, which keeps the order of these requests simple. When a slot fails, the gig just created is remembered and the slots that were saved take their identifier: saving again edits, and adds nothing twice. An organiser who takes themself off stays on the gig until its slots are saved, then is taken off by a last request. A date and a time are the fields of the browser (`type="date"`, `type="time"`): the picker of the device, no library.
- **"Y aller"** opens the maps of the device: Apple Maps on an iPhone or a Mac, the `geo:` address on Android, OpenStreetMap elsewhere, on the coordinates of the gig or on its address. With coordinates, the address in words goes with them, so that the maps app names the point. Nothing is asked of a map service before the member presses the button. The map of Figma is not drawn: its provider is not chosen.
- **The pictures of the statuses** are files of the app (`web/public/gigPictures/`, WebP, 1200 wide; the pictures of Accepté and Validé are the render of the Figma variant of Gig/Picture, which carries the crop of the owner, 780 wide, the most the connector exports), named after the status: replacing one is replacing its file. A gig that has costumes with a picture shows them instead ([GigPicture](../web/src/components/GigPicture.tsx)): one, or two or three cut by diagonals with `clip-path`.
- **The costumes and the reminders of gigs** are two screens of the settings of the band, for admins ([BandCostumesScreen](../web/src/screens/band/BandCostumesScreen.tsx), [BandRemindersScreen](../web/src/screens/band/BandRemindersScreen.tsx)). A costume is saved at once from its panel; the reminders are saved with their button, and the screen says that they are not sent yet.
- **Setlists** ([GigSetlists](../web/src/screens/gigs/GigSetlists.tsx), [SetlistFormScreen](../web/src/screens/gigs/SetlistFormScreen.tsx)). A gig answers with its setlists from `CONFIRMED` on, and with none before (`Setlists::ofGig()`). They show as an accordion (`SetlistCard`), the live one open first. The form is written by typing: the songs offered are those the band plays (in the repertoire or temporary), compared without case or accents; Enter adds the first and never sends the form. Or picked from the list of every such song (`SongPickerRow` in a `Panel` that stays open; a tick for a song already in this setlist; each tap appends). The list filters, in the browser, on what it has loaded (0.3.2, #52): "Pas joués" keeps the songs with no dot (in no setlist of the gig, this one as it is being written included) and adds up with the moods, which add up between them; all off each time the list opens. The `PlayedDots` of a song count its places in the other setlists of the gig (in the list, every setlist, this one included), computed on the device from the setlists the API answers with the gig. The whole setlist is saved at once (`songIds` in order); the number is given by the server. A song is moved by its handle, removed by a swipe to the left that reveals "Retirer" (a longer swipe removes it); without a pointer, the row takes the focus, Delete removes it and Alt with an arrow moves it ([SetlistSongRow](../web/src/components/SetlistSongRow.tsx)).
- **The length of a setlist and the generator** (0.3.0, #25; 0.4.0, #60). Above the list of the editor, `SetlistLength` adds up the lengths of the songs and `setlistGapSeconds` between two of them, rounded to the minute, and counts the songs without a length (`lengthOf()` in [generator.ts](../web/src/screens/gigs/generator.ts)). When a setlist is read, its card says the same under its title ("Après le repas · 13 min · 4 morceaux"), from the `durationSeconds` each song of a setlist carries in the answer of the API; with no length known, the count alone. "Proposer des morceaux" opens a `Panel` (a BottomSheet, a Dialog from 1024): how long (`Stepper` with `step` 5 and `unit` "min", 5 to 180, starting from `band.setlistTargetMinutes`, which the gig answers with `setlistGapSeconds`), the new songs or not. Under the stepper, how many songs should fit: the length plus one gap, over the mean length of the songs it can draw from plus one gap (`songsThatFit()`). `proposeForLength()` starts from that number, draws, then takes one song fewer while the draw is too long, or one more while it still fits, each number getting up to 20 draws: the places of a set depend on how many songs it has, so a number is a draw of its own. A song without a length counts as the mean; with no length known at all, it proposes 10 songs as before 0.4.0. After a proposal, no message but the rules it could not keep. The proposal is drawn in the browser by [generator.ts](../web/src/screens/gigs/generator.ts), from the songs the editor already loads, by the rules of model/gigs.md v1.9 (entry 4), in their order: each song where one of its positions allows (`positionsOf()`: a place is counted at its centre, (p − ½) / n; the first three take Début, the last three Fin, a place among both, in a set of five or fewer, either; the others their half, and the middle from 0.35 to 0.65), a tiring song in the first half unless it is among the last three with Fin, no two songs tricky for the same section side by side. The mood is no rule: it weighs the draw at each place (Chill likelier near the start, Teuf near the end, Médium the same everywhere; weighted random order of Efraimidis and Spirakis). The last three places are filled first, which the fewest songs can take, then the others from the start. Each draw is a few hundred random tries; when none keeps every rule, the last rule is dropped and the screen says which went (`dropped`). The songs of the other setlists of the gig are left out as long as there are enough. The proposal replaces the songs of the editor; nothing is saved before "Enregistrer la setlist". The module imports nothing of React, so that [tests/api/generator.spec.ts](../tests/api/generator.spec.ts) runs it with a fixed seed (`seeded()`).
- **The live setlist** ([LiveSetlistScreen](../web/src/screens/gigs/LiveSetlistScreen.tsx)) takes the whole window, without the menu. `setlist.livePosition` is the only state: the screen asks for the setlist every 4 seconds (no websocket on the host) and brings the song being played to the focus line, which is the top padding of the list. The list snaps to its songs (`scroll-snap`); for who manages setlists, the song that rests on the line for 350 ms becomes the one being played, and a scroll the screen made itself is ignored. Styles and opacities follow the distance to that song (`--fadeNear` to `--fadeFaint`, full or nearly in high contrast). The screen is kept on with the Screen Wake Lock where the device has it. The book button shows the Live mode of the song (`LiveView`) in place of the list; closing it comes back.
- **Dictating a setlist** ([useDictation.ts](../web/src/screens/gigs/useDictation.ts), [dictation.ts](../web/src/screens/gigs/dictation.ts)). The browser recognises the speech (Web Speech API, no library): the sound goes to the recogniser of the device, only text reaches the app. Each thing heard is compared with the names of the songs a setlist can hold and with the phrases learned for them: heard exactly, or clearly ahead of the next one, the song is added; two that are close are offered ("Tu as dit … : lequel ?"); nothing close adds nothing. How close is measured as in the prototype the owner tried on his phone: the pairs of letters two texts share, on the text and on a rough key of its sound (so that an English title heard the French way still meets its name), letters named in a row ("dé a enne cé e") being joined first; among the wordings the recogniser gives, the one closest to a song is kept. The language listened for is a key of the locale (`dictation.language`, "fr-FR"). The phrase is learned when the member chooses, or when they remove the song the dictation just added and type another one at once; typing alone teaches nothing. A browser without speech recognition shows no microphone. The phrases of a song are edited in its form ([SpokenNames.tsx](../web/src/screens/songs/SpokenNames.tsx)).
- **The map of the meeting point** ([GigMeetingMap](../web/src/components/GigMeetingMap.tsx)) is a still picture drawn by MapLibre: not moved by hand, zoom 17, two buttons that change it by 1 between 12 and 19, and a press that opens the maps app like "Y aller". Its style ([mapEngine.ts](../web/src/components/mapEngine.ts)) draws the land, water, building and street layers of the Shortbread schema in the `map…` colours of the scheme (the main roads in `mapStreetMajor`, lighter in the dark scheme; the ways of a car park or of a pedestrian area thin like the paths, so that the streets stand out), read from the CSS where the map is and applied again when the scheme or the contrast changes; it has no layer of names, so no font is asked for. The library is imported when a map appears, never before. "© OpenStreetMap" is written by the app and always visible; the tiles are asked by the browser, which sends its Referer. For assistive technology the map is decoration: the address is in words beside it.
- **Notifications** ([push.ts](../web/src/push.ts)). A device that can receive them and was never asked is asked once, when the app opens ([AskNotifications](../web/src/screens/settings/AskNotifications.tsx), remembered in the browser's own storage and forgotten at sign-out). [NotificationsScreen](../web/src/screens/settings/NotificationsScreen.tsx) has the switch of the device first (what asks the browser for its permission), then the six settings of the account in two sheets, applied at once and put back if the server refuses; with the device off they are shown disabled and kept. The reminders are a row that cannot be turned off. An iPhone only has notifications in the app added to the home screen: the screen says so, as a warning with its help.
- **Leaving a form with changes asks first** ([LeaveGuard.tsx](../web/src/screens/LeaveGuard.tsx), `useLeaveGuard`): written once with `useBlocker` of React Router, it catches every way out, the back button of the browser included. Used by the form of a setlist; a form that wants it gives it "has something changed" and calls `letGo()` once saved.
- **Putting a list in order by dragging** ([Sortable.tsx](../web/src/components/Sortable.tsx)): `SortableList`, `useSortableRow` and `SortableHandle`, over `@dnd-kit`. A row is dragged by its handle, or by itself where Figma draws no handle (the costumes: a finger rests on the row a moment first, so that the page still scrolls). Dragging is for a pointer; each list keeps a way for the keyboard: "Monter" and "Descendre", or Alt with an arrow on a row of a setlist.
- **One recording plays for the whole app** ([Player.tsx](../web/src/screens/songs/Player.tsx)): the browser's own audio player, never shown, held by a provider around the screens of signed-in members ([Guards.tsx](../web/src/screens/access/Guards.tsx)), so that it goes on from a screen to another and stops with the session. The song draws it in its MP3 mode, every other screen in the mini-player (`SongMention`).
- **A MuseScore file is read by the browser that sends it** ([files.ts](../web/src/screens/songs/files.ts), [score.worker.ts](../web/src/screens/songs/score.worker.ts)). The MuseScore engine compiled for the browser (`webmscore`, about 17 MB) is not in the bundle: `vite.config.ts` serves its four files as they are at `/webmscore/`, where the engine looks for them beside itself, and only a worker started by `sendFiles()` loads them, so a member who imports nothing never downloads them. One worker per file: the engine does not open a second score after closing one. It gives the MIDI file and the score as compressed MusicXML (`.mxl`). A part hidden in the MuseScore file (`<show>0</show>`, an instrument unticked in MuseScore, #35) is then emptied by the page, which reads the `.mscx` of the archive: its notes leave the MIDI file (`withoutNotes()` in midi.ts; the track stays, the first one carries the tempos and the marks) and become rests in the MusicXML (`withEmptiedParts()` in score.ts, sent then as plain MusicXML), so that the measures and the rehearsal marks stay. A part without any note is shown neither by the MIDI player (`readMidi()` leaves it out) nor by the Live mode (`partsOf()`). A song sent before 0.3.0 keeps its files until its MuseScore file is sent again. A file of MuseScore 4.4 holds a line (`<LastEID>`) the engine does not know and answers with an empty score, without an error; and MuseScore 4 writes its key signatures as the concert key (`<concertKey>`), which the engine does not know either: every staff came out in C, the sharps and flats moved onto the notes (#41). For such a file the worker gives the engine the score of the archive alone (its `.mscx`), without that line and with each key written the older way (`<accidental>`), as the instrument of its staff reads it: the concert key moved by the transposition of the part (`withWrittenKeys()` in score.ts, checked against the parts MuseScore 4 saves in the same file). The MIDI file is the same note for note: only the drawing changed. A song imported before 0.3.2 keeps its MusicXML without keys until its MuseScore file is sent again. When it cannot read the file (or after 90 seconds), the MuseScore file is sent alone, the screen says that the MIDI player and the reading mode have nothing, and a `.mid` or MusicXML file dropped by hand is sent instead; without one, the MIDI file and the MusicXML the song had from an earlier score are removed, since they are no longer its own. What the score gives is sent after it, and not at all when the score itself is refused.
- **The tracks of the MIDI file are named after the staves.** A MuseScore file gives each part two names: the one printed on the staff and the one of the sound that plays it; a MIDI file exported by MuseScore carries the second. The worker writes the first in each track (`withTrackNames()` of [midi.ts](../web/src/screens/songs/midi.ts)), in the order of the parts, which is the order of the tracks. **The rehearsal marks of the score go the same way**: MuseScore writes none in a MIDI file, so the worker reads them in the MusicXML (`rehearsalMarks()`), asks the engine when each measure is played, repeats included (`measurePositions()`), and writes each mark as a MIDI marker (`withMarks()`). The loop of the MIDI player offers them, each with the measures up to the next mark (`markRanges()`). Only real rehearsal marks count, not staff or system text.
- **The MIDI player** ([MidiView.tsx](../web/src/screens/songs/MidiView.tsx)) reads the file with `midi-file` ([midi.ts](../web/src/screens/songs/midi.ts): notes, tempo and measures, all counted in ticks, so that the tempo changes without reading anything again). It asks the server which instrument each track is (`POST /api/songs/trackNames`); a track nobody recognises keeps the name the file gives it. Each lane is a canvas drawn around the playhead, hidden from screen readers: what it tells is carried by the mute button (`aria-pressed`) and the number of the measure. MuseScore writes several measures of rest as one long measure ("54/8"): such a time signature is ignored when the measures are counted.
- **The sound** ([midiEngine.ts](../web/src/screens/songs/midiEngine.ts)): one `Soundfont` of `smplr` per track, through a volume of its own (the mute), handed its notes a fifth of a second ahead on the clock of Web Audio. The samples are files of the app (`web/public/soundfonts/`, see "Files taken from other projects"), never fetched from another site: `smplr` would by default. They cover the instruments of a brass band; any other General MIDI sound is played with the nearest (`samplesOf()`). Each instrument weighs 2 to 3 MB and is downloaded when the MIDI mode of a song that uses it is first opened; the browser then keeps it. The recording of the band and the MIDI file never play together.
- **The Live mode** ([LiveView.tsx](../web/src/screens/songs/LiveView.tsx)) shows one part of the score, rising line by line at the tempo. It is a modal `<dialog>` over the whole screen: the page behind cannot be reached, Escape leaves, and the focus comes back to the mode bar. It is never the mode a song opens in. [score.ts](../web/src/screens/songs/score.ts) reads the MusicXML kept with the song (it opens a compressed `.mxl` itself, with the `DecompressionStream` of the browser, and stops at 50 MB), keeps one part (`partAlone()`: the rehearsal marks, which MuseScore writes in the first part only, are copied into it; the tempo mark is taken out, the screen says the tempo) and works out the order and the length of the measures, repeats and voltas included (`timelineOf()`, lengths in quarter notes). Jumps written in words (D.S., D.C., coda) are not followed. The part is the one of the member's instrument, found by the names of the parts as for the tracks (`POST /api/songs/trackNames`).
- **The Live mode driven by the MIDI player** (#10). A piano button beside the start measure opens "Lire avec le MIDI" (`MidiChoice` in [LiveView](../web/src/screens/songs/LiveView.tsx)): the tracks with their mute, one line each, the tempo and the volume of the cut tracks. These are the settings of the MIDI mode: both read and write [midiSettings.ts](../web/src/screens/songs/midiSettings.ts), a store per song kept in the memory of the page. Its button starts a `MidiEngine` from the chosen place, and the score follows `engine.position()` instead of the clock. To know which written measure the player is at, the import writes in the MIDI file, as cue points "m12", where each measure of the score is played, jumps included (`withMeasures()` in [midi.ts](../web/src/screens/songs/midi.ts), from `measurePositions()` of the engine, in [score.worker.ts](../web/src/screens/songs/score.worker.ts)); `writtenAt()` and `tickOfPlace()` read them. A file imported before 0.2.0 has none: its measures are taken in the order of the repeats, and a jump written in words is not followed until its MuseScore file is sent again. The chip "Suit le MIDI" pauses the player and opens the sheet again; a drag of the score moves the player too.
- **The part is drawn by Verovio**, started once and loaded only when the Live mode first opens (a chunk of 8 MB, 2.4 MB in transit, kept by the browser), told to read MusicXML and nothing else. One line of the score takes the width of a phone; from 768 px two lines sit side by side, three from 1024, each as narrow as on a phone: Verovio draws one narrow column and the lines (`g.system`) are moved into rows. They are laid out again when the width changes, once it has stopped changing. **The drawing is built from a file a member sent and is not trusted**: `safeDrawing()` keeps only the shapes and the texts of a drawing with the attributes that draw them, no style, no link out of the drawing; the few rules Verovio writes in a `<style>` are in `songs.css`. A row already played stands back; a repeat brings the sheet back down. Nothing is played: the clock alone moves the score, the member drags it (or uses the wheel or the arrow keys) to catch up with the band, staying in the pass of a repeat the band is in, and the screen is kept awake while it plays (Wake Lock, asked again when the app comes back). The tempo is the one of the band, else the one of the first measure of the score, or the one the member taps: one measure of taps, eighths in compound time, and the song starts on the next beat. The score stays in place under the taps.
- **A part is drawn by pdf.js** ([PdfView.tsx](../web/src/screens/songs/PdfView.tsx)), loaded only when a part is opened: a phone does not show a PDF inside a page by itself.
- **The clip** loads nothing from YouTube before the member presses play; the player is then `youtube-nocookie.com`, for the identifier the server read from the address (`clipVideoId`), and the thumbnail is the one the server keeps.
- **Files dropped on a song** ([files.ts](../web/src/screens/songs/files.ts)) are placed by the server from their names, shown, corrected, and only then sent one by one: the cover cropped to a square of 1024 pixels by the browser, the recording followed by its outline. Two files for the same place: the last one wins. A file that is refused does not stop the others, and is named with the reason. The import ([ImportScreen](../web/src/screens/songs/ImportScreen.tsx)) and the edit form ([SongEditScreen](../web/src/screens/songs/SongEditScreen.tsx)) share this, and the record of a song is one form ([SongForm.tsx](../web/src/screens/songs/SongForm.tsx)). Saving is the record first, then each file: a file that fails leaves the record saved, and says so.
- **The screens of a flow** (install, sign-in, forgotten password, invitation) share one frame, [FlowLayout](../web/src/screens/FlowLayout.tsx). **The screens of the app**, once signed in, share another, [AppLayout](../web/src/screens/AppLayout.tsx): the `TabBar` floating at the bottom below 1024 px, the `SideNav` on the left from there, with the title of the page and its actions on one line. A screen opened from a tab (a form, a record) gives `back`: the TabBar leaves and a way back shows. The five entries are written once, in [nav.ts](../web/src/components/nav.ts). `width="centred"` puts the title and the content of a screen in one column in the middle of the pane on a desktop (the home screen). After sign-in a member lands on the home screen (`HOME` in `session.ts`).

### Adding a screen

1. Create `web/src/screens/<feature>/<Name>Screen.tsx`, a React component built from the components of `web/src/components/`.
2. Add its line to `web/src/router.tsx`: `{ path: '/songs', element: <SongsScreen /> }`. A variable part is written `:id` and read with `useParams()`.
3. Link to it with `<Link to="/songs">`, never with a plain `<a>`, which would reload the whole app.

An address that matches no screen shows `NotFoundScreen`. On the host, [web/public/.htaccess](../web/public/.htaccess) answers any address that is not a file with `index.html`, so that opening `/songs/12` directly works.

Components that draw a business object follow the names of the design (`Song/Row` in Figma, `SongRow` in code) and live in `web/src/components/` with the others.

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

[NotFoundScreen](../web/src/screens/NotFoundScreen.tsx) is the smallest screen; [GigsScreen](../web/src/screens/gigs/GigsScreen.tsx) shows a list read with `useQuery`.

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
- The key of a refusal of the API is turned into text by the screen that made the request, which knows which refusals it can meet (`signIn.refused`, `invalidPasswordLink`…). `errors.unreachable` is the text of any other failure.
- Dates and numbers are formatted with the browser's `Intl`, not with a library.
- Content typed by members (song titles, places) is never translated.
- To add a language: add `locales/<language>.json` with the same keys and list it in `i18n.ts`. The default language will come from the `band` table.

### The design system in code

The design is made in Figma and read from there ([CLAUDE.md](../CLAUDE.md), "Reading the design"). The code mirrors it name for name, so that a change in Figma has one obvious place here.

| In Figma | In the code |
|---|---|
| The four variable collections (`Primitives`, `Theme`, `Scheme`, `Size`) | [styles/tokens.css](../web/src/styles/tokens.css): a variable keeps its name, `accent` is `--accent` |
| The text styles (`display` to `micro`) | [styles/text.css](../web/src/styles/text.css): one class each, `.textDisplay` to `.textMicro` |
| The typefaces (`fontDisplay`, `fontText`) | [styles/fonts.css](../web/src/styles/fonts.css), files in `web/public/fonts/` |
| A component (`Button`, `Section/Card`) | `web/src/components/Button.tsx` and `Button.css`, `SectionCard.tsx` |
| A variant (`Kind=Primary`) | A prop with the same values (`kind="primary"`), written on the element as `data-kind` for the CSS |
| A slot (`Content`) | `children` |
| An icon (`Icon/Globe`) | `<Icon name="Globe" />` for `Style=Outline`, `<Icon name="Globe" filled />` for `Style=Filled`; the paths of both styles are in [iconPaths.ts](../web/src/components/iconPaths.ts), generated from Figma, and drawn by [Icon.tsx](../web/src/components/Icon.tsx) |

Rules that keep it true:

- **No component holds a value of its own.** Colours, spacing, radii and sizes come from `tokens.css`; typefaces, sizes and weights of text come from the classes of `text.css`.
- **The alias chain of Figma is kept**: `Scheme` variables point to `Theme` and `Primitives` with `var()`, and the type sizes and typefaces of `Size` point to `TextSize` and `Typeface`. Each collection has one block per mode in `tokens.css`, and the mode is one attribute on the root element: `data-scheme` (`dark` or `light`), `data-contrast="more"` (the two high contrast modes), `data-theme="tangerine"` (absent: the first theme, `brass`), `data-text-size="140"` (absent: 100 %), `data-typeface="legible"`. The list of themes is in [themes.ts](../web/src/themes.ts).
- **A part of a screen can take a scheme of its own**, as a frame does in Figma when its mode is set by hand. An element that carries `data-scheme="dark"` (or `"light"`) gets the `Scheme` variables of that mode, whatever the scheme of the app: each block of `Scheme` in `tokens.css` applies to the root and to such an element, with the same `var()` chain. It follows the contrast of the root, so dark becomes dark high contrast when high contrast is on. Only what floats over the cover of a song uses it (`ModeBar`, and the cover and the compact form of `SongHeader`), because a cover can be of any colour. Such an element sets `color: var(--text)` itself: the colour of the text is inherited already computed. `appearance.ts` stays the only place that writes on the root.
- **Glass.** A floating surface is the `glass` colour and a blur of what is behind it. Figma uses its native glass effect (the effect style `glass`), which CSS cannot copy: the blur stands in for it, with no stroke on the components of the songs.
- **Sizes are in rem.** Figma gives pixels; `tokens.css` writes them as pixels divided by 16, text and spacing alike. The app never changes the size of the root: the text size option of a member changes the type sizes only (the modes of `TextSize`), so spacing, radii, icons and controls keep their size, and the height of a control is always a `min-height`. A browser whose own font size was changed scales everything, page titles included: this is accepted. Lines (1 and 2 px) and the halo stay in pixels.
- **Blur.** Figma counts a blur twice as large as CSS does: a blur of 40 in Figma is `blur(20px)`.
- **Bricolage Grotesque has an optical size axis**, which the browser applies by itself as Figma does: big titles are drawn tighter. Its font files must keep that axis, or titles come out wider than drawn and wrap differently.
- **Typefaces are served by the app**, never by a font service: no visitor is reported to a third party. A test checks that the install screen asks nothing of another site.
- A component that Figma does not have is not created here.

The components written so far. Base layer: `Icon`, `Pictogram`, `PlayedDots`, `Button`, `IconButton`, `TextField`, `ImageField`, `Checkbox`, `Radio`, `Switch`, `SegmentedControl`, `Slider`, `FilterChip`, `ListRow`, `NavRow`, `SwitchRow`, `SliderRow`, `AccessibilityOptions`, `Chip`, `Sheet`, `Message`, `Avatar`, `ThemeSwatch`, `QuickAction`, `StepIndicator`, `ScreenTop`, `BottomBar`, `TabBar`, `SideNav`, `Halo`, `ModeBar`, `DropZone`, `Waveform`, `LevelScale`, `Rating` (and its `RatingStar`), `Gauge`, and `Panel`, which gives `BottomSheet` and `Dialog`. Business objects: `InstrumentRow`, `SectionCard`, `SectionBadge`, `PictogramChoice`, `BandMention`, `MemberCard`, `MemberRow`, `MemberHeader`, `MemberMention`, `MemberTable` (the header and the rows of Figma), `SongTile`, `SongRow`, `SongCard`, `SongHeader`, `SongMention`, `SongTable` (the header and the rows of Figma), `SongFileRow`, `SongPartRow`, `SongPartTrack`, `SongPickerRow`. Every control is the browser's own (checkbox, radio, range), drawn as in the design: it keeps the keyboard, the focus and what screen readers say.

- **`TextField` has three forms**, as in Figma where the select is a `TextField` with a chevron: `TextField` (an input), `SelectField` (the browser's own `<select>`, for a short list) and `PickerField` (a button that opens a panel, for a choice made in a list of rows).
- **A row with a checkbox** is `ListRow` with `checked` and `onCheck`: the label and the checkbox are one target. `Checkbox` is the browser's own, drawn as in Figma.
- **One choice among several** is a group of radios: `ListRow` with `selected`, `onSelect` and a shared `group`, inside an element with `role="radiogroup"` (the status of a song, the rehearsal marks of the loop). `Radio` is the browser's own, drawn as in Figma: the dot tells the choice, not a colour alone.
- **`BottomBar` takes its main button first.** On a phone it is on top; from the desktop width the buttons are shown in reverse, the main one on the right.
- **`Waveform` is a slider**: the browser's own range input, laid over the bars and not drawn itself. It always draws the 54 bars of Figma, whatever the number of peaks it is given.
- **`LevelScale` can be emptied**: pressing the level already chosen gives `null`, which a group of radio buttons cannot do alone.
- **`SongHeader` replaces `ScreenTop` on the screen of a song**, whose top is the cover: in its large form it sets the same top margin (32 px, or the safe area plus 8 px) for the buttons that float over the cover.
- **A panel made to type something** marks its field with `data-autofocus`: the focus goes there when the panel opens, instead of the close button.

**Reading a component or a screen from Figma.** The Figma connector is used read-only. Besides `get_design_context` and `get_screenshot`, a short read-only script run with `use_figma` gives the exact names of the variables bound to each layer, which is what the CSS needs. Screenshots of Figma are the visual target: after building a screen, it is captured at the four widths and compared with them.

**Panels.** `BottomSheet` and `Dialog` are the browser's own `<dialog>` element ([Panel.tsx](../web/src/components/Panel.tsx)): the browser keeps the focus inside, closes on Escape and makes the rest of the page inert. A screen uses `Panel`, which is a bottom sheet below 1024 px and a dialog from there. Three things in it are there for a reason: it opens once the event that asked for it is over (a panel opened with the Enter key would otherwise be confirmed by the same key press); a press closes it only when it started and ended on the scrim (a selection dragged out of a field must not); and when a change removes the control that opened it, the screen says which control takes the focus instead (see `SectionsScreen`).

**The four widths.** Figma draws 390, 768, 1280 and 1920. The layouts change at 768 (tablet), 1024 (desktop) and 1920 (wide). The desktop layout starts below the width it is drawn at, so that a laptop window that is not full screen keeps it; `Panel` and `BottomBar` change at the same 1024. On a desktop the left of the window is a floating glass panel, 16 px from the edges, as tall as the window and in place while the right side scrolls: in a flow it carries the step and the title (448 px wide at 1280, 648 at 1920), in the app it is the menu. The frame of the install screens, [FlowLayout](../web/src/screens/FlowLayout.tsx), is the example to follow for a flow. The top of every screen is [ScreenTop](../web/src/components/ScreenTop.tsx), the only place where the top margin is set: 32 px, or the safe area of the device plus 8 px when that is more. The other safe areas come from `env(safe-area-inset-*)` too, never from the 34 px that Figma leaves in its phone frames.

**Appearance and accessibility options.** [appearance.ts](../web/src/appearance.ts) is the only place that writes on the root element. It takes the scheme, the accent theme and the six options of whoever uses the app (`model/members.md`), adds what the device asks (a light scheme, more contrast, less motion) and follows the device when it changes. A small script, [appearance.js](../web/public/appearance.js), sets the scheme and the contrast of the device before the page is drawn, so that nobody sees a flash of the dark scheme. What each option does: text size, the legible font and high contrast are modes of the variables (`tokens.css`); increased spacing (`data-spacing`) and reduced motion (`data-motion`) are rules of [base.css](../web/src/styles/base.css), which win over every component; extended timeouts (`data-timeouts`) is read by what shows a notification, when the app has some. In the high contrast modes the three fields of the halo take the colour of the ground: no rule hides it. The legible font, Atkinson Hyperlegible Next, is served by the app like the two others and downloaded only by who turns the option on.

### Installable app (PWA)

- The manifest is what makes the app installable. It is served by the API (`GET /api/manifest`, [ManifestAction](../api/src/Band/ManifestAction.php)) because its name and its icons are those of the band.
- Before the install, and for a band without a logo, the name is "Brass band" and the icons are the grey placeholders of `web/public/appIcons/`.
- **The icon of the browser tab** (0.3.1, #48, model/band.md "The icon of the browser tab") is `/api/band/icon/192`, named in [index.html](../web/index.html) itself, with `/api/band/icon/180` for an iPhone: the icon of the band, else its logo. Without either, the address leads (302, checked every time) to the neutral icon of `appIcons/`. The page names it before any script runs: some browsers (Safari) keep the icon read with the page and never follow a change made afterwards. `BandIdentity` then writes the versioned addresses, which the browser may keep. An instance with a logo and an icon of the app serves the icon of the app at every one of these addresses, never the icons of the logo (#56, `tests/shell.spec.ts`). A browser keeps the icon of a tab in a cache of its own, apart from its HTTP cache: one that showed the logo before the band gave its icon can go on showing it for a while. **`/favicon.ico`** (0.4.0, #63), which Safari and Chrome ask whatever the page names (bookmarks, restored tabs), is a 302 to `/api/band/icon/192`, written in [web/public/.htaccess](../web/public/.htaccess): before, it fell to the rule of the single page and answered `index.html`, which a browser cannot draw and replaced by a grey square it kept. A redirect and not a rewrite, because the API reads the address the browser asked for.
- A phone that has already installed the app may keep the old name and icon until the app is installed again: this is how phones behave.
- **The install guide** (0.3.1, #36, model/members.md "Install guide") is the screen `/install-app` ([InstallGuideScreen](../web/src/screens/settings/InstallGuideScreen.tsx)); what decides it is in [installGuide.ts](../web/src/installGuide.ts). It is offered once per device, right after sign-in or the end of an invitation: the screens that sign in, and `VisitorsOnly`, go on to `afterSignIn()`, which is the guide on a phone or a tablet in a browser where it was never offered, home otherwise. Seen once, it is remembered in `localStorage` (`installGuideOffered`), read and written inside `try/catch`; nothing goes to the server. It stays in the settings ("Installer l’app") while the app is not installed, and the button of the notifications of an iPhone opens it too; "Plus tard" goes back where it was opened from (`state.back`), home the first time. The notifications are not asked over it.
  - **Telling the device**, from what the browser says of itself (`navigator.userAgent`): an iPhone says `iPhone` or `iPod`; an iPad says `iPad`, or says it is a Mac (`Macintosh`) and is told from one by its touch screen (`navigator.maxTouchPoints > 1`); Android says `Android`. Anything else is a computer, and gets no guide: Chrome and Edge offer the install themselves there.
  - **Telling Safari** on an iPhone or an iPad: it says `Safari/` and none of `CriOS` (Chrome), `FxiOS` (Firefox), `EdgiOS` (Edge), `OPiOS` or `OPT/` (Opera), `GSA/` (the Google app), `DuckDuckGo`. The browser inside another app (Instagram, Facebook) does not say `Safari/`: it gets the screen of "another browser", which copies the link to open in Safari.
  - **Already installed**: `matchMedia('(display-mode: standalone)')`, or `navigator.standalone` on an older iPhone. No guide and no row in the settings then.
  - **The install window of Android**: Chrome fires `beforeinstallprompt` when it would install the app, often before the guide is on the screen, so the app listens for it from its start (`listenForInstallPrompt()` in `main.tsx`) and keeps it. While it is kept, the Android guide is a button that opens that window; without it, three steps through the menu ⋮. The event opens the window once.
  - The tests start every screen test on a device where the guide was offered (`storageState` in `playwright.config.ts`); `tests/installGuide.spec.ts` starts from an empty one and stands in for the devices by their user agent.
- The service worker ([web/public/sw.js](../web/public/sw.js)) does one thing: it shows the push notifications and opens the app where they point (and, for who manages setlists, moves the live setlist on from the notification). It caches nothing: offline use is not a goal. It is registered when a member turns notifications on, not before.
- The icons are in `appIcons/`, not `icons/`: see "Traps".
- **The top of an installed app on an iPhone** (#28): the page draws under the status bar, which stays translucent (`apple-mobile-web-app-status-bar-style` set to `black-translucent` in [index.html](../web/index.html)); the root and the body take the ground of the scheme, and `appearance.ts` writes that ground in `theme-color`, so that nothing of another colour shows above a screen. The top of each screen keeps clear of the status bar through `env(safe-area-inset-top)` (`ScreenTop`, `SongHeader`).

## Database and migrations

The schema is described in `model/` (DBML, one file per domain), and created by numbered SQL scripts in `database/migrations/`.

**The order is always: the model first, the migration second.** A migration is written only for a domain validated in `model/`. The rules for the model and for writing migrations are in the `brass-band-model` skill (`skills/`).

- A script is named `001_members.sql`, `002_songs.sql`: a number, then what it does.
- `npm run db:migrate` runs [database/migrate.php](../database/migrate.php), which applies, in order, the scripts that have not run yet. On a host without a command line, the install and the admin ask the same work through the API (see "Deployment").
- Scripts that have run are recorded in the `schemaMigration` table. It is technical: it is created by the runner ([Migrations](../api/src/Migrations/Migrations.php)) and is not part of the model.
- **A script that has run is never edited**, since it would not run again. A correction is a new script.
- If a script fails halfway, the runner stops and says so. MySQL does not undo table changes: what ran before the error stays. Locally, fix the script and run `npm run db:reset`. On the host, the database must be repaired by hand before trying again, which is why a migration is always tried locally first.
- A migration, the DBML and the dictionary change in the same commit.

Migrations are plain SQL files rather than the PHP classes that migration libraries use, so that the owner can read and review them. This is why the runner is our own code ([Migrations](../api/src/Migrations/Migrations.php), about 150 lines).

The migrations are listed at the top of each dictionary of `model/`, with the version of the model they come from.

### Conventions of every table

Written once in [model/members.md](../model/members.md), "Storage conventions", and applied by every migration:

- `createdAt`, `updatedAt` and `updatedByMemberId` on every table: a technical trace, filled by the database for the two dates and by the API for the member.
- Instants are `DATETIME` columns holding UTC. The API sets its connection to UTC (`Database.php`), so that `CURRENT_TIMESTAMP` and every value read or written agree whatever the clock of the host. `TIMESTAMP` is not used: in MySQL it stops in January 2038. Converting to the member's local time is the front's job, with `Intl`.
- Tables are `utf8mb4` with the `utf8mb4_unicode_ci` collation: text is compared without regard to case or accents, which is what makes a nickname unique in the way a person expects. Hashes and codes that must be compared exactly are declared `ascii_bin`.
- Every rule of the model is a constraint in the database (`NOT NULL`, `UNIQUE`, `FOREIGN KEY`, `CHECK`), not only a check in PHP. A refused write is a bug in the API, which should have refused first with a proper error key.
- When reading the database by hand with the `mysql` command, add `--default-character-set=utf8mb4`: without it, accents typed in a query are stored wrongly.

## Tests

Tests are end to end, with Playwright, in `tests/`, in TypeScript. They run against the test server on port 8081, so they exercise the real API and a real database.

- **`tests/api/`** tests the API alone, without a browser. This is where rules are checked: who may do what, what is refused, what is saved.
- **The other files** drive a real browser, twice: as an Android phone (Chromium) and as an iPhone (WebKit). The phone is the main use; there is no desktop run.

**The tests have their own database**, `brassBandTest`, and empty it whenever they need to. They never touch the data of port 8080. `npm test` creates that database and applies the migrations to it first (`scripts/prepare-test-database.mjs`). Because they share it, tests run one at a time.

Writing a test of the API:

```ts
test.beforeEach(async ({ playwright, baseURL }) => {
  emptyDatabase();                                   // a database never installed
  const setup = await playwright.request.newContext({ baseURL });
  await install(setup);                              // the made-up band and its admin
  await setup.dispose();
});

test('a member without the right cannot rename the band', async ({ request }) => {
  const email = addMember({ nickname: 'Zaza', roles: ['SONG_MANAGER'] });
  await signIn(request, email);
  expect((await request.patch('/api/band', { data: { name: 'x' } })).status()).toBe(403);
});
```

- [tests/support/scenario.ts](../tests/support/scenario.ts) holds the made-up band and members, `install()`, `addMember()` and `signIn()`. Nobody in it is real.
- [tests/support/songFiles.ts](../tests/support/songFiles.ts) builds made-up files of a song (a PDF a reader can draw, the first bytes of an mp3, a MIDI, a MuseScore file, MusicXML) and sends them as the front does: no music file sits in the repository. `readableScore()` is a MuseScore file the engine can read (two staves, a scale): it is built on demand by [makeScore.mjs](../tests/support/makeScore.mjs) with `webmscore`, in a process of its own, and never kept.
- [tests/support/database.ts](../tests/support/database.ts) gives `emptyDatabase()` and `sql()`, to set up what the API cannot (a session that is 91 days old) and to look at what was saved.
- Each `request` keeps its own cookies, like one device. A second device is `playwright.request.newContext({ baseURL })`.
- **Tests are written from the dictionary, not from the code**: each line of an "Access rights" or "Roles and permissions" table in `model/` becomes a test, the refusals as much as the permissions.
- A browser test finds elements by their role or their state (`getByRole('status')`), not by their French text, so that a change of wording does not break it.
- After a failure, `npx playwright show-report` opens the report.
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
| `phpmailer/phpmailer` | 7.1.1 | Sends emails through a mail server (SMTP) | No dependency of its own, maintained for more than twenty years, the most used mail library in PHP. LGPL 2.1 |
| `cuyz/valinor` | 2.6.0 | Turns incoming JSON into typed objects, or refuses it | No dependency of its own, strict by default, works with PHP enums |
| `minishlink/web-push` | 11.0.0 | Encrypts a push notification for a device and signs the request to the push service (Web Push, VAPID) | The reference in PHP, MIT, maintained. Encryption is not written at home. It brings `web-token/jwt-library`, `spomky-labs/base64url`, `spomky-labs/pki-framework`, `brick/math`, `php-http/discovery`, `php-http/httplug`, `php-http/promise` and three PSR interface packages, and needs an HTTP client that it does not bring: Guzzle, below |
| `guzzlehttp/guzzle` | 8.2.0 | The HTTP client the Web Push library calls the push services with (it finds it by itself, `Psr18ClientDiscovery`), and that the bot of the band calls Discord with ([Discord](../api/src/Discord/Discord.php)) | The most used HTTP client in PHP, MIT. It brings `guzzlehttp/psr7`, `guzzlehttp/promises` and two Symfony polyfills |

`php-http/discovery` is also a Composer plugin that can install a client by itself: it is turned off in `composer.json` (`allow-plugins`), so that nothing is installed that the owner did not validate.

### PHP, development only

| Library | Version | What it does here |
|---|---|---|
| `phpstan/phpstan` | 2.3.1 | Static analysis |

### JavaScript, built into the front

| Library | Version | What it does here | Why this one |
|---|---|---|---|
| `react`, `react-dom` | 19.3.0 | The interface | Settled in the scoping |
| `react-router` | 8.4.0 | Addresses and screens | The standard router of React |
| `pdfjs-dist` | 6.4.299 | Draws the PDF of a part inside the screen of a song | Mozilla's own PDF reader, the one of Firefox; Apache 2.0. Android's browser shows no PDF inside a page, and writing a PDF reader is out of reach. About 1.7 MB with its worker, loaded only when a part is opened |
| `webmscore` | 1.2.1 | Reads a MuseScore file in the browser of whoever imports a song, and gives its MIDI file and its MusicXML | The MuseScore engine itself, compiled to WebAssembly by the LibreScore project: nothing else reads `.mscz`, and the host cannot run MuseScore. GPL 3, compatible with the AGPL of this repository. Not updated since January 2023: it reads the files of MuseScore 4.7, may not read those of a later version, and a MIDI and a MusicXML file exported by hand are then the way out. About 17 MB, served outside the bundle and loaded only during an import |
| `midi-file` | 1.2.4 | Reads the events of a MIDI file, and writes it back with its tracks named again | Small, no dependency, MIT; it is what `@tonejs/midi` is built on. That one was tried first: it cuts a track in two when MuseScore gives it two channels and loses its name, and it cannot write a file back |
| `smplr` | 1.1.0 | Plays the notes of the MIDI player with recorded samples of instruments | Maintained, MIT, no dependency, made for Web Audio; the library of the earlier app of the band. Told where the samples are, so that it never asks another site |
| `verovio` | 6.3.0 | Draws a part of the score in the Live mode, for the width of the screen | The engraving library of the RISM, maintained, no dependency, LGPL 3 (compatible with the AGPL of this repository). Chosen by the owner over `opensheetmusicdisplay` (six times lighter) for the quality of its drawing, on two real scores. 8 MB, loaded only when the Live mode opens |
| `libphonenumber-js` | 1.13.14 | Reads a phone number typed the local way and writes it in the international form, and back | Google's own rules for every country, without a dependency. Writing them here would only work for one country |
| `@dnd-kit/core`, `@dnd-kit/sortable` | 6.3.1, 10.0.0 | Dragging a row to its place: the songs of a setlist by their handle, the costumes by their row ([Sortable](../web/src/components/Sortable.tsx)) | Touch, automatic scrolling while dragging and the measuring of rows are what goes wrong when written at home. MIT; no release since December 2024, which is the risk taken. The keyboard does not go through it: "Monter" and "Descendre" stay |
| `maplibre-gl` | 6.14.0 | Draws the map of the meeting point from vector tiles ([mapEngine.ts](../web/src/components/mapEngine.ts)) | The open successor of Mapbox GL, BSD 3. Served by the app and loaded only when a gig shows a map (about 270 kB compressed); the style asks for no font and no image, so nothing comes from a CDN. |
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

### Files taken from other projects

Not installed by a package manager: copied into the repository, with their licence beside them.

| What | Where | Licence |
|---|---|---|
| The typefaces Bricolage Grotesque, Instrument Sans and Atkinson Hyperlegible Next | `web/public/fonts/` | SIL Open Font License 1.1, one `…-OFL.txt` per family |
| The samples of ten instruments (trumpet, trombone, tuba, French horn, alto, tenor and baritone saxophone, clarinet, flute, drum kit), about 25 MB | `web/public/soundfonts/FluidR3_GM/` | From the Fluid R3 General MIDI SoundFont by Frank Wen, Creative Commons Attribution 3.0, as rendered by the `midi-js-soundfonts` projects of Benjamin Gleitzman and Paul Rosen; the notice is `web/public/soundfonts/NOTICE.txt` |
| The paths of the icons, which come from Iconsax (Linear for the outline style, Bold for the filled one) | [iconPaths.ts](../web/src/components/iconPaths.ts) | Iconsax free licence: use integrated in the source code is allowed, with the notice kept at the top of [Icon.tsx](../web/src/components/Icon.tsx); redistributing the icons as loose files or as an icon set is not |

Mailpit (`axllent/mailpit`, v1.31.3) is a Docker image of the local stack only: the mailbox the tests read. Nothing of it reaches the host.

### Written here on purpose

| What | Why not a library |
|---|---|
| The migration runner (`api/src/Migrations/Migrations.php`) | Migration libraries impose PHP classes; the project wants plain SQL scripts |
| Sessions and passwords ([api/src/Access/](../api/src/Access/)) | PHP provides password hashing natively, and authentication libraries impose their own tables, which would contradict the model |
| `ApiError`, `Json`, `ErrorHandler`, `Input` | A few lines each, gluing the libraries to this app's error format |

### Adding or updating one

- **Ask the owner first**, with the recommendation, its maintenance record and what it pulls in.
- Versions are exact, with no `^` or `~`: an install next year gives the same code as today. The lock files (`package-lock.json`, `api/composer.lock`) are committed.
- JavaScript: `npm install --save-exact name@1.2.3` (add `--save-dev` for a development tool).
- PHP: `docker compose run --rm php composer require vendor/name:1.2.3` (add `--dev` for a development tool). Composer runs in Docker; it is not needed on the Mac, and the host never runs it.
- Add the library to the tables above, with its reason.

## Deployment

The hosting is the OVH Perso plan (decision of 2026-10-12; what it gives is in `docs/scoping.md`): PHP 8.4 in PHP-FPM, MySQL 8.4, scheduled tasks once per hour at most, and no command line (SSH). Nothing is built on the host: it receives files.

Nothing below names the band or its domain. Another band follows the same steps with its own folders.

### Two environments

| | Beta | Production |
|---|---|---|
| What it is for | Trying a version out before members get it | The app members use |
| Branch the host copies | `beta` | `release` |
| Deployed folder (example) | `bbm-beta` | `bbm-app` |
| Data folder, beside it | `bbm-beta-data` | `bbm-app-data` |
| Site of the app, root folder | `beta.<domain>` → `bbm-beta/web` | `app.<domain>` → `bbm-app/web` |
| Database | One of its own | One of its own |
| `allowedRecipients` in `config.php` | The testers | Empty |

OVH ties a Git branch to a site whose root is the folder the branch is copied to. That site is technical (`deploy-beta.<domain>` → `bbm-beta`, `deploy.<domain>` → `bbm-app`): everything it could serve is refused, see below. Each push on the branch copies its content to the folder, through a webhook of GitHub.

### What the host receives

The branches `beta` and `release` do not hold the source: they hold the tree below, assembled by [scripts/assemble-release.mjs](../scripts/assemble-release.mjs) (`npm run release:assemble` puts it in `build/release/`, to look at).

```
.htaccess            Require all denied: nothing here is served
web/                 The only folder a browser reaches
  .htaccess          Require all granted, the two guards below, then the rules of web/public/.htaccess
  index.html, …      The built front (web/dist)
  api/index.php      The relay: three lines that load ../../api/public/index.php
  api/.htaccess      Sends every /api/... address to the relay
api/                 The code of the API and vendor/, without the development libraries
database/            migrate.php and the migrations
```

- **Only `web/` is public.** The root `.htaccess` refuses everything, and `web/.htaccess` opens that folder alone. The code of the API, its libraries and the migrations are files a browser never reaches. The files written for the host are in [deploy/](../deploy/).
- **`/api` reaches PHP through a relay**, `web/api/index.php`: the only PHP file under `web/`, with no logic. Shared hosting has no `Alias`, which is what the local stack uses (`docker/apache.conf`).
- **Two guards**, written in `web/.htaccess` and again in `web/api/.htaccess` (the rewrite rules of a folder replace those of the folder above: keep the two files in step). An address that starts with `/web/` is refused: it only exists through the technical site, and the app has no such route. And everything is sent to HTTPS, unless one of four signs says the request already arrived encrypted (`HTTPS`, the `HTTPS` environment variable, `X-Forwarded-Proto`, port 443): which one a host gives depends on what stands in front of Apache.

- **Security headers of the front** (1.0.0, issue #51). [web/public/.htaccess](../web/public/.htaccess) sets, on every answer that is not under `/api`: `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and the `Content-Security-Policy`; [deploy/web.htaccess](../deploy/web.htaccess) adds `Strict-Transport-Security` on the host (without `includeSubDomains`, which would bind the other sites of the domain). `/api` is left out with an `<If>`, because PHP writes the headers of its answers (HSTS in `index.php`, a CSP of its own on files in `ServeFile`): the same header twice would carry two values. The CSP is enforced directly, without a Report-Only phase (decided with the owner on 2026-10-24: nobody would read the reports, and an address to receive them would be one more public route): the tests run under it, and beta is where it meets real use. What it allows, and why, is written beside it. One script has a policy of its own: the worker that reads MuseScore files (`/assets/score.worker-*.js`), whose engine writes functions at start and needs `'unsafe-eval'`. A worker follows the policy sent with its own script, so the pages never get it. A new kind of resource (a script from another site, a frame other than YouTube) needs a change of it; `tests/api/securityHeaders.spec.ts` checks the headers, and every screen test fails when its page is refused something (`tests/support/test.ts`, the `test` the screen tests import).

### The data folder

`config.php` and `storage/` must survive a deployment, so they are not in the deployed folder. The rule, written once in [api/bootstrap.php](../api/bootstrap.php): **the folder beside the deployed folder, with the same name followed by `-data`**. For an app in `/home/band/bbm-app`, the configuration is `/home/band/bbm-app-data/config.php` and the files are in `/home/band/bbm-app-data/storage/`.

- When that folder exists, both are read there, never one there and the other in the deployed folder. A data folder without `config.php` stops the app with an error; it never starts on another configuration.
- When it does not exist (the local stack, or a host where nothing replaces the folder), they are where the local stack has them: `api/config.php` and `storage/`.
- The folder is created by hand, once, with `config.php` (from [api/config.example.php](../api/config.example.php)) and an empty `storage/` that PHP can write to. A file put there by hand is not tracked by Git and is left alone by every deployment.

### From `main` to the members

1. **A merge on `main` builds beta** ([.github/workflows/beta.yml](../.github/workflows/beta.yml), also started by hand). The action runs `npm run check`, builds the front, assembles the tree with `vendor/` installed without the development libraries, and adds one commit to `beta`, whose content is exactly that tree. It does not run the end-to-end tests: they run before the merge. When nothing changed in the tree, `beta` is left as it is.
2. **The version is tried on the beta site.** If it came with migrations, an admin of beta is told on the home screen and applies them there first.
3. **Releasing is started by hand** ([.github/workflows/release.yml](../.github/workflows/release.yml), "Run workflow" on GitHub, with `release` typed as a confirmation). It adds one commit to `release` holding exactly the tree of the latest build of `beta`. Nothing is built again: what members get is what was tried.
4. **Going back** is the same action with the commit of an older build of `beta` in its second field. `release` receives a new commit holding that older tree.

The history of both branches is a plain one, each commit on top of the one before. Neither action ever forces a push, and nobody pushes to these branches by hand. The two branches are created by the actions, at their first run, never from `main` on GitHub: `release.yml` only accepts a commit that `beta.yml` made, told by its subject ("Build of main at …"). The token that may push is given to the last step alone: the packages installed and run by the build never hold it. Going back does not undo a migration: a version that needed one is released only once beta has shown it works.

### Versions and the changelog

Decided on 2026-10-15, with the first beta (issue #24). The beta carries `0.1.0`; the first version that follows this rule is `0.1.1`.

- **One number, in `package.json`.** It is the only place a version is typed. Semantic versioning while the app is in `0.x`: `0.1.x` for fixes and improvements, `0.2.0` when a feature arrives, `1.0.0` when the band moves to the app. The owner decides which one a change deserves.
- **The build writes `version.json`** at the root of the front (`web/dist/`): the version, the instant of the build and the commit of `main` it was built from. The front reads it at start, as a static file; the API does not need it. The local stack writes it in `npm run setup` and `npm run build`, with `local` as the commit.
- **The release action tags the commit of `main`** a build came from with `v<version>` when it promotes that build, so that `git tag` lists what the members received. Releasing the same version twice does not move its tag: a fix changes the number.
- **The changelog is data, in two languages**, apart from the interface text of `locales/`: `web/src/changelog/en.json` is the source, written in English; `web/src/changelog/fr.json` holds the French of each line. One entry per version: `version`, `date` (the day it is merged into `main`, so the day it reaches beta), an optional `note` of a few words shown after the date ("the first beta"), translated like a line, and `changes`, a list of lines, each with a `kind` (`added`, `changed`, `fixed`) and its text. The app shows the language of the member, and the English line when a translation is missing.
- **The entry of a version is written in the pull request that makes the change**, with its date. A check of `npm run check` refuses a build whose `package.json` version has no entry in `en.json`, or whose entry has a line or a note without French.
- **`CHANGELOG.md` at the root is generated** from `en.json` by `npm run changelog`, and committed with it: it is what GitHub and other bands read. It is never edited by hand.
- **The app shows it** in the settings, under "À propos": the version and the day of its build ("Publiée le": the day it reached beta, since promoting it to production builds nothing again), then the changes of that version grouped by kind, and the earlier versions folded. Figma: page `Members`, section 5, `Members / Settings — about`.
- **How it is built.** A plugin of [vite.config.ts](../vite.config.ts) (`aboutTheApp`) writes `version.json` and `changelog.json` (the two files of `web/src/changelog/`, together) at the root of the built front, and serves them in `npm run dev`. The front reads both as static files, never from the cache ([about.ts](../web/src/about.ts)); serving the changelog as a file rather than inside the code lets the tests give the screen other versions. [scripts/changelog.mjs](../scripts/changelog.mjs) writes `CHANGELOG.md` and, with `--check`, is the first step of `npm run check`. `release.yml` reads the version and the commit in the `web/version.json` of the build it promotes, and tags that commit; a build made before 0.1.1 has no such file and is not tagged.
- **French typography in `fr.json`**: no-break spaces before `:`, `;`, `?` and `!`, as in the interface text.

### Migrations without a command line

[Migrations](../api/src/Migrations/Migrations.php) is the only code that applies the scripts of `database/migrations/`, for the three ways to ask:

- **`database/migrate.php`**, from a command line (locally, `npm run db:migrate`). It answers 404 to a request of the web.
- **The install, on an empty database.** `GET /api/band` and `GET /api/install` answer "not installed" when the tables do not exist, and the manifest gives the neutral name and icons. Once the install key is accepted (`POST /api/install/key`, and again `POST /api/install`), the migrations are applied, then the install goes on: one thing to do for whoever installs. A wrong key creates nothing. A migration that fails there answers `migrationFailed` and nothing of what MySQL said, to someone who is not signed in: the log names the script. Once the app is installed, both routes refuse before looking at the key: it opens nothing any more.
- **The screen of the admin**, `/band/migrations`, in the band settings (model/band.md, "Updating the database"). `GET /api/migrations` lists what waits; `POST /api/migrations` applies it. Both ask for the `runMigrations` permission, which only `ADMIN` grants, and the second asks for the password again ([CurrentPassword](../api/src/Access/CurrentPassword.php), shared with the change of password: a wrong one counts like a wrong password at sign-in). The answer names what was applied and, when a script failed, which one and what MySQL said. That message goes to the admin only and is never logged. While something waits, an admin sees a notice on the home screen and in the band settings.

One run at a time: a lock held in MySQL (`GET_LOCK`) makes a second one answer `migrationsRunning`. A run goes on when the browser stops waiting, and asks PHP for no time limit; the host still cuts a request after 165 s, so a migration that rewrites a large table is tried on beta with the real data first.

**Not locking oneself out.** The screen needs a session, so it needs the tables of members and sessions to be readable by the new code. Three things keep that true:

- New code must run on the database of the version before it, for what sign-in and the migrations screen read: `member` (`id`, `email`, `passwordHash`, `status`, the sign-in counters), `memberRole` and `memberSession`. A migration that changes one of those tables only adds to it. Renaming or removing a column there is done in two releases: the code stops reading it first, the column goes in the next one.
- The other screens may fail while the database is late: the notice says so, and the migrations screen does not depend on them (a test applies a migration while the list of gigs cannot be read).
- If a mistake breaks sign-in all the same, the way out needs no code: in phpMyAdmin, run the content of each waiting file of `database/migrations/` in order, then record it with `INSERT INTO schemaMigration (name) VALUES ('013_example.sql');`. Whoever can do that already holds the database password. There is no second key that opens the migrations: that would be one more door to guard.

A migration is always applied locally, then on beta, before production. Back up the production database before applying one.

### The scheduled task

The automatic reminders of gigs are sent by [api/tasks/gigReminders.php](../api/tasks/gigReminders.php), outside `web/`. In the deployed folder its path is `api/tasks/gigReminders.php`; the host runs it once per hour (on OVH: "Planification de tâches", the path counted from the home folder, for instance `bbm-app/api/tasks/gigReminders.php`, PHP 8.4, every hour). One task per environment.

It refuses to answer the web whichever way the host starts PHP for a task: a request of the web always says its method and its origin, a task says neither. Running it twice in an hour changes nothing.

### Beta never writes to real members

Beta is tried with a copy of the real data, and its scheduled task runs. `allowedRecipients` in `config.php` ([AllowedRecipients](../api/src/Mail/AllowedRecipients.php)) lists the email addresses of the members beta may write to. While the list is filled in, an email for another address ([Mailer](../api/src/Mail/Mailer.php)) and a notification for another member ([Push](../api/src/Push/Push.php), by the email of the member) are put aside: not sent, and the log gets one line saying how many and of which kind, never to whom. The API answers as if they had left. Empty or left out, as in production, everyone is written to. A setting that is neither a list nor empty, or a list that holds no address, is a mistake in the file: nobody is written to, rather than everyone. Locally, the server of port 8083 has one listed address, for the tests.

### What to back up

Two things hold everything that cannot be built again: **the database**, and **the data folder** (`config.php`, with the push keys that every device depends on, and `storage/`, the uploaded files). The deployed folder holds nothing to keep: it is the content of a branch. The folder `import/` of the data folder holds nothing to keep either: a zip there holds personal data and is deleted once loaded; one left there by FTP and never loaded is to be deleted by hand.

**The encryption key** (`encryptionKey` in `config.php`) is kept a third time, on its own: in a password manager, never beside the backups of the database. A backup of the database without its key cannot be read by anyone, the band included; the key beside the backup protects nothing. One key per instance: beta and production each have theirs, and a copy of the production database restored on beta is read with the key of production.

### To check on the real host

Because it cannot be checked locally. Checked on beta first:

- every address is redirected to HTTPS, without a loop (the four signs above);
- a file at the root of the deployed folder, and anything under `/web/` or `//web/`, answer 403 through the technical site;
- the data folder is found: the host may reach the deployed folder through a link, and PHP then looks beside the folder the link leads to (the app stops with an error rather than start without its configuration);
- whether a file removed from the branch is removed from the folder (if not, old built files stay in `web/assets/`, which harms nothing);
- the scheduled task runs and its output says how many gigs were reminded for;
- the session cookie arrives as `__Host-session` with `Secure`, and sign-in works on an iPhone and an Android phone;
- a write sent by an older browser, which announces itself with `Origin` only, is accepted (see `SameSiteOnly`);
- PHP errors are not displayed;
- the answer to a forgotten password request comes back at once, before the email is sent (it relies on PHP-FPM, see "Emails"), and the email arrives from the mailbox of the domain;
- a notification sent from PHP reaches an iPhone and an Android phone;
- the bot of the band, which never connected to the gateway, reads the messages of a channel (`GET /channels/{id}/messages`), with their text: Discord sends an empty text without the intent "Message Content". A channel the bot cannot see answers like a song without messages: the button only, no error (docs/discord-bot.md, "To check on beta");
- the temporary folder of PHP on the host: that it can be written, and that it is not shared with other customers of the host (the cache of Discord holds messages for 10 minutes, in a folder only PHP may read);
- an email of a notification arrives, with its link to the gig or the song, and a reminder reaches by email a member none of whose devices receives;
- the emails in HTML (#65) in Apple Mail, Gmail (web and phone) and Outlook: the dark ground kept or recoloured, the typefaces of the app or the system ones, the button, and the font files served with `Access-Control-Allow-Origin` (`mod_headers` on the host);
- an invitation sent by email (#50) arrives, and its link opens the invitation;
- the export, the import and the reprise (#43): PHP can create `<folder>-data/import/` and read a zip dropped there by FTP; a zip of a hundred megabytes sent from the browser arrives within the 165 s the host gives a request (the host may also cap the body of a PUT); `ZipArchive` is there;
- the calendar feed is read by Calendrier on an iPhone (`webcal://`) and by Google Agenda (from a computer), and a gig changed in the app changes in them;
- the access log of the host: it records the addresses it is asked, the token of a calendar address included. Whether it can be turned off or shortened on the plan, to see with the host;
- on an iPhone, the installed app shows no dark band above its screens (#28);
- the database update of 0.3.1 on a copy of the real data, after a backup: the records of members are encrypted (`emailHash` filled for every row), everyone signs in, and the directory reads as before.
- the install guide (#36): on an Android phone, Chrome offers its install window from "Installer l’app" (the tests only stand in for it); on an iPhone and an iPad with iOS 26 and iPadOS 26, the menus are those the steps name (the address, then Partager, [+] « Sur l’écran d’accueil », « Ouvrir comme app web », as the owner saw them, #57);
- the icon of the browser tab, in Safari and Chrome (#48, #56): the icon of the app, not the icons of the logo;
- the Discord messages that tag the app (#45), by the bot and by its role, with the real bot: `GET /users/@me` answers, and the role Discord gave the bot carries `tags.bot_id`;
- the key signatures of the Live mode (#41) on the songs of the band, once their MuseScore file is sent again;
- the security headers of 1.0.0 (#51): `curl -sI https://<beta>/sign-in` shows HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and the CSP once each, and `curl -sI https://<beta>/api/band` shows HSTS once and no CSP (the `<If>` of the `.htaccess` works on the host); the map, a score, a PDF part, a YouTube clip and the install of the app work under the CSP;
- the limits per visitor (#51): `REMOTE_ADDR` is the address of the visitor, not one of the host (otherwise every visitor would share one count). After deployment, the rows of `requestLimit` made by two phones on different networks must differ.

## Traps

- **A query that fails is retried once** (set in `main.tsx`). A test that cuts the network must therefore wait a little before the screen says so.
- **`/icons/` is reserved by Apache** for its own files: anything the app puts at that address answers 404. The app's icons are in `web/public/appIcons/`.
- **Table names and case.** Covered by the local MySQL; see "The local stack".
- **Port 8080 serves the built front.** After changing front code, `npm run build` before looking at 8080 or running the tests. Port 5173 has no such step.
- **A migration file holds several statements**, which MySQL's real prepared statements refuse. `Migrations` switches that setting for the time of a run only; the API keeps real prepared statements.
- **`npm run db:reset` and `docker compose down -v` delete the local data.**
- **Text compared by PHP and by the database.** The database ignores case and accents (`Flute` = `Flûte`); PHP's `mb_strtolower` ignores case only. A uniqueness check written in PHP is a courtesy to give a precise error; the constraint of the database is the judge, and its refusal must be caught and turned into a proper error.
- **`assert()` does nothing on the host**, where PHP runs with assertions off. Never use it to guard against something that can happen: throw.
- **`password_hash()` refuses a password holding a NUL character** and throws, while `password_verify()` just says no. `Passwords` hides the difference; go through it.

- The map writes its credit itself and turns the attribution control of `maplibre-gl` off, and shows no popup: no text of a tile source is ever written as HTML. Version 5 of the library had an advisory on exactly that code (GHSA-jrc7-96c5-q579, fixed in 6): keep it that way.
- `maplibre-gl` 6 looks for its worker in a file beside its own, which the build does not produce. [mapEngine.ts](../web/src/components/mapEngine.ts) imports the worker with `?worker&url`, so that Vite builds it into a file of the app, and gives its address to the library (`setWorkerUrl`). Without it the map stays empty, with "Worker failed to load" in the console.
- A sheet opened from inside a form (`Panel` in the form of a song) must not hold a `<form>` of its own: the browser drops the inner one and the button sends the outer form.

## Not built yet

In the order of the scoping document:

1. Of the deployment: what "To check on the real host" lists, once the host has received its first build.
2. What the Members feature leaves for later: the export of the directory, and the screens Figma has not drawn (see below).
3. What the Songs feature leaves for later: in the Live mode, the jumps written in words (D.S., D.C., coda), the system texts of the score, the tempo and the measure tiles that Figma means to open a picker (not drawn), the halo and the glass panel of the controls; the landscape layout of the MIDI player as drawn; reading the name of a song inside the MuseScore file; and what Figma does not draw: the empty MIDI, Live, PDF and Clip modes (their wording is provisional), the desktop list with its actions (add, manage, download, filters are kept from the phone screen), the management table below the desktop width.
4. What the Gigs feature leaves for later: a real notification sent from the host (to check with the first deployment). Not drawn in Figma, and deduced: where the buttons that add and manage a gig sit on a desktop, the way to the form of a gig that exists (from the panel that manages it), a confirmed gig of several days.
5. The later features.

Screens that were deduced from the phone screens, because Figma does not draw them yet. Each follows the rules of the design skill (a larger screen derives from the phone screen, a sheet becomes a dialog from 1024 px, a flow takes the floating panel), and is to be checked when it is drawn:

- the whole app on a tablet and at 1920 px;
- on a desktop: the sheet of a member, the settings, sign-in, forgotten password, the invitation, the record of a member and the invite form, the settings of the band;
- what a line of the desktop table opens (the record of the member);
- loading and server error states (a line of text, and a `Message`);
- the page opened without the right in the settings of the band, and the list of countries (the list of the device);
- updating the database (`/band/migrations`), its row in the settings of the band, and the notice an admin sees on the home screen and in those settings while migrations wait: a `Message`, a `Button`, `Sheet` and `NavRow` for the lists, a `Panel` with a `PasswordField` for the confirmation. No component was created for them.
