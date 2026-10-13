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

`api/config.php` returns an array and is never committed. It is a copy of one of two files:

- [config.local.php](../api/config.local.php) for the local stack, copied by `npm run setup`. Every value in it is public.
- [config.example.php](../api/config.example.php) for the host, to fill in by hand. Its defaults are the safe ones: install is refused until an install key is written, and the session cookie only travels over HTTPS.

A new setting is added to both files. When the safe value and the convenient value differ, the code takes the safe one when the setting is missing, and only `config.local.php` says otherwise.

Secrets (database password, password of the mail server, the private key of push notifications, later the Discord bot token) go there and nowhere else. So do `timeZone`, the clock of the band, and `mapTilesUrl`, where the map of a gig reads its tiles. So does `appUrl`, the public address of the app: the links written in emails start with it, never with the host a request claims. Settings of the band (name, logo, colours) are not configuration: they belong to the `band` table.

### Who can call a route

Decided in [api/routes.php](../api/routes.php), by the block a route is written in. There are four, and nothing else decides access:

| Block | Who | How |
|---|---|---|
| 1. Public | Anyone | Written directly on `$app`. Today: health, the name, logo and icons of the band, the manifest, install, sign-in, checking and using a password link. Adding a route here is a decision to justify |
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

### Songs

`api/src/Songs/`. Rules: [model/songs.md](../model/songs.md). Every line of its tables of rights is a test in `tests/api/songs.spec.ts`.

| Address | Who | What |
|---|---|---|
| `GET /api/songs`, `GET /api/songs/{id}` | Signed in | Every song, whatever its status. The list gives the weight of each file and the averages of the band; one song also gives its files, its parts and the levels of the member who asks |
| `GET /api/songs/{id}/cover`, `/clipThumbnail`, `/audio`, `/midi`, `/museScore`, `/parts/{instrumentId}` | Signed in | A file. With `?download`, saved under a readable name |
| `GET /api/songs/archive?kind=...&songs=1,2` | Signed in | "Download everything": a `.zip` of the parts of the member's instrument, the recordings, the MIDI or the MuseScore files of the songs given |
| `PUT /api/songs/{id}/levels` | Oneself | The two levels the member gives the song. The address names no member: nobody sets the levels of someone else |
| `POST /api/songs`, `PUT /api/songs/{id}` | `MANAGE_SONGS` | Creates a song; saves its whole record |
| `PUT /api/songs/{id}/status`, `DELETE /api/songs/{id}` | `MANAGE_SONGS` | Sets the status; deletes the song with its files, its parts and its levels |
| `PUT`, `DELETE /api/songs/{id}/cover`, `/museScore`, `/midi`, `/audio`, `/parts/{instrumentId}` | `MANAGE_SONGS` | Gives, replaces or removes a file |
| `PUT /api/songs/{id}/audio/peaks` | `MANAGE_SONGS` | Keeps the outline of the recording, computed by the browser that sent it |
| `POST /api/songs/fileNames` | `MANAGE_SONGS` | Says where each file of a list of names would go. Changes nothing |
| `POST /api/songs/trackNames` | Signed in | Says which instrument each track of a MIDI file is, from `{ names }` (100 names at most): `[{ name, instrumentId }]` in the same order, `instrumentId` null when the name tells no instrument or several. Changes nothing |
| `GET /api/instrumentAliases` | `MANAGE_SONGS` | Every instrument in the order of the band, each as `{ id, name, aliases: [{ id, alias }] }`, its aliases from A to Z |
| `POST /api/instruments/{id}/aliases` | `MANAGE_SONGS` | Gives the instrument a known spelling, from `{ alias, songName? }`. Answers with the instrument as in the list |
| `DELETE /api/instrumentAliases/{id}` | `MANAGE_SONGS` | Deletes a known spelling. Answers with its instrument as in the list |

