# Business dictionary — Band domain

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
| `defaultLanguage` | Default language | Langue par défaut | Yes | fr | 2 to 5 | One of the languages shipped with the app |
| `defaultAccentTheme` | Accent colour | Couleur d'accent | Yes | copper | — | One of the accent themes of the design system |
| `defaultCountryCode` | Country | Pays | Yes | FR | 2 | Two-letter ISO code. The country a phone number belongs to when it is typed without its prefix |
| `gigFirstReminderDays` | First reminder | Première relance | No | 15 | — | Days before the gig, from 1 to 90. Empty: no first reminder |
| `gigSecondReminderDays` | Second reminder | Deuxième relance | No | 5 | — | Days before the gig, fewer than the first. Empty: no second reminder |
| `gigReminderHour` | Hour of the reminders | Heure des relances | Yes | 18 | — | From 0 to 23 |

### Rules
- **Created at install, never deleted.** Install asks for the name and, optionally, the logo. Both can be changed later in the settings.
- **What makes the app look like the band is public**: the name and the logo, which appear on the sign-in screen and in what the phone shows when the app is installed (its name and its icon), and the three defaults a screen needs before sign-in: the accent colour, the language, and the country (to read the phone number typed during an invitation). A device reads them without being signed in. So does whether the instance can send email, which decides what the forgotten password screen says. Nothing about the members is served without sign-in. (Two technical routes are public too: whether the app is installed, and whether the server reaches its database.)
- **Logo file.** Accepted when it really is an image of one of the four formats, whatever its extension says. An SVG that declares a document type is refused. Stored under a name chosen by the app, never the uploaded file name. An SVG can carry scripts: it is only ever served as an image, with headers that forbid running anything in it.
- **Icon of the installed app.** A phone needs square PNG icons, whatever the format of the logo. They are produced from the logo when it is uploaded: the logo fitted in a square, with a margin, on a white background (no colour of the band is modelled yet). They are drawn by the browser of the person who uploads, and checked by the server. Without a logo, the app keeps its neutral icon. No second image is asked for.
- **Replacing the logo** replaces the file and the icons. A phone that has already installed the app may keep the old icon until the app is installed again: this is how phones behave.
- **Default accent theme.** The accent colour of the band: the one shown before sign-in, and to every member who has not chosen their own (`member.accentTheme` empty). Install does not ask for it: it starts as the first theme of the list. An admin changes it in the settings; the change applies at once to the members who follow the colour of the band. A band cannot define its own colours for now.
- **Country.** Install does not ask for it: it starts as the country of the language the install was done in (France for French). No screen changes it yet; the API lets an admin do it.
- **Reminders of a gig.** The members who have not answered for a gig are reminded twice, a number of days before it, from a given hour (Gigs domain, `model/gigs.md`, rule "Automatic reminders"). Install does not ask for the three values: they start at 15 days, 5 days and 18 h. An admin changes them in the settings, the three together; an empty number of days means that this reminder is not sent, and the second number is smaller than the first. The hour is read on the clock of the server, set in its configuration to the time zone of the band.
- **Updating the database.** A new version of the app can come with migrations: changes to the tables that must be applied once. On a host without a command line, an admin applies them from the band settings. The screen lists the migrations that wait; applying them asks for a confirmation and for the password of the admin again, because the change cannot be undone and a device left signed in must not be enough. A wrong password counts like a wrong password at sign-in (Members domain, "Wrong passwords"). The screen then says which migrations were applied and, when one failed, which one and what the database answered: the migrations before it stay applied, and the database is repaired by hand before trying again. While migrations wait, an admin is told on the home screen and in the band settings. The first migrations of an instance are applied by the install, on an empty database, once the install key is accepted (Members domain, "Install"); once the app is installed, the install key opens nothing, migrations included. The list of what was applied (`schemaMigration`) is technical and not part of the model.
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
- Representations in the design library (Figma, `Design system` page): `Band/Mention`, the logo and the name on one line, used above the title of the sign-in screen and at the top of the desktop menu. Expected: header.

## 2. Open questions

None blocking.

For later:

- Whether a band can define its own colours: with the design system.
- The address the app sends email from is server configuration, not a setting of the band (Members domain, entry 3).
- Discord settings (`discordServerId` in the overview model): with the Discord feature.
