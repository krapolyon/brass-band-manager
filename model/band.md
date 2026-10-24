# Business dictionary — Band domain

> v1.12 — 2026-10-24 · Validated by the owner, for 0.4.0 · Model: `band.dbml` v1.9 · `setlistTargetMinutes`, the length the setlist generator proposes first (issue #60); ten accent themes, four of them renamed, with a migration of the stored keys (issue #58)
> v1.11 — 2026-10-24 · Validated by the owner, for 0.3.2 · No change to the table · The browser tab shows the icon the admin gave, not the icons made from the logo (issue #56); the app is tagged on Discord, its name read from Discord (issue #45)
> v1.10 — 2026-10-23 · Validated by the owner, for 0.3.1 · No change to the table · The icon of the browser tab is the icon of the app (issue #48)
> v1.9 — 2026-10-18 · Validated by the owner (0.3.0) · Model: `band.dbml` v1.8 · No change to the table · The second reminder of a gig no longer has to come after the first
> v1.8 — 2026-10-18 · Validated by the owner (0.3.0) · Model: `band.dbml` v1.7 · No migration yet · The icon of the installed app (issue #34); the Discord server of the band (issue #33); the time between two songs of a setlist (issue #25)
> v1.7 — 2026-10-13 · No change to the tables · Decided with the deployment: updating the database from the app, for the admin, on a host without a command line (rule "Updating the database", permission to run the migrations)
> v1.6 — 2026-10-13 · Model: `band.dbml` · Validated · Migrations: `002_band.sql`, `004_pictogramsAndBandDefaults.sql`, `008_gigs.sql` · The reminders of a gig

Examples in this document are made up, except the name of the band that started the project.

## 1. Band (`band`)

### Definition
The band this instance of the app belongs to, and the settings that make the app its own. One instance hosts one band: the table holds a single row, created at install.

### Fields
| Field | Label (en) | Label (fr) | Required | Example | Realistic length | Rules |
|---|---|---|---|---|---|---|
| `name` | Band name | Nom de la fanfare | Yes | Les Krapos · La Fanfare des Cuivres Déchaînés | 5 to 40 | Never translated |
| `logoPath` | Logo | Logo | No | — | — | An image file: PNG, SVG, JPEG or WebP, 2 MB at most |
| `iconPath` | App icon | Icône de l'app | No | — | — | A square image: PNG, JPEG or WebP, 512 pixels a side at least, 2 MB at most. See "Icon of the installed app" |
| `defaultLanguage` | Default language | Langue par défaut | Yes | fr | 2 to 5 | One of the languages shipped with the app |
| `defaultAccentTheme` | Accent colour | Couleur d'accent | Yes | brass | — | One of the accent themes of the design system |
| `defaultCountryCode` | Country | Pays | Yes | FR | 2 | Two-letter ISO code. The country a phone number belongs to when it is typed without its prefix |
| `gigFirstReminderDays` | First reminder | Première relance | No | 15 | — | Days before the gig, from 1 to 90. Empty: no first reminder |
| `gigSecondReminderDays` | Second reminder | Deuxième relance | No | 5 | — | Days before the gig, from 1 to 90. Empty: no second reminder |
| `gigReminderHour` | Hour of the reminders | Heure des relances | Yes | 18 | — | From 0 to 23 |
| `discordServerId` | Discord server | Serveur Discord | No | 1000312294715883560 | 17 to 20 digits | Digits only. Read from the link of a channel of the server. See "Discord" |
| `setlistGapSeconds` | Between two songs | Entre deux morceaux | Yes | 30 | — | From 0 to 300 seconds. Edited by an admin under "Plans et setlists" |
| `setlistTargetMinutes` | Length of a proposed setlist | Durée d’une setlist proposée | Yes | 45 | — | From 5 to 180 minutes, by steps of 5. Edited by an admin under "Plans et setlists" |

### Rules
- **Created at install, never deleted.** Install asks for the name and, optionally, the logo. Both can be changed later in the settings.
- **What makes the app look like the band is public**: the name and the logo, which appear on the sign-in screen and in what the phone shows when the app is installed (its name and its icon), and the three defaults a screen needs before sign-in: the accent colour, the language, and the country (to read the phone number typed during an invitation). A device reads them without being signed in. So does whether the instance can send email, which decides what the forgotten password screen says. Nothing about the members is served without sign-in. (Two technical routes are public too: whether the app is installed, and whether the server reaches its database.)
- **Logo file.** Accepted when it really is an image of one of the four formats, whatever its extension says. An SVG that declares a document type is refused. Stored under a name chosen by the app, never the uploaded file name. An SVG can carry scripts: it is only ever served as an image, with headers that forbid running anything in it.
- **Icon of the installed app** (changed in v1.8, issue #34). A phone needs square PNG icons. An admin can give an image made for it (`iconPath`): a square, used as it is, without a margin; an image that is not square is refused, with its size in the message. Without one, the icons are produced from the logo, as before: the logo fitted in a square, with a margin, on a white background. Removing the icon goes back to the icons of the logo; without a logo either, the app keeps its neutral icon. The icons are drawn by the browser of the person who uploads, and checked by the server. The screen shows how the icon will look on a phone, rounded as a phone rounds it.
- **The icon of the browser tab** (favicon, issues #48 and #56) is the icon the admin gave (`iconPath`) when there is one, as it is; else the icons made from the logo; else the neutral icon. Every page of the app shows it, the screens before sign-in included.
- **Replacing the logo** replaces the file, and the icons when the band has no icon of its own. A phone that has already installed the app may keep the old icon until the app is installed again: this is how phones behave.
- **Default accent theme.** The accent colour of the band: the one shown before sign-in, and to every member who has not chosen their own (`member.accentTheme` empty). Install does not ask for it: it starts as the first theme of the list. An admin changes it in the settings; the change applies at once to the members who follow the colour of the band. A band cannot define its own colours for now. The themes are those of the design system, ten from 0.4.0 (issue #58): brass, tangerine, raspberry, orchid, cornflower, azure, lagoon, emerald, lime, ivory, the first being the default. Four replace the former ones, and a value stored before is moved to its new name by a migration: copper becomes brass, coral tangerine, mint lagoon, lilac orchid; the default of the column becomes brass.
- **Country.** Install does not ask for it: it starts as the country of the language the install was done in (France for French). No screen changes it yet; the API lets an admin do it.
- **Reminders of a gig.** The members who have not answered for a gig are reminded twice, a number of days before it, from a given hour (Gigs domain, `model/gigs.md`, rule "Automatic reminders"). Install does not ask for the three values: they start at 15 days, 5 days and 18 h. An admin changes them in the settings, the three together; an empty number of days means that this reminder is not sent. The second number does not have to be smaller than the first (owner, 2026-10-18): two reminders that fall on the same day are sent once, since no automatic reminder is sent on a day one was already sent. The hour is read on the clock of the server, set in its configuration to the time zone of the band.
- **Updating the database.** A new version of the app can come with migrations: changes to the tables that must be applied once. On a host without a command line, an admin applies them from the band settings. The screen lists the migrations that wait; applying them asks for a confirmation and for the password of the admin again, because the change cannot be undone and a device left signed in must not be enough. A wrong password counts like a wrong password at sign-in (Members domain, "Wrong passwords"). The screen then says which migrations were applied and, when one failed, which one and what the database answered: the migrations before it stay applied, and the database is repaired by hand before trying again. While migrations wait, an admin is told on the home screen and in the band settings. The first migrations of an instance are applied by the install, on an empty database, once the install key is accepted (Members domain, "Install"); once the app is installed, the install key opens nothing, migrations included. The list of what was applied (`schemaMigration`) is technical and not part of the model.
- **Discord** (v1.8, issue #33). A band that talks on Discord gives its server once: an admin pastes the link of any channel of the server (Discord: "Copier le lien du salon"), and the app keeps the server from it. From then on, a song or a gig that has a channel shows a link that opens it in Discord: in the app of a phone that has it, in the browser otherwise. The link is `https://discord.com/channels/<server>/<channel>`. 
  **The bot of the band** (decided on 2026-10-18) reads; it never writes. It is a Discord application the band creates and invites to its server, with two permissions: see the channels and read their history, and the privileged intent "Message Content". Its token is written in the server configuration (`discord.botToken`), never in this table nor in the repository. The app calls the Discord API (REST) when it needs to: the bot is never "connected" and shows offline in Discord, which is expected on a host without a long-running process. With the bot, an admin chooses the Discord role of each section among the roles of the server (Members domain, `section.discordRoleId`), and the app shows the messages that tag it (changed on 2026-10-24, issue #45): on a gig, those that tag the app; on a song, those that tag the app and the section of the member (Songs and Gigs domains). The app is tagged by the name of the bot, or by the role Discord gives the bot; the app reads both from Discord (the bot itself and its role), so nothing is typed, and the Discord screen of the settings shows the name. The tag of the app is never shown in the app. Without the token, or when Discord refuses it, the settings say so and the links keep working.
- **Length of a proposed setlist** (v1.12, issue #60). The setlist generator asks for a length, not a number of songs: it starts from `setlistTargetMinutes` (45 minutes by default), which an admin changes under "Plans et setlists" (a stepper, 5 to 180 minutes by 5), and who proposes a setlist adjusts it each time (Gigs domain, "Proposing a setlist").
- **Length of a setlist** (v1.8, issue #25). The length of a setlist adds up the length of its songs and `setlistGapSeconds` between two songs (Gigs domain, entry 4). 30 seconds by default, changed by an admin on the screen of the reminders, renamed "Plans et setlists".
- **Default language.** The install opens in French, and its first screen offers the other languages shipped with the app. `defaultLanguage` is set to the language the install was done in, and given to each new member.

### Relations
- None. Other tables carry no reference to the band: the app holds one band (see the `brass-band-model` skill, "One instance, one band").

### Access rights
| Who | View | Create | Edit |
|---|---|---|---|
| Anyone, signed in or not | Everything: the table holds nothing private | No | No |
| `ADMIN` | Everything | At install only | Yes |

Updating the database is not a change of this object, and has its own line:

| Who | See the migrations that wait | Apply them |
|---|---|---|
| Anyone not signed in, and every member who is not an admin, whatever their other roles | No | No |
| `ADMIN` | Yes | Yes, with their password asked again |

### Instance settings
- This whole object is the instance settings.

### Display
- A long name is cut with an ellipsis under the icon of the installed app, by the phone itself: about 12 characters are visible.
- Without a logo, the name alone is shown.
- The icon is previewed at the size of a phone home screen, rounded, with the name of the band under it, cut as a phone cuts it.
- Representations in the design library (Figma, `Design system` page): `Band/Mention`, the logo and the name on one line, used above the title of the sign-in screen and at the top of the desktop menu. Expected: header.

## 2. Open questions

None blocking.

For later:

- Whether a band can define its own colours: with the design system.
- The address the app sends email from is server configuration, not a setting of the band (Members domain, entry 3).
