# Business dictionary — Band domain

> v1.5 — 2026-10-11 · Model: `band.dbml` · Validated · Migrations: `002_band.sql`, `004_pictogramsAndBandDefaults.sql`

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

### Rules
- **Created at install, never deleted.** Install asks for the name and, optionally, the logo. Both can be changed later in the settings.
- **What makes the app look like the band is public**: the name and the logo, which appear on the sign-in screen and in what the phone shows when the app is installed (its name and its icon), and the three defaults a screen needs before sign-in: the accent colour, the language, and the country (to read the phone number typed during an invitation). A device reads them without being signed in. So does whether the instance can send email, which decides what the forgotten password screen says. Nothing about the members is served without sign-in. (Two technical routes are public too: whether the app is installed, and whether the server reaches its database.)
- **Logo file.** Accepted when it really is an image of one of the four formats, whatever its extension says. An SVG that declares a document type is refused. Stored under a name chosen by the app, never the uploaded file name. An SVG can carry scripts: it is only ever served as an image, with headers that forbid running anything in it.
- **Icon of the installed app.** A phone needs square PNG icons, whatever the format of the logo. They are produced from the logo when it is uploaded: the logo fitted in a square, with a margin, on a white background (no colour of the band is modelled yet). They are drawn by the browser of the person who uploads, and checked by the server. Without a logo, the app keeps its neutral icon. No second image is asked for.
- **Replacing the logo** replaces the file and the icons. A phone that has already installed the app may keep the old icon until the app is installed again: this is how phones behave.
- **Default accent theme.** The accent colour of the band: the one shown before sign-in, and to every member who has not chosen their own (`member.accentTheme` empty). Install does not ask for it: it starts as the first theme of the list. An admin changes it in the settings; the change applies at once to the members who follow the colour of the band. A band cannot define its own colours for now.
- **Country.** Install does not ask for it: it starts as the country of the language the install was done in (France for French). No screen changes it yet; the API lets an admin do it.
- **Default language.** The install opens in French, and its first screen offers the other languages shipped with the app. `defaultLanguage` is set to the language the install was done in, and given to each new member.

### Relations
- None. Other tables carry no reference to the band: the app holds one band (see the `brass-band-model` skill, "One instance, one band").

### Access rights
| Who | View | Create | Edit |
|---|---|---|---|
| Anyone, signed in or not | Everything: the table holds nothing private | No | No |
| `ADMIN` | Everything | At install only | Yes |

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
