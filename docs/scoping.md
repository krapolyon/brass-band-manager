# Scoping

A brass band replaces its internal tools with a web app that installs on a phone (a PWA), hosted on OVH shared hosting, for about thirty members. This document records the decisions taken: technology, scope of the first version, build order, and the points still to verify.

The project was started by one band, Les Krapos, and is meant to be reused by others. Numbers given here (session durations, for instance) are defaults, to be refined or made configurable.

A decision recorded in this document is settled. If one looks wrong, say so once with the reason; do not work around it.

## Decisions

| Subject | Decision | Reason |
| --- | --- | --- |
| Kind of app | A single PWA, for phone and web | One codebase, no Apple account or review, updates are immediate |
| Native app | Set aside for now, possible later by wrapping the PWA | It needs upkeep even when nothing changes. The owner has a Mac and the association is a registered entity, so this exit stays easy ([Apple's conditions](https://developer.apple.com/support/web-distribution-eu/)) |
| Hosting | OVH shared hosting | Small budget, no server administration |
| Hosting plan | OVH Perso | Enough for one band: 5 × 1 GB MySQL, PHP 8.4 (FPM), Git deployment. Trade-offs: no SSH, hourly cron at most, PHP mail limited to 100/hour. 2.99 € excl. VAT/month the first year, then 5.99 € |
| Back end | PHP without a full framework, with targeted libraries. Slim, a micro-framework limited to routing and error handling, is accepted | Avoid forced upgrades: a framework such as Laravel is only patched for 2 years per version ([support policy](https://laravel.com/docs/12.x/releases)). Slim has stayed on the same major version since 2019 |
| Front end | React with Vite, built to static files | React is already familiar to the owner, and built files do not age |
| Database | MySQL, included in the hosting | Nothing more to install or pay for |
| Sign-in | Identifier and password, long session | Magic links were rejected: too tedious in use |
| Offline | Not a priority | Members are rarely offline, and scores are not used during gigs |
| PDF scores | Provided as they are, not generated | Fitting a part on one page is adjusted by hand |
| Icons | Iconsax, outline at rest and filled for the current item | Chosen by the owner for its style; its two styles mark the current tab or mode without relying on colour. Its free licence forbids redistributing the files: a licence is arranged before the code is published |
| Go-live | After members, the simple version of songs, and gigs | At that stage the app already replaces the old tools |

## Technical stack

Guiding principle: what is frozen must not age. The app will be changed rarely once it is stable, so nothing may force an update just to keep running.

- **Front end**: React and TypeScript with Vite, built to static files. Dependencies only matter on the day the app is rebuilt.
- **Back end**: an API in PHP without a full framework. Passwords and sessions rely on PHP's native functions.
- **PHP libraries**: Slim for routing, Doctrine DBAL for data access (no ORM), Valinor for input validation, and later a library to send push notifications. Selection criteria: the best fit for the need, proven, maintained, secure. Versions pinned. Proven libraries are preferred to home-made code; what is avoided is the large framework. The list and the reason for each are in `docs/architecture.md`.
- **Security base layer**: written once and shared by every feature (database access, sessions, rights, validation). It replaces the safeguards a framework would provide.
- **Database**: MySQL, evolved through numbered SQL scripts.
- **Hosting**: OVH shared hosting. OVH maintains PHP and keeps old versions available for a long time ([PHP versions at OVH](https://docs.ovhcloud.com/fr/guides/web-cloud/web-hosting/web-hosting-main-info)).
- **Notifications**: web push, with reminders triggered by OVH's scheduled tasks.
- **Deployment**: OVH's Git integration deploys a dedicated `release` branch. A GitHub Action builds the front end, installs the PHP dependencies and pushes the result to `release`. Nothing is built on the host, and `main` is never deployed directly.
- **End-to-end tests**: Playwright.

**Interface**: no component library such as MUI, which would make the app look like many others. Components are written for the app, in plain CSS, with variables for colours and typography. The same variables let other bands restyle it. A behaviour-only library (dialogs, menus, accessibility, no styling) may be added to the base layer.

**Languages**: interface text goes through a translation library (i18next), French first. Dates and numbers rely on the browser's native functions.

What shared hosting rules out: real time and permanent background processes. No planned feature needs them.

Without SSH, migrations run through a protected admin page (admin role, explicit confirmation) or through phpMyAdmin. The app is served from a subdomain (e.g. `app.<band-domain>`) next to the existing website.

What the OVH Perso plan gives, as read on OVH's product page on 2026-10-12: 5 MySQL databases of 1 GB, 15 sites, 100 GB of storage, 10 email addresses; PHP up to 8.4 in PHP-FPM (`memory_limit` 512M, `max_execution_time` 165 s); PHP `mail()` limited to 100 sendings per hour; scheduled tasks once per hour at most, each running 60 minutes at most; no SSH; a Git integration for GitHub only, one repository, deployed by a webhook on push, from a branch of one's choice, into a target folder that starts empty, with no build step.

## Sign-in and data protection

The session is long but not eternal, and above all revocable: the app holds personal data.

| Rule | Default |
| --- | --- |
| Expiry on inactivity | 90 days without opening the app, extended on each use |
| Maximum length of a session | 1 year, so one sign-in per year and per device |
| Account creation | On invitation by someone who manages members; the member chooses a password. In the first version the invitation link is copied and sent by whoever invites, and stays valid 7 days; sending it by email from the app comes later |
| Forgotten password | By email, with a link valid 1 hour (decided on 2026-10-11). On an instance that cannot send email, the screen sends the member to those who manage members, who create a link |

- **Revocation**: sessions are stored on the server. A member can sign out all devices, and disabling an account cuts access immediately.
- **Protected cookie**: unreadable by page code, sent over HTTPS only.
- **Sensitive actions**: the password is asked again, for instance to export the list of members.
- **Password change**: signs out the other devices.
- **Sign-in attempts**: limited, against brute force.
- **Files**: recordings, scores and other files are served to signed-in members only.
- **Who sees what**: decided feature by feature in the model, starting with members.
- **Sending email**: forgotten password makes it a dependency of the server. The address and the access to the mail server are server configuration; an instance can run without them.

## Scope of the first version

The first version covers three objects: members, songs and gigs.

### Members

- Personal information and instrument of each member.
- Roles: member, admin, and roles to manage songs, to manage gigs and, later, to manage quotes.

### Songs

Between 40 and 50 songs, each with a MuseScore file. Every song is a cover, so each has the cover art of the original.

- **Record**: internal name, original title, original artist, video clip (YouTube, played inside the app), status (proposed, in progress, in the repertoire, temporary, abandoned). Each member says how well they play a song and how much they like it; the band sees the averages, to decide which songs leave the repertoire.
- **Files**: cover art, recording of the band (mp3 or m4a), MIDI, MuseScore (.mscz), one PDF score per instrument.
- **mp3 playback**: built-in player.
- **Scores**: access to every PDF.
- **MIDI player**: playback with tempo control and choice of active tracks, with a viewer. The sound comes from recorded samples of instruments, served by the app (decided on 2026-10-13; a synthesiser was first planned).
- **Reading mode**: the part of one instrument, large, on a single line that scrolls under a cursor. Song tempo by default, adjustable by tapping the beats. Choice of the starting measure, pause, jump to a measure.
- **Discord**: read and write in the song's thread. Messages sent from the app carry the member's name. No real time: the thread reloads when opened.

### Gigs

Decided on 2026-10-13 with the model of gigs (`model/gigs.md`), which replaces the first outline: the date, the meeting time and the place are those of the gig, no longer of each slot.

- A life cycle: draft (seen by those who manage gigs only), proposed, accepted, confirmed, cancelled. A gig is confirmed once it is accepted and playable, or forced by hand.
- Date or dates, meeting time, place, address, information.
- Who organises: the organisers may edit their gig.
- Slots: one by default, several with a name for a gig of several days. Members answer per slot: yes, no, maybe, if needed. A slot is playable once every section has a yes.
- Costumes: a list managed by the band, those to bring to a gig, the one of each slot.
- Setlists: order of songs, setlist number, tied to a gig. Built last in this step.
- Push notifications, first used here: two automatic reminders before a gig, and a button to remind at once.

## Later features

They are not built in the first version, but the model and the design reserve a place for them from the start.

- **Setlists, further**: following a setlist during the gig, the next songs on the lock screen, Discord interaction. Song suggestion to be studied. The setlists themselves are built with the gigs (decided on 2026-10-13).
- **Rehearsals**: songs to work on.
- **Song statistics**.
- **Quotes**: quotes for paid gigs.
- **Export and import of the data of an instance**, to move a band from one install to another (noted by the owner on 2026-10-11, not scoped yet). It has to carry the database and the uploaded files of `storage/` together, and to say what happens to passwords and sessions.

### Opening the code

The code is published as open source so that other bands can install it and make it theirs (name, logo, colours). These rules apply from now on, so that nothing has to be redone:

- **Nothing specific to one band in the code**: name, logo, colours, language and Discord settings are instance settings.
- **Everything in English**: code, comments, commits, repository documentation and skills, to welcome contributors from other countries.
- **Translatable interface**: no hard-coded text in screens. Labels go through a translation library, French being the first language.
- **One instance per band**: each band hosts its own. The band is already an object of the model, so that several can be hosted together later.
- **A clean repository**: no secret, no personal data, no music file in the repository.

At first, each band hosts its own PWA. Going to the app stores would mean a shared app that stores the data of every band. That work (shared hosting, data separation, GDPR) will be studied at that point.

## Importing songs

The MuseScore file is the source of each song: it holds what makes a score readable (transposition, clefs, key signatures, repeats).

| File | Origin |
| --- | --- |
| MuseScore (.mscz) | Provided |
| PDF scores | Provided, already laid out on one page |
| mp3 | Provided |
| MusicXML, one per track | Generated from the .mscz, for the reading mode |
| MIDI | Generated from the .mscz, so that its tracks match those of the reading mode |

- **Alias table**: each instrument has its known spellings ("sax alto", "sax mib", "sxm"). At import the files of a song are dropped together and the app puts each one in its place, from its kind and, for a PDF, from the instrument its name tells; what it understood is shown and corrected before anything is saved (decided on 2026-10-12, `model/songs.md`). Old files are not modified.
- **Initial import**: a command on the owner's Mac processes the whole repertoire at once. MuseScore cannot run on shared hosting, so conversion is done locally.
- **New songs**: the app also accepts files exported by hand from MuseScore, so that adding a song does not depend on one person.
- **Existing code**: a bulk upload with file analysis was written during earlier trials. It will serve as a starting point.

## Design

The design is thought out for the whole app before features are built: adding a feature to a design that did not plan for it rarely gives a smooth result.

- **Scope**: the navigation and the screens of every feature of the first version, plus the place of later features (rehearsals, statistics, quotes).
- **Phone first**: the main use is on a phone; the web version follows from it.
- **On a computer** (decided on 2026-10-11): the navigation is a floating menu on the left, and the install follows the same floating panel. A list that is managed, the members first, is a table; a list that is browsed stays a grid of cards.
- **Accessibility** (decided on 2026-10-11): the options are offered behind a button on every screen before sign-in, the invitation included, and in the settings afterwards. Setting them is never a step to go through.
- **Design system**: colours, typography and components defined once and reused everywhere.
- **Reading mode**: its design is finalised after the prototype, which will show what is readable and smooth on a real phone.
- **Dependency**: the design builds on an overview data model, at a coarse grain, established just before.

The app must have a real identity, not the look of a generic kit. The target style is modern, clean and elegant. Today's music apps give an idea of the level of modernity, without being a model to copy. Gradient backgrounds or illustrations may bring visuals. A cartoon spirit is excluded. The band's friendly, joking tone goes through the wording.

- **Starting point**: the band's logo, a chunky rounded lettering. The brand guide of the band's website is not a constraint, and the logo's colours may change.
- **Style study**: carried out in Claude Design, with several directions to compare. Ready-made styles serve there as a mood board, never as the final style.
- **Definitive design**: design system and screens in Figma, with variables and components. The owner edits it directly.
- **Identity and customisation**: identity lies in structure, typography, tone and motion. Name, logo and colours stay replaceable.

**Retained direction**: dark and immersive. The cover art of the song gives the screen its colour, the member chooses an accent theme among several, and the app is light by day and dark by night.

**Business objects**: the design is organised around the objects of the model (member, song, gig, slot), each with its possible representations: a mention in a text, a row in a list, a card, a tile, the header of its own screen. A screen assembles these representations, which keeps the app consistent.

**Exploration**: during the exploratory phase of a feature, screens can do without components, since everything can still move. They still use the shared variables. Components are extracted once a direction is chosen.

## Build order

The app goes live after step 6. Steps 7 to 9, more ambitious, are built while members adopt it.

1. **Technical base**: repository, installable app, sign-in, roles, OVH deployment, tests. In parallel, a prototype of the reading mode on two or three real songs.
2. **Overview data model**: every object, including those of later features, at a coarse grain.
3. **Overall design**: navigation, screens, design system.
4. **Members**.
5. **Songs, simple version**: record, files, mp3 playback, PDF scores, import of the repertoire.
6. **Gigs and attendance**, with notifications, then setlists. **Go-live**: migration of the data from the old tools, installation guide for iPhone and Android.
7. **MIDI player**.
8. **Reading mode**.
9. **Discord**.

Steps 5 and 6 are interchangeable. Each feature follows the same loop: detailed model, design, development, end-to-end tests, deployment.

## How the work is organised

The repository links the two places where the work is done with Claude, which do not share their context.

- **The design conversations** (a Claude project): scoping, data model and design. The definitive design lives in Figma.
- **Claude in VS Code**: development, tests, deployment. It does not design: it reads the design in Figma through the Figma connector.
- **This repository**: `CLAUDE.md`, this `docs/` folder, and a `model/` folder where the data model studies stay and are kept up to date. All of them are read from both sides.

Skills first, agents later.

- **Project skills** are stored and versioned in the repository, under `skills/`. The first is `brass-band-model` (data model in DBML, camelCase names, business dictionary, SQL scripts). The second is `brass-band-design` (art direction, themes and variables, business objects and their representations, the path from exploration to Figma).
- **Skills to add with the base layer**: the PHP security layer, the end-to-end test recipe, the deployment procedure.
- **Agents**: useful once there is code to review or tests to run in parallel. Nothing to create at the start.

## Points to verify

| Point | To settle during |
| --- | --- |
| Outbound HTTPS calls from PHP (web push, Discord API) work on OVH Perso: test with a throwaway script before building on them | Base |
| The existing band website does not already use the plan's single Git deployment slot | Base |
| Whether a 90-day session really holds on a PWA installed on an iPhone | Base |
| Push notifications on iPhone, once the app is on the home screen | Base, then gigs |
| Many mail providers no longer accept mail sent by PHP `mail()` unless the domain has SPF and DKIM set up (not verified). The app sends through the mailbox of the domain, by SMTP: check that its emails arrive, and what the domain needs | Notifications |
| MySQL treats table names as case-sensitive on OVH (Linux) but not on a Mac. With camelCase names, the development database must behave like OVH's | Base |
| Command-line MuseScore conversion on the oldest files | Prototype |
| Smoothness of a long scrolling score on a phone | Prototype |
| Repeats, codas and open solos: controls to follow the band live | Prototype |
| Audio playback on iPhone, including in silent mode | MIDI player |
| Discord's rules on a bot reading messages | Discord |
| A licence of Iconsax that allows its icons in an open-source repository | Before the code is published |
| Apple's fee waiver for an app distributed outside the App Store | Only if the app goes native |

## Still to provide

- Two or three .mscz files from different periods, including one of the oldest, with their PDFs.
- The bulk upload and file analysis code written during the first trials.
- The OVH Perso hosting, to order, and the subdomain of the app.
