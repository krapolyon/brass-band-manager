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
| Check the code | `npm run check` | Biome, TypeScript and PHPStan. Must pass before a commit |
| Fix the layout of the code | `npm run format` | |
| Apply the migrations | `npm run db:migrate` | |
| Install the PHP libraries | `npm run api:install` | After `api/composer.lock` changed |
| Empty the local database | `npm run db:reset` | Deletes all local data, then applies every migration again |

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
  bootstrap.php           Loads the libraries and the configuration
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
  composer.json           PHP libraries, exact versions
  phpstan.neon            Settings of the PHP analysis
  vendor/                 The libraries themselves (not committed)

database/
  migrations/             Numbered SQL scripts
  migrate.php             Applies those that have not run yet

tests/                    Playwright end-to-end tests
  api/                    The API alone, without a browser
  support/                Made-up band and members, access to the test database
docker/                   Image of the local web server (Apache with PHP)
docker-compose.yml        The local stack
scripts/                  setup.mjs (npm run setup), prepare-test-database.mjs
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
           $songs = $this->database->fetchAllAssociative('SELECT id, title, status FROM song ORDER BY title');

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

Only JSON is accepted. Form data is refused on purpose: a page of another site can send a form without the browser asking, but not JSON.

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

`api/config.php` returns an array and is never committed. It is a copy of one of two files:

- [config.local.php](../api/config.local.php) for the local stack, copied by `npm run setup`. Every value in it is public.
- [config.example.php](../api/config.example.php) for the host, to fill in by hand. Its defaults are the safe ones: install is refused until an install key is written, and the session cookie only travels over HTTPS.

A new setting is added to both files. When the safe value and the convenient value differ, the code takes the safe one when the setting is missing, and only `config.local.php` says otherwise.

Secrets (database password, password of the mail server, later the Discord bot token and the push keys) go there and nowhere else. So does `appUrl`, the public address of the app: the links written in emails start with it, never with the host a request claims. Settings of the band (name, logo, colours) are not configuration: they belong to the `band` table.

### Who can call a route

Decided in [api/routes.php](../api/routes.php), by the block a route is written in. There are three, and nothing else decides access:

| Block | Who | How |
|---|---|---|
| 1. Public | Anyone | Written directly on `$app`. Today: health, the name, logo and icons of the band, the manifest, install, sign-in, checking and using a password link. Adding a route here is a decision to justify |
| 2. Signed in | Any current member (`ACTIVE` or `POWER_MEMBER`) | Inside the group that carries `RequireSession` |
| 3. Oneself, or a permission | The member the address names, or a member holding a permission | A route of block 2 with `->add(new RequireSelfOrPermission(Permission::...))` |
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
- **Forged requests (CSRF).** Three barriers: the `SameSite=Strict` cookie, [SameSiteOnly](../api/src/Access/SameSiteOnly.php) which refuses a write that a browser announces as coming from another site, and JSON-only input.
- **The numbers** (durations, number of tries, password length) are in [AccessRules](../api/src/Access/AccessRules.php).
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
- `POST /api/install/key` tells whether a text is the install key. The welcome screen asks it before the first step, so that a wrong key is found at once. It changes nothing.
- `POST /api/install` receives everything at once (band name, language, sections and instruments, first member), saves it in one transaction, and signs the first member in as admin.
- This route is public and creates an admin. It is protected twice: it works only while no member exists, and it asks for the **install key**.

**The install key** ([InstallKey](../api/src/Install/InstallKey.php)) is a text that the person who puts the app online writes in `api/config.php`, the file where the database password already is. The install asks for it again: only someone who can read the files of the server knows it, so nobody else can install the app and become its admin while it sits online, not yet installed. Once the app is installed the key is of no use.

- A key shorter than 16 characters counts as no key: install stays closed until a real one is written.
- A wrong key costs a second. With a long key, guessing leads nowhere, and the app does not need to remember who tried: no counter, no address stored.
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
- **Not done: where the last screen leads.** Its two buttons go to the home address until the members feature (inviting) and the home screen exist.
- [Languages](../api/src/Install/Languages.php) lists the languages the app is shipped in.

### Members

`api/src/Members/`, `api/src/Sections/` and, for what touches sign-in, `api/src/Access/`. Rules: [model/members.md](../model/members.md). Every line of its tables of rights is a test in `tests/api/`.

