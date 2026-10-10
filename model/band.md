# Business dictionary — Band domain

> v1.0 — 2026-10-10 · Model: `band.dbml` · Validated · Migration: `002_band.sql`

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

### Rules
- **Created at install, never deleted.** Install asks for the name and, optionally, the logo. Both can be changed later in the settings.
- **The name and the logo are public.** They appear on the sign-in screen and in what the phone shows when the app is installed (its name and its icon), which a device reads without being signed in. Nothing else of the app is served without sign-in.
- **Logo file.** Accepted when it really is an image of one of the four formats, whatever its extension says. Stored under a name chosen by the app, never the uploaded file name. An SVG can carry scripts: it is only ever served as an image, with headers that forbid running anything in it.
- **Icon of the installed app.** A phone needs square PNG icons, whatever the format of the logo. They are produced from the logo when it is uploaded: the logo fitted in a square, on a plain background. Without a logo, the app keeps its neutral icon. No second image is asked for.
- **Replacing the logo** replaces the file and the icons. A phone that has already installed the app may keep the old icon until the app is installed again: this is how phones behave.
- **Default language.** Set at install to the language the install was done in, and given to each new member.

### Relations
- None. Other tables carry no reference to the band: the app holds one band (see the `brass-band-model` skill, "One instance, one band").

### Access rights
| Who | View | Create | Edit |
|---|---|---|---|
| Anyone, signed in or not | Name and logo | No | No |
| Any signed-in member | Everything | No | No |
| `ADMIN` | Everything | At install only | Yes |

### Instance settings
- This whole object is the instance settings.

### Display
- A long name is cut with an ellipsis under the icon of the installed app, by the phone itself: about 12 characters are visible.
- Without a logo, the name alone is shown.
- Representations in the design library: none exists yet. Expected: header (sign-in screen), mention.

## 2. Open questions

None blocking.

For later:

- The default accent theme of the band, and whether a band can define its own colours: with the design system.
- Discord settings (`discordServerId` in the overview model): with the Discord feature.