- **[Songs](../api/src/Songs/Songs.php)** builds what is answered about a song, from columns listed one by one. Two things are not for everyone: the Discord channel (who manages songs) and the levels of a member (that member only). The others get the average of the current members who answered and their number, rounded to one decimal, never the level of a named member.
- **A file of a song is the one exception to "JSON and nothing else"**: it is sent alone, as the body of its request, announced as `application/octet-stream` ([FileBody](../api/src/Http/FileBody.php)). A recording of 10 MB written in base64 would weigh a third more and be decoded twice in memory. Like JSON, this type cannot be sent by a page of another site without the browser asking first. [BodyLimit](../api/src/Http/BodyLimit.php) lets these addresses, and only them, receive 10 MB; it lists them, and must be kept in step with `routes.php`.
- **[SongFiles](../api/src/Songs/SongFiles.php) is the only code that touches the files.** It decides what a file is from its content: a square PNG, JPEG or WebP of 1024 pixels at most for the cover (2 MB), a zip that holds a `.mscx` for MuseScore (10 MB), `MThd` for MIDI (1 MB), MusicXML as it is (`<score-partwise`) or compressed (a zip with `META-INF/container.xml` and no `.mscx`, 10 MB), an mp3 or an m4a for the recording (10 MB), `%PDF-` for a part (5 MB). Each file has a folder of its own under `storage/songs/`, under a name of the app; replacing a file writes the new one, saves its path, then deletes the old one, with the row of the song held so that two requests cannot leave a file behind.
- **The MIDI file and the MusicXML come from the MuseScore file**, and the server takes no part in it: MuseScore cannot run on the host. The browser that sends a MuseScore file reads it (see "The front") and sends the two files it gives to `/midi` and `/musicXml`, like any other file. The server only checks what each one is.
- **Serving** ([ServeFile::privately](../api/src/Storage/ServeFile.php)): `private, no-cache` with an `ETag`, as for a photo, and ranges of bytes (`Range`), without which an iPhone plays no recording.
- **The outline of a recording** (its "peaks") is `peaks.json` beside the recording, in the same folder: it goes when the recording goes. The server has nothing to read a recording with, so the browser that sends one computes it (Web Audio) and sends it right after, with the version of the recording it was computed from: an outline that arrives after another recording took the place is refused.
- **The clip** ([ClipThumbnails](../api/src/Songs/ClipThumbnails.php)): an address is accepted when it is one YouTube gives for a video (`youtube.com/watch?v=`, `youtu.be/`). When the video changes, the server fetches its thumbnail once from YouTube's image server and keeps it like the other files: showing it then reports no member to YouTube. It only asks the addresses written in the class for an identifier it has checked, never the address that was typed; `clipThumbnailUrls` in `config.php` replaces them, which the test server uses to fetch a file of its own. If the host does not let PHP reach another site, or the fetch fails, the clip is saved all the same and the cover art stands in.
- **Reading the name of a file** ([FileNames](../api/src/Songs/FileNames.php)): the kind from the extension, and for a PDF the instrument whose name or alias (`instrumentAlias`) has all its words in the name of the file, the spelling with the most words winning. It is written once, on the server, and the import screen asks it before sending anything. The name of a track of a MIDI file is read by the same rule, on its whole name (`FileNames::tracks()`). Aliases come from the starting library (`api/resources/instrumentLibrary.<language>.json`), copied at install with the instruments that are kept.
- **The known spellings** ([InstrumentAliases](../api/src/Songs/InstrumentAliases.php)) are listed in the band settings but belong to whoever manages songs (`MANAGE_SONGS`, not `MANAGE_BAND`). A spelling is cleaned with `FileNames::words()` before it is saved, its words joined by one space; with `songName`, the words of the name of the song are taken out first (the box "Remember this name for next time" of the import sends the name of the file without its extension). Giving an instrument a spelling it has, or its own name, changes nothing and answers normally. A refusal is the usual 422 `invalidInput` on the field `alias`: `required` (no letter and no digit, or nothing left without the words of the song), `tooShort` and `tooLong` (2 to 25 characters), or `aliasTaken` when another instrument has the spelling or bears it as its name. With `aliasTaken`, `fields` carries one more entry, `takenByInstrumentId`, the id of that instrument written as a text since the fields of a refusal are texts: `{"error": "invalidInput", "fields": {"alias": "aliasTaken", "takenByInstrumentId": "7"}}`. It is the only refusal that names something.
- **The archive** is refused above 600 MB of files, more than a whole repertoire. It is built with PHP's `ZipArchive` (the `zip` extension, added to the local image) in the temporary folder, files stored as they are, and removed from the folder as soon as it is opened for sending. Its name is given by the screen (`download` attribute): the server writes no sentence.
- **A member who leaves** loses the levels they gave ([ChangeStatusAction](../api/src/Members/ChangeStatusAction.php)); an instrument that has a part cannot be deleted (the database refuses, `instrumentInUse`).