| Address | Who | What |
|---|---|---|
| `GET /api/members`, `GET /api/members/{id}` | Signed in | The directory. Current members for everyone; invited members and those who left for who manages members |
| `GET /api/members/{id}/photo` | Signed in | The profile photo, for the members the viewer may see |
| `PUT /api/members/{id}` | Oneself, or `MANAGE_MEMBERS` | The whole record (names, email, contact details, instrument) |
| `PUT`, `DELETE /api/members/{id}/photo` | Oneself, or `MANAGE_MEMBERS` | Gives, replaces or removes the photo |
| `POST /api/members` | `MANAGE_MEMBERS` | Invites: creates the member and their password link |
| `DELETE /api/members/{id}` | `MANAGE_MEMBERS` | Cancels an invitation |
| `PUT /api/members/{id}/status` | `MANAGE_MEMBERS` | Moves a member along the life cycle |
| `POST`, `DELETE /api/members/{id}/passwordLink` | `MANAGE_MEMBERS` | Creates or cancels a password link |
| `PUT /api/members/{id}/roles` | `MANAGE_ROLES` | Sets the roles, all at once |
| `GET /api/sections` | Signed in | Sections with their pictogram, and their instruments with the number of members who play each |
| `POST`, `PUT`, `DELETE` on `/api/sections` and `/api/instruments` | `MANAGE_SECTIONS` | Adds, renames, moves, deletes; sets the pictogram of a section, one of `SectionIcons::AVAILABLE` |
| `PUT /api/me/preferences`, `PUT /api/me/password` | Oneself | Preferences; password, with the current one |
| `POST /api/passwordLink/check`, `/use` | Anyone holding a link | Says who a link is for; chooses a password with it and signs in. For an invitation, `check` gives the invited member their own record, their photo and the instruments of the band, and `use` takes the whole account (record, photo, accessibility options, password), saved together or not at all |
| `POST /api/passwordLink/validate` | Anyone holding the link of an invitation | Says whether a record would be accepted, and saves nothing: the first step of an invitation asks it |
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
- Not written: the export of the directory, and every screen.

### Emails

The app sends one email so far: the link of a forgotten password ([ForgotPasswordAction](../api/src/Access/ForgotPasswordAction.php)).