### Gigs

`api/src/Gigs/`. Rules: [model/gigs.md](../model/gigs.md). Every line of its tables of rights is a test in `tests/api/gigs.spec.ts`. Its screens: "The front", below.

| Address | Who | What |
|---|---|---|
| `GET /api/gigs` | Signed in | The gigs to come, the nearest first, each with its slots, the answer of the member who asks and whether it is playable. With `?all`, the cancelled gigs and those already played too |
| `GET /api/gigs/{id}` | Signed in | One gig: its record, its organisers, its costumes, its slots and the answer of every member |
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
| `GET /api/band/gigReminders` | `MANAGE_BAND` | The days of the two reminders of a gig and the hour they are sent from |
| `PUT /api/band/gigReminders` | `MANAGE_BAND` | The days of the two reminders of a gig and the hour they are sent from, all three at once |

- **Who may edit a gig** is whoever holds `MANAGE_GIGS` and the organisers of that gig. It is the one right of the app that depends on the object and not only on a role, so it has its own check, [RequireGigEditor](../api/src/Gigs/RequireGigEditor.php), set on every route that changes a gig; `Gigs::mayEdit()` is the only place that says it. Each gig is answered with `canEdit`, for the screen.
- **A draft does not exist for who cannot edit it**: it is left out of the list, and its address answers 404, the same as a gig that is not there. An organiser who takes themself off a draft gets `{ id, canEdit: false }` as the answer of that save. Who may edit a gig keeps it in the list once its date has passed while it is a draft, proposed or accepted: it waits to be deleted or cancelled.
- **[Gigs](../api/src/Gigs/Gigs.php)** builds what is answered about a gig, from columns listed one by one. The Discord channel is sent to who may edit the gig only.
- **Playable** is computed from the answers each time, never stored: a slot is playable when every section that has a current member has a yes from a current member, a gig when one of its slots is. Each slot is answered with `isPlayable`, `isPlayableIfNeeded` (counting the "if needed" answers), `missingSectionIds` and `ownYesMakesPlayable` (the section of the member who asks is the last one without a yes).
- **The status** follows `GigStatus::next()`, the table of the dictionary; anything else is 409 `invalidTransition`. The app changes a status by itself in one case, `Gigs::confirmIfPlayable()`: an accepted gig that is playable becomes confirmed, after an answer or when it becomes accepted. It then writes no author (`updatedByMemberId` empty). A confirmed gig never goes back by itself.
- **"In progress" and "past" are not statuses** and the server does not answer them: the screen reads them from `startsOn`, `endsOn` and `meetingTime`, on the clock of the device. The server only needs to know that a gig is over, to stop the answers and to shorten the list, and it is generous about it: a gig is over once the day after its last day has ended by the clock of the server (UTC), so that no time zone closes it early. `Gigs::firstOpenDay()` is the only place that says it.
- **Answers** are accepted while the gig is proposed, accepted or confirmed and not over (409 `gigNotOpen` otherwise), from current members and for current members.
- **Slots.** A gig always has one: the last one is not deleted (409 `lastSlot`). A slot needs a name as soon as its gig has several, so the only slot of a gig is named before a second one is added (409 `slotWithoutName`). The costume of a slot is one of the costumes of its gig, which the database checks too (a reference from `gigSlot` to `gigCostume`); taking a costume off a gig empties it on its slots first.
- **Deleting** is for a draft (409 `gigNotDraft`) nobody answered for (409 `gigHasAnswers`: a cancelled gig reopened as a draft keeps its answers). A costume a gig has, even a gig already played, is not deleted (409 `costumeInUse`).
- **The picture of a costume** ([CostumePictures](../api/src/Gigs/CostumePictures.php)) follows the photo of a member: the browser makes it small before it is sent (1200 wide at most, what the top of a gig needs on the densest phone, about 150 kB as a JPEG), and the server only checks what it receives: a PNG, a JPEG or a WebP, 1200 by 2400 at most, 800 kB at most. Nothing on the host resizes an image, so no PHP extension is needed for it. Each costume of the list is answered with `pictureUrl` and `gigCount`, the number of gigs that have it: what keeps it from being deleted.
- **The reminders of the band** are three columns of `band`, answered by `GET /api/band/gigReminders` to who manages the band (they are not in the public `GET /api/band`) and saved together by `PUT /api/band/gigReminders`, where a number of days left out means that this reminder is not sent. They are read by the hourly task below.
- **Push notifications** (`api/src/Push/`). A device is a session: [Push](../api/src/Push/Push.php) keeps one subscription per session (`pushSubscription`), deleted with it, and only accepts the address of a push service of a browser (the list is in that class), so that a member cannot make the server call an address of their choice. What the browser gave is never answered back. Sending is done once the answer has left (`AfterResponse`), through a [PushTransport](../api/src/Push/PushTransport.php): the Web Push library on the host ([WebPushTransport](../api/src/Push/WebPushTransport.php)), a file on the test server ([RecordedTransport](../api/src/Push/RecordedTransport.php)). A device the push service says is gone is forgotten. The keys of the instance (VAPID) are in `config.php` under `push`, made once with `npm run push:keys`; without them `GET /api/push` answers `publicKey: null` and the app offers no notification.
- **The text of a notification is written by the server**, like an email, because the phone shows it while the app is closed: `api/resources/push.<language>.json`, read by [PushTexts](../api/src/Push/PushTexts.php) in the language of each member.
- **The live setlist is announced at each change** ([LivePush](../api/src/Gigs/LivePush.php)): to the members who said yes to the slot of the setlist, the song being played and the two after it. The title starts with the position ("3/6 · Prochain : Toxic") because an iPhone cannot replace a notification: they pile up, and each one must read alone. On Android the tag makes it replace the one before, and who manages setlists gets the action "Suivant". Nothing is sent when nothing moved (the button pressed twice).
- **Reminders** ([Reminders](../api/src/Gigs/Reminders.php)): one notification per member, with one line per gig, to the `ACTIVE` members who have not answered for one slot at least; never to a power member. The button of a gig sends it for that gig. The automatic ones are sent by [api/tasks/gigReminders.php](../api/tasks/gigReminders.php), a command-line script to run every hour as a scheduled task of the host: it reminds for the gigs in `PROPOSED` and `ACCEPTED` that start in exactly the first or the second number of days of the band, from the hour of the band, unless they were already reminded for that day. Running it twice changes nothing. The clock is the one of `timeZone` in `config.php`.
- **What the dictation learned** ([SpokenNames](../api/src/Songs/SpokenNames.php), `songSpokenName`): a phrase is cleaned the same way by the server and by the front (`cleanPhrase` in [dictation.ts](../web/src/screens/gigs/dictation.ts)): lowercase, no accents, letters said one by one joined. A phrase names one song: learned for another it moves; added by hand it is refused with the song that has it (`phraseTaken`, `takenBySongId`) until `moves` is sent. Beyond 20, the oldest phrase of the song leaves, learned or typed. The name of the song itself is never saved.
- **The map of the meeting point** needs nothing from the server but its address: `mapTilesUrl` of `config.php` (the vector tiles of the OpenStreetMap Foundation when left out, no map when empty), answered with a gig that has coordinates.
- **A member who leaves** no longer organises the gigs that are not over, and stays on those already played, with their answers ([ChangeStatusAction](../api/src/Members/ChangeStatusAction.php)). An organiser and an answer are sent with the nickname, so that they still read once the member is out of the directory.

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
- **[AppearanceOf](../web/src/AppearanceOf.tsx)** decides the look and the language: the choices of the account when someone is signed in; otherwise the scheme of the device, the theme and the language of the band, and the accessibility options chosen before sign-in. Those are kept in the storage of the browser, on the device only ([deviceAccessibility.ts](../web/src/deviceAccessibility.ts)); the options of an account are never written there.
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
- **Setlists** ([GigSetlists](../web/src/screens/gigs/GigSetlists.tsx), [SetlistFormScreen](../web/src/screens/gigs/SetlistFormScreen.tsx)). A gig answers with its setlists from `CONFIRMED` on, and with none before (`Setlists::ofGig()`). They show as an accordion (`SetlistCard`), the live one open first. The form is written by typing: the songs offered are those the band plays (in the repertoire or temporary), compared without case or accents; Enter adds the first and never sends the form. The whole setlist is saved at once (`songIds` in order); the number is given by the server. A song is moved with Monter and Descendre in its panel.
- **The live setlist** ([LiveSetlistScreen](../web/src/screens/gigs/LiveSetlistScreen.tsx)) takes the whole window, without the menu. `setlist.livePosition` is the only state: the screen asks for the setlist every 4 seconds (no websocket on the host) and brings the song being played to the focus line, which is the top padding of the list. The list snaps to its songs (`scroll-snap`); for who manages setlists, the song that rests on the line for 350 ms becomes the one being played, and a scroll the screen made itself is ignored. Styles and opacities follow the distance to that song (`--fadeNear` to `--fadeFaint`, full or nearly in high contrast). The screen is kept on with the Screen Wake Lock where the device has it. The book button shows the Live mode of the song (`LiveView`) in place of the list; closing it comes back.
- **Dictating a setlist** ([useDictation.ts](../web/src/screens/gigs/useDictation.ts), [dictation.ts](../web/src/screens/gigs/dictation.ts)). The browser recognises the speech (Web Speech API, no library): the sound goes to the recogniser of the device, only text reaches the app. Each thing heard is compared with the names of the songs a setlist can hold and with the phrases learned for them: heard exactly, or clearly ahead of the next one, the song is added; two that are close are offered ("Tu as dit … : lequel ?"); nothing close adds nothing. How close is measured as in the prototype the owner tried on his phone: the pairs of letters two texts share, on the text and on a rough key of its sound (so that an English title heard the French way still meets its name), letters named in a row ("dé a enne cé e") being joined first; among the wordings the recogniser gives, the one closest to a song is kept. The language listened for is a key of the locale (`dictation.language`, "fr-FR"). The phrase is learned when the member chooses, or when they remove the song the dictation just added and type another one at once; typing alone teaches nothing. A browser without speech recognition shows no microphone. The phrases of a song are edited in its form ([SpokenNames.tsx](../web/src/screens/songs/SpokenNames.tsx)).
- **The map of the meeting point** ([GigMeetingMap](../web/src/components/GigMeetingMap.tsx)) is a still picture drawn by MapLibre: not moved by hand, zoom 17, two buttons that change it by 1 between 12 and 19, and a press that opens the maps app like "Y aller". Its style ([mapEngine.ts](../web/src/components/mapEngine.ts)) draws the land, water, building and street layers of the Shortbread schema in the `map…` colours of the scheme (the main roads in `mapStreetMajor`, lighter in the dark scheme; the ways of a car park or of a pedestrian area thin like the paths, so that the streets stand out), read from the CSS where the map is and applied again when the scheme or the contrast changes; it has no layer of names, so no font is asked for. The library is imported when a map appears, never before. "© OpenStreetMap" is written by the app and always visible; the tiles are asked by the browser, which sends its Referer. For assistive technology the map is decoration: the address is in words beside it.
- **Notifications on a device** ([push.ts](../web/src/push.ts)). A device that can receive them and was never asked is asked once, when the app opens ([AskNotifications](../web/src/screens/settings/AskNotifications.tsx), remembered in the browser's own storage and forgotten at sign-out); the setting stays in the account ([NotificationsScreen](../web/src/screens/settings/NotificationsScreen.tsx)). An iPhone only has notifications in the app added to the home screen: the screen says so.
- **Leaving a form with changes asks first** ([LeaveGuard.tsx](../web/src/screens/LeaveGuard.tsx), `useLeaveGuard`): written once with `useBlocker` of React Router, it catches every way out, the back button of the browser included. Used by the form of a setlist; a form that wants it gives it "has something changed" and calls `letGo()` once saved.
- **Putting a list in order by dragging** ([Sortable.tsx](../web/src/components/Sortable.tsx)): `SortableList`, `useSortableRow` and `SortableHandle`, over `@dnd-kit`. A row is dragged by its handle, or by itself where Figma draws no handle (the costumes: a finger rests on the row a moment first, so that the page still scrolls). Dragging is for a pointer; each list keeps "Monter" and "Descendre".
- **One recording plays for the whole app** ([Player.tsx](../web/src/screens/songs/Player.tsx)): the browser's own audio player, never shown, held by a provider around the screens of signed-in members ([Guards.tsx](../web/src/screens/access/Guards.tsx)), so that it goes on from a screen to another and stops with the session. The song draws it in its MP3 mode, every other screen in the mini-player (`SongMention`).
- **A MuseScore file is read by the browser that sends it** ([files.ts](../web/src/screens/songs/files.ts), [score.worker.ts](../web/src/screens/songs/score.worker.ts)). The MuseScore engine compiled for the browser (`webmscore`, about 17 MB) is not in the bundle: `vite.config.ts` serves its four files as they are at `/webmscore/`, where the engine looks for them beside itself, and only a worker started by `sendFiles()` loads them, so a member who imports nothing never downloads them. One worker per file: the engine does not open a second score after closing one. It gives the MIDI file and the score as compressed MusicXML (`.mxl`). A file of MuseScore 4.4 holds a line (`<LastEID>`) the engine does not know and answers with an empty score, without an error: the worker then gives the engine the score of the archive alone (its `.mscx`), without that line. When it cannot read the file (or after 90 seconds), the MuseScore file is sent alone, the screen says that the MIDI player and the reading mode have nothing, and a `.mid` or MusicXML file dropped by hand is sent instead; without one, the MIDI file and the MusicXML the song had from an earlier score are removed, since they are no longer its own. What the score gives is sent after it, and not at all when the score itself is refused.
- **The tracks of the MIDI file are named after the staves.** A MuseScore file gives each part two names: the one printed on the staff and the one of the sound that plays it; a MIDI file exported by MuseScore carries the second. The worker writes the first in each track (`withTrackNames()` of [midi.ts](../web/src/screens/songs/midi.ts)), in the order of the parts, which is the order of the tracks. **The rehearsal marks of the score go the same way**: MuseScore writes none in a MIDI file, so the worker reads them in the MusicXML (`rehearsalMarks()`), asks the engine when each measure is played, repeats included (`measurePositions()`), and writes each mark as a MIDI marker (`withMarks()`). The loop of the MIDI player offers them, each with the measures up to the next mark (`markRanges()`). Only real rehearsal marks count, not staff or system text.
- **The MIDI player** ([MidiView.tsx](../web/src/screens/songs/MidiView.tsx)) reads the file with `midi-file` ([midi.ts](../web/src/screens/songs/midi.ts): notes, tempo and measures, all counted in ticks, so that the tempo changes without reading anything again). It asks the server which instrument each track is (`POST /api/songs/trackNames`); a track nobody recognises keeps the name the file gives it. Each lane is a canvas drawn around the playhead, hidden from screen readers: what it tells is carried by the mute button (`aria-pressed`) and the number of the measure. MuseScore writes several measures of rest as one long measure ("54/8"): such a time signature is ignored when the measures are counted.
- **The sound** ([midiEngine.ts](../web/src/screens/songs/midiEngine.ts)): one `Soundfont` of `smplr` per track, through a volume of its own (the mute), handed its notes a fifth of a second ahead on the clock of Web Audio. The samples are files of the app (`web/public/soundfonts/`, see "Files taken from other projects"), never fetched from another site: `smplr` would by default. They cover the instruments of a brass band; any other General MIDI sound is played with the nearest (`samplesOf()`). Each instrument weighs 2 to 3 MB and is downloaded when the MIDI mode of a song that uses it is first opened; the browser then keeps it. The recording of the band and the MIDI file never play together.
- **The Live mode** ([LiveView.tsx](../web/src/screens/songs/LiveView.tsx)) shows one part of the score, rising line by line at the tempo. It is a modal `<dialog>` over the whole screen: the page behind cannot be reached, Escape leaves, and the focus comes back to the mode bar. It is never the mode a song opens in. [score.ts](../web/src/screens/songs/score.ts) reads the MusicXML kept with the song (it opens a compressed `.mxl` itself, with the `DecompressionStream` of the browser, and stops at 50 MB), keeps one part (`partAlone()`: the rehearsal marks, which MuseScore writes in the first part only, are copied into it; the tempo mark is taken out, the screen says the tempo) and works out the order and the length of the measures, repeats and voltas included (`timelineOf()`, lengths in quarter notes). Jumps written in words (D.S., D.C., coda) are not followed. The part is the one of the member's instrument, found by the names of the parts as for the tracks (`POST /api/songs/trackNames`).
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
| An icon (`Icon/Globe`) | `<Icon name="Globe" />` for `Style=Outline`, `<Icon name="Globe" filled />` for `Style=Filled`; the paths of both styles are in [iconPaths.ts](../web/src/components/iconPaths.ts), generated from Figma, and drawn by [Icon.tsx](../web/src/components/Icon.tsx) |

Rules that keep it true:

- **No component holds a value of its own.** Colours, spacing, radii and sizes come from `tokens.css`; typefaces, sizes and weights of text come from the classes of `text.css`.
- **The alias chain of Figma is kept**: `Scheme` variables point to `Theme` and `Primitives` with `var()`, and the type sizes and typefaces of `Size` point to `TextSize` and `Typeface`. Each collection has one block per mode in `tokens.css`, and the mode is one attribute on the root element: `data-scheme` (`dark` or `light`), `data-contrast="more"` (the two high contrast modes), `data-theme="coral"` (absent: the first theme), `data-text-size="140"` (absent: 100 %), `data-typeface="legible"`. The list of themes is in [themes.ts](../web/src/themes.ts).
- **A part of a screen can take a scheme of its own**, as a frame does in Figma when its mode is set by hand. An element that carries `data-scheme="dark"` (or `"light"`) gets the `Scheme` variables of that mode, whatever the scheme of the app: each block of `Scheme` in `tokens.css` applies to the root and to such an element, with the same `var()` chain. It follows the contrast of the root, so dark becomes dark high contrast when high contrast is on. Only what floats over the cover of a song uses it (`ModeBar`, and the cover and the compact form of `SongHeader`), because a cover can be of any colour. Such an element sets `color: var(--text)` itself: the colour of the text is inherited already computed. `appearance.ts` stays the only place that writes on the root.
- **Glass.** A floating surface is the `glass` colour and a blur of what is behind it. Figma uses its native glass effect (the effect style `glass`), which CSS cannot copy: the blur stands in for it, with no stroke on the components of the songs.
- **Sizes are in rem.** Figma gives pixels; `tokens.css` writes them as pixels divided by 16, text and spacing alike. The app never changes the size of the root: the text size option of a member changes the type sizes only (the modes of `TextSize`), so spacing, radii, icons and controls keep their size, and the height of a control is always a `min-height`. A browser whose own font size was changed scales everything, page titles included: this is accepted. Lines (1 and 2 px) and the halo stay in pixels.
- **Blur.** Figma counts a blur twice as large as CSS does: a blur of 40 in Figma is `blur(20px)`.
- **Bricolage Grotesque has an optical size axis**, which the browser applies by itself as Figma does: big titles are drawn tighter. Its font files must keep that axis, or titles come out wider than drawn and wrap differently.
- **Typefaces are served by the app**, never by a font service: no visitor is reported to a third party. A test checks that the install screen asks nothing of another site.
- A component that Figma does not have is not created here.

The components written so far. Base layer: `Icon`, `Pictogram`, `Button`, `IconButton`, `TextField`, `ImageField`, `Checkbox`, `Radio`, `Switch`, `SegmentedControl`, `Slider`, `FilterChip`, `ListRow`, `NavRow`, `SwitchRow`, `SliderRow`, `AccessibilityOptions`, `Chip`, `Sheet`, `Message`, `Avatar`, `ThemeSwatch`, `QuickAction`, `StepIndicator`, `ScreenTop`, `BottomBar`, `TabBar`, `SideNav`, `Halo`, `ModeBar`, `DropZone`, `Waveform`, `LevelScale`, `Rating` (and its `RatingStar`), `Gauge`, and `Panel`, which gives `BottomSheet` and `Dialog`. Business objects: `InstrumentRow`, `SectionCard`, `SectionBadge`, `PictogramChoice`, `BandMention`, `MemberCard`, `MemberRow`, `MemberHeader`, `MemberMention`, `MemberTable` (the header and the rows of Figma), `SongTile`, `SongRow`, `SongCard`, `SongHeader`, `SongMention`, `SongTable` (the header and the rows of Figma), `SongFileRow`, `SongPartRow`, `SongPartTrack`. Every control is the browser's own (checkbox, radio, range), drawn as in the design: it keeps the keyboard, the focus and what screen readers say.

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
- A phone that has already installed the app may keep the old name and icon until the app is installed again: this is how phones behave.
- The service worker ([web/public/sw.js](../web/public/sw.js)) does one thing: it shows the push notifications and opens the app where they point (and, for who manages setlists, moves the live setlist on from the notification). It caches nothing: offline use is not a goal. It is registered when a member turns notifications on, not before.
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
| `guzzlehttp/guzzle` | 8.2.0 | The HTTP client the Web Push library calls the push services with; it finds it by itself (`Psr18ClientDiscovery`) | The most used HTTP client in PHP, MIT. It brings `guzzlehttp/psr7`, `guzzlehttp/promises` and two Symfony polyfills |

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

Not set up yet. The hosting is the OVH Perso plan (decision of 2026-10-12; what it gives is in `docs/scoping.md`): PHP 8.4 in PHP-FPM, MySQL, scheduled tasks once per hour at most, and no command line (SSH).

Deployment goes through OVH's Git integration, which copies one branch of the GitHub repository to the host on each push and builds nothing. That branch is a dedicated `release` branch: a GitHub Action builds the front end, installs the PHP dependencies and pushes the result to it. `main` is never deployed directly. The action is still to write. Migrations must be runnable without a terminal: through a protected admin page (admin role, explicit confirmation) or through phpMyAdmin.

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

- The map writes its credit itself and turns the attribution control of `maplibre-gl` off, and shows no popup: no text of a tile source is ever written as HTML. Version 5 of the library had an advisory on exactly that code (GHSA-jrc7-96c5-q579, fixed in 6): keep it that way.
- `maplibre-gl` 6 looks for its worker in a file beside its own, which the build does not produce. [mapEngine.ts](../web/src/components/mapEngine.ts) imports the worker with `?worker&url`, so that Vite builds it into a file of the app, and gives its address to the library (`setWorkerUrl`). Without it the map stays empty, with "Worker failed to load" in the console.
- A sheet opened from inside a form (`Panel` in the form of a song) must not hold a `<form>` of its own: the browser drops the inner one and the button sends the outer form.

## Not built yet

In the order of the scoping document:

1. Deployment to OVH Perso: the GitHub Action that fills the `release` branch, and the way to run a migration without a command line.
2. What the Members feature leaves for later: the export of the directory, the Discord action of a member's sheet, sending an invitation by email, a prettier email, and the screens Figma has not drawn (see below).
3. What the Songs feature leaves for later: in the Live mode, the jumps written in words (D.S., D.C., coda), the system texts of the score, the tempo and the measure tiles that Figma means to open a picker (not drawn), the halo and the glass panel of the controls; the landscape layout of the MIDI player as drawn; the Discord place on the song; reading the name of a song inside the MuseScore file; and what Figma does not draw: the empty MIDI, Live, PDF and Clip modes (their wording is provisional), the desktop list with its actions (add, manage, download, filters are kept from the phone screen), the management table below the desktop width.
4. What the Gigs feature leaves for later: a real notification sent from the host (nothing is deployed yet), the scheduled task of the host that runs the automatic reminders (to set up with the deployment), the export and import of the data. Not drawn in Figma, and deduced: where the buttons that add and manage a gig sit on a desktop, the way to the form of a gig that exists (from the panel that manages it), a confirmed gig of several days.
5. The later features.

Screens that were deduced from the phone screens, because Figma does not draw them yet. Each follows the rules of the design skill (a larger screen derives from the phone screen, a sheet becomes a dialog from 1024 px, a flow takes the floating panel), and is to be checked when it is drawn:

- the whole app on a tablet and at 1920 px;
- on a desktop: the sheet of a member, the settings, sign-in, forgotten password, the invitation, the record of a member and the invite form, the settings of the band;
- what a line of the desktop table opens (the record of the member);
- loading and server error states (a line of text, and a `Message`);
- the page opened without the right in the settings of the band, and the list of countries (the list of the device).