- **[Mailer](../api/src/Mail/Mailer.php)** sends through the mail server written in `config.php` (`mail`), with PHPMailer. The exchange is encrypted (`tls` or `ssl`); a configuration that says anything else, or a password without encryption, counts as no mail server at all. Without that configuration, or without `appUrl`, it sends nothing and `GET /api/band` answers `canSendEmail: false`: the forgotten password screen then sends the member to those who manage members.
- **The texts are in `api/resources/emails.<language>.json`**, in the language of the member. An email is the one text the server writes; everything else is translated by the front. Emails are plain text for now.
- **An email leaves after the answer** ([AfterResponse](../api/src/Http/AfterResponse.php), run by `index.php` once the answer was handed over). Sending takes a second or two: the time of the answer must not tell whether an address is the one of a member. The host has no background process, so this is the end of the same request: with PHP-FPM the answer is closed first; elsewhere the `Content-Length` of the answer tells the browser that it has everything.
- **An email goes to the address the database holds**, never to the one that was typed: the database compares addresses without regard to accents, so a look-alike address finds a member, and must not receive their link. The forgotten password route also asks that the two be equal character for character.
- **Nothing about an email is logged**: when sending fails, the log holds the kind of failure only.
- Locally the emails land in Mailpit (http://localhost:8025); the tests read them there ([mail.ts](../tests/support/mail.ts)).

### The logo of the band and the icons of the app

`api/src/Band/`. Rules: [model/band.md](../model/band.md).

| Address | Who | What |
|---|---|---|
| `GET /api/band` | Anyone | The name, the three defaults (language, accent theme, country), and the addresses of the logo and of the icons (null without a logo). The table holds nothing private |
| `GET /api/band/logo`, `GET /api/band/icon/{180, 192 or 512}` | Anyone | The files |
| `GET /api/manifest` | Anyone | What a phone reads to install the app: the name and the icons of the band |
| `PATCH /api/band` | `MANAGE_BAND` | Changes what is sent among the name, the accent theme, the default language and the country |
| `PUT /api/band/logo`, `DELETE /api/band/logo` | `MANAGE_BAND` | Gives, replaces or removes the logo |

- **The icons are drawn by the browser, not by the server.** A phone wants square PNG icons whatever the format of the logo, and the logo may be an SVG, which PHP cannot draw without an image extension that a shared host may not have. The browser of the admin reads the four formats: [logo.ts](../web/src/screens/install/logo.ts) fits the logo in a white square at the three sizes and sends the icons with the file. The server needs no image library, and nothing here depends on the host.
- **A logo travels as JSON**, like everything the API receives: the content of the file and of the three icons in base64 ([LogoInput](../api/src/Band/LogoInput.php)). No form upload, so the rule "JSON and nothing else" of `Input` has no exception.
- **[LogoStore](../api/src/Band/LogoStore.php) is the only code that touches the files.** It decides what a file is from its content (never from a name or a type that was sent), refuses what is not a PNG, a JPEG, a WebP or an SVG, refuses an SVG that declares a document type, and checks that each icon is a PNG of the exact size.
- **The files are in `storage/`, next to `api/`**, a folder the web server does not serve. Each logo has a folder under a name drawn at random (`storage/band/<16 characters>/`); `band.logoPath` holds the path of the logo. Replacing a logo writes a new folder and deletes the old one.
- **Serving** ([ShowLogoAction](../api/src/Band/ShowLogoAction.php)): the type comes from the stored extension, the browser is told not to guess another one, and a policy forbids the file to run or load anything, because an SVG can carry scripts. An address carries the version of the logo (`?v=...`): with the current version the browser may keep the file for good, otherwise it asks again.
- **What is checked, and what is not.** A logo is at most 2 MB and 4096 pixels a side; a PNG must end as a PNG; an SVG must be written in UTF-8 and declare no document type. What an icon shows is not checked: only someone who manages the band can send one. Replacing a logo holds the row of the band until it is done, so that two replacements at the same instant leave the files of one logo only.
- **`storage/.htaccess`** is written by `LogoStore` and tells Apache to serve nothing from the folder, should a host put it where it can be reached.
- **No request body above 8 MB** is read ([BodyLimit](../api/src/Http/BodyLimit.php), for every route): it is refused with 413 before anything else, signed in or not.
- **At install**, the files are written before the transaction and removed if it fails: the band is saved with its logo or not at all.
- **On the page**, [band.ts](../web/src/band.ts) gives the tab the name of the band and its icon, and the icon an iPhone takes when the app is added to its home screen.
- No screen changes the logo after the install yet: that is the settings feature.

### Not written yet

- **The export of the directory**, which asks for the password again: with the screens of the Members feature.
- **Serving files** (recordings, scores) to signed-in members only.

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
- **[AppearanceOf](../web/src/AppearanceOf.tsx)** decides the look and the language: the choices of the account when someone is signed in; otherwise the scheme of the device, the theme and the language of the band, and the accessibility options chosen before sign-in. Those are kept in the storage of the browser, on the device only ([deviceAccessibility.ts](../web/src/deviceAccessibility.ts)); the options of an account are never written there.
- **The record of a member is one form**, [MemberRecordFields](../web/src/screens/members/MemberRecordFields.tsx), used by an invitation, the profile and those who manage members; [record.ts](../web/src/screens/members/record.ts) turns what is typed into what the API receives. A phone number is typed the local way and stored in the international one ([phone.ts](../web/src/screens/members/phone.ts), with libphonenumber-js): a number without a prefix belongs to the country of the member, or to the one of the band. A photo is cropped to a square and redrawn by the browser before it is sent ([photo.ts](../web/src/screens/members/photo.ts)).
- **The screens of a flow** (install, sign-in, forgotten password, invitation) share one frame, [FlowLayout](../web/src/screens/FlowLayout.tsx).

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
| An icon (`Icon/Globe`) | `<Icon name="Globe" />`; the paths are in [Icon.tsx](../web/src/components/Icon.tsx), exported from Figma |

Rules that keep it true:

- **No component holds a value of its own.** Colours, spacing, radii and sizes come from `tokens.css`; typefaces, sizes and weights of text come from the classes of `text.css`.
- **The alias chain of Figma is kept**: `Scheme` variables point to `Theme` and `Primitives` with `var()`, and the type sizes and typefaces of `Size` point to `TextSize` and `Typeface`. Each collection has one block per mode in `tokens.css`, and the mode is one attribute on the root element: `data-scheme` (`dark` or `light`), `data-contrast="more"` (the two high contrast modes), `data-theme="coral"` (absent: the first theme), `data-text-size="140"` (absent: 100 %), `data-typeface="legible"`. The list of themes is in [themes.ts](../web/src/themes.ts).
- **Sizes are in rem.** Figma gives pixels; `tokens.css` writes them as pixels divided by 16, text and spacing alike. The app never changes the size of the root: the text size option of a member changes the type sizes only (the modes of `TextSize`), so spacing, radii, icons and controls keep their size, and the height of a control is always a `min-height`. A browser whose own font size was changed scales everything, page titles included: this is accepted. Lines (1 and 2 px) and the halo stay in pixels.
- **Blur.** Figma counts a blur twice as large as CSS does: a blur of 40 in Figma is `blur(20px)`.
- **Bricolage Grotesque has an optical size axis**, which the browser applies by itself as Figma does: big titles are drawn tighter. Its font files must keep that axis, or titles come out wider than drawn and wrap differently.
- **Typefaces are served by the app**, never by a font service: no visitor is reported to a third party. A test checks that the install screen asks nothing of another site.
- A component that Figma does not have is not created here.

The components written so far. Base layer: `Icon`, `Button`, `IconButton`, `TextField`, `ImageField`, `Checkbox`, `ListRow`, `Chip`, `Sheet`, `Message`, `StepIndicator`, `ScreenTop`, `BottomBar`, `Halo`, and `Panel`, which gives `BottomSheet` and `Dialog`. Business objects: `InstrumentRow`, `SectionCard`.

- **`TextField` has three forms**, as in Figma where the select is a `TextField` with a chevron: `TextField` (an input), `SelectField` (the browser's own `<select>`, for a short list) and `PickerField` (a button that opens a panel, for a choice made in a list of rows).
- **A row with a checkbox** is `ListRow` with `checked` and `onCheck`: the label and the checkbox are one target. `Checkbox` is the browser's own, drawn as in Figma.
- **`BottomBar` takes its main button first.** On a phone it is on top; from the desktop width the buttons are shown in reverse, the main one on the right.
- **A panel made to type something** marks its field with `data-autofocus`: the focus goes there when the panel opens, instead of the close button.

**Reading a component or a screen from Figma.** The Figma connector is used read-only. Besides `get_design_context` and `get_screenshot`, a short read-only script run with `use_figma` gives the exact names of the variables bound to each layer, which is what the CSS needs. Screenshots of Figma are the visual target: after building a screen, it is captured at the four widths and compared with them.

**Panels.** `BottomSheet` and `Dialog` are the browser's own `<dialog>` element ([Panel.tsx](../web/src/components/Panel.tsx)): the browser keeps the focus inside, closes on Escape and makes the rest of the page inert. A screen uses `Panel`, which is a bottom sheet below 1024 px and a dialog from there. Three things in it are there for a reason: it opens once the event that asked for it is over (a panel opened with the Enter key would otherwise be confirmed by the same key press); a press closes it only when it started and ended on the scrim (a selection dragged out of a field must not); and when a change removes the control that opened it, the screen says which control takes the focus instead (see `SectionsScreen`).

**The four widths.** Figma draws 390, 768, 1280 and 1920. The layouts change at 768 (tablet), 1024 (desktop) and 1920 (wide). The desktop layout starts below the width it is drawn at, so that a laptop window that is not full screen keeps it; `Panel` and `BottomBar` change at the same 1024. On a desktop the left of the window is a floating glass panel, 16 px from the edges, as tall as the window and in place while the right side scrolls: in a flow it carries the step and the title (448 px wide at 1280, 648 at 1920), in the app it is the menu. The frame of the install screens, [FlowLayout](../web/src/screens/FlowLayout.tsx), is the example to follow for a flow. The top of every screen is [ScreenTop](../web/src/components/ScreenTop.tsx), the only place where the top margin is set: 32 px, or the safe area of the device plus 8 px when that is more. The other safe areas come from `env(safe-area-inset-*)` too, never from the 34 px that Figma leaves in its phone frames.

**Appearance and accessibility options.** [appearance.ts](../web/src/appearance.ts) is the only place that writes on the root element. It takes the scheme, the accent theme and the six options of whoever uses the app (`model/members.md`), adds what the device asks (a light scheme, more contrast, less motion) and follows the device when it changes. A small script, [appearance.js](../web/public/appearance.js), sets the scheme and the contrast of the device before the page is drawn, so that nobody sees a flash of the dark scheme. What each option does: text size, the legible font and high contrast are modes of the variables (`tokens.css`); increased spacing (`data-spacing`) and reduced motion (`data-motion`) are rules of [base.css](../web/src/styles/base.css), which win over every component; extended timeouts (`data-timeouts`) is read by what shows a notification, when the app has some. In the high contrast modes the three fields of the halo take the colour of the ground: no rule hides it. The legible font, Atkinson Hyperlegible Next, is served by the app like the two others and downloaded only by who turns the option on.

### Installable app (PWA)

- The manifest is what makes the app installable. It is served by the API (`GET /api/manifest`, [ManifestAction](../api/src/Band/ManifestAction.php)) because its name and its icons are those of the band.
- Before the install, and for a band without a logo, the name is "Brass band" and the icons are the grey placeholders of `web/public/appIcons/`.
- A phone that has already installed the app may keep the old name and icon until the app is installed again: this is how phones behave.
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
| `libphonenumber-js` | 1.13.14 | Reads a phone number typed the local way and writes it in the international form, and back | Google's own rules for every country, without a dependency. Writing them here would only work for one country |
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
| The paths of the icons that come from Lucide | [Icon.tsx](../web/src/components/Icon.tsx), from the comment that names them | ISC, [Lucide-LICENSE.txt](../web/src/components/Lucide-LICENSE.txt) |

Mailpit (`axllent/mailpit`, v1.31.3) is a Docker image of the local stack only: the mailbox the tests read. Nothing of it reaches the host.

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
- `storage/`, next to `api/`, holds the uploaded files. It must exist on the host, be writable by PHP, stay outside the folder Apache serves, and never be emptied or replaced by a deployment. It is part of what a backup must keep, with the database.
- Migrations are applied on the host by `database/migrate.php`, after having run locally.
- The Apache rules the app needs are in the two `.htaccess` files, which travel with the code.

To settle then: how `api/src`, `api/vendor` and `api/config.php` are kept out of the folder Apache serves, and how `migrate.php` is run without a command line (today it refuses to run outside one).

To check on the real host, because it cannot be checked locally:

- every address is redirected to HTTPS (a rule to add to the `.htaccess` files);
- the session cookie arrives as `__Host-session` with `Secure`, and sign-in works on an iPhone and an Android phone;
- a write sent by an older browser, which announces itself with `Origin` only, is accepted (see `SameSiteOnly`);
- PHP errors are not displayed;
- the answer to a forgotten password request comes back at once, before the email is sent (it relies on PHP-FPM, see "Emails"), and the email arrives from the mailbox of the domain.

## Traps

- **A query that fails is retried once** (set in `main.tsx`). A test that cuts the network must therefore wait a little before the screen says so.
- **`/icons/` is reserved by Apache** for its own files: anything the app puts at that address answers 404. The app's icons are in `web/public/appIcons/`.
- **Table names and case.** Covered by the local MySQL; see "The local stack".
- **Port 8080 serves the built front.** After changing front code, `npm run build` before looking at 8080 or running the tests. Port 5173 has no such step.
- **A migration file holds several statements**, which MySQL's real prepared statements refuse. `migrate.php` switches that setting for itself only; the API keeps real prepared statements.
- **`npm run db:reset` and `docker compose down -v` delete the local data.**
- **Text compared by PHP and by the database.** The database ignores case and accents (`Flute` = `Flûte`); PHP's `mb_strtolower` ignores case only. A uniqueness check written in PHP is a courtesy to give a precise error; the constraint of the database is the judge, and its refusal must be caught and turned into a proper error.
- **`assert()` does nothing on the host**, where PHP runs with assertions off. Never use it to guard against something that can happen: throw.
- **`password_hash()` refuses a password holding a NUL character** and throws, while `password_verify()` just says no. `Passwords` hides the difference; go through it.

## Not built yet

In the order of the scoping document:

1. The sign-in screen, which is not designed yet.
2. Deployment to OVH: the cheapest plan that fits, still to be picked and ordered.
3. The design system in CSS and the first real screens: wait for the Figma file.
4. Every feature (members, songs, gigs, and the later ones).
