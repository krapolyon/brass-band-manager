# Export and import of the data — format 1

> v1.3 — 2026-10-24 · Validated by the owner, for 0.4.0 · The reprise: loading members, songs, gigs, slots and answers from spreadsheets (issue #43); an import that adds members without a password sends their invitations (issue #50); `band.setlistTargetMinutes` travels with the settings
> v1.2 — 2026-10-18 · Validated · The new fields of a song and of the band travel with them (0.3.0); the encrypted fields of a member travel in clear in the zip (0.3.1, Members v1.23)
> v1.1 — 2026-10-13 · The phrases the dictation learned (`songSpokenName`, Songs v1.4) travel with the songs
> v1.0 — 2026-10-13 · Decided with the owner during the design of gigs · Not built yet · Screens: Figma, page `Band settings`, section 5

What the export and the import of an instance do, and the exact shape of the file. Read with `model/` (the tables) and `docs/architecture.md` (the storage of files). When this document and the code disagree, the code is wrong.

## What it is for

- Preparing the data of a band on a computer (members, songs, gigs) and sending it to the server in one go.
- Moving a band from one installation to another, or keeping a copy of it.

It is not a backup of the hosting: sessions, devices and the state of a live setlist do not travel.

## Who, and how

- **The admin only** (`ADMIN`), from Band settings. The password is asked again before an export and before an import: the file holds personal data.
- **Export**: the admin ticks the parts to export; the server builds the zip and sends it as a download. Nothing is kept on the server afterwards.
- **Import**: the admin gives a zip, from the browser, or by FTP into the folder `import/` of the hosting when the file is too large for the browser (about 250 MB at most for a band; the upload limit of the host is to be checked). The screen lists the zips found in `import/`. The server reads the file, shows what it holds and what it will change, and imports only once the admin confirms. The zip is deleted from `import/` afterwards, imported or not.
- **The admin who imports must be an admin in the file** (same email, role `ADMIN`), or the import is refused before anything changes. After an import that holds members, every session ends, theirs included: they sign in again with the password of the file.
- **All or nothing**: an import runs in one transaction. Files are first written to a temporary folder of `storage/`, moved into place only once the rows are saved, and removed if anything fails.

## The parts

A file holds one or several parts. A part depends on others: importing it requires the rows it refers to, either in the same file or already on the server.

| Part | Tables | Files | Depends on |
| --- | --- | --- | --- |
| `settings` | `band`, `section`, `instrument`, `instrumentAlias` | the logo | — |
| `members` | `member`, `memberRole` | profile photos | `settings` |
| `songs` | `song`, `songPart`, `songSpokenName`, `memberSong` | cover, MuseScore, MIDI, MusicXML, recording, clip thumbnail, PDF parts | `settings`, `members` (for `memberSong`) |
| `gigs` | `costume`, `gig`, `gigOrganizer`, `gigCostume`, `gigSlot`, `gigSlotAttendance`, `setlist`, `setlistSong` | costume pictures | `settings`, `members`, `songs` (for setlists) |

Never exported: `memberSession`, `memberPasswordLink`, `pushSubscription`. The live state of a setlist (`liveStartedAt`, `livePosition`) is exported empty.

## Rows are matched by their business key, never by `id`

The `id` of a row is local to an installation: it is not in the file. Each row is found again by what makes it unique in the model, and a reference is written as that key.

| Table | Key in the file |
| --- | --- |
| `band` | the single row |
| `section`, `instrument`, `costume` | `name` |
| `instrumentAlias` | `alias` |
| `member` | `email` |
| `song` | `name` |
| `songSpokenName` | `phrase` |
| `gig` | `name` + `startsOn` |
| `gigSlot` | its gig + `position` |
| `setlist` | its gig + `number` |

A reference to a member is its email, to a song its name, to an instrument its name, and so on: `"memberEmail": "lulu@example.org"`, `"songName": "Seven Nation Army"`.

## What an import changes

- **Add or update, never delete.** A row of the file whose key exists on the server updates it; otherwise it is added. A row of the server that the file does not hold is kept. To remove something, remove it in the app.
- **Inside an imported row, its own lists are replaced**: the roles of a member, the parts and the phrases of a song, the slots, organisers, costumes, answers and setlists of a gig. A gig of the file therefore arrives exactly as it was exported.
- **`band`** is overwritten, except the settings that only make sense on one host (none today; the Discord settings will be listed here when they exist).
- **A reference that cannot be found** (an answer from a member who is neither in the file nor on the server) makes the import refuse, with the list of what is missing. Nothing is imported in part.
- **Encrypted fields** (Members domain, "Encryption") are written in clear in the file and encrypted again with the key of the server that imports them; `emailHash` is not exported, it is computed again.
- **Passwords** travel as their hashes (`passwordHash`, PHP `password_hash()`): they are never readable, and the members keep their passwords. A member who was invited and has not set one arrives as invited, without a pending link: the admin sends a new invitation.
- **Positions** (`section.position`, `instrument.position`, `costume.position`, …) are taken from the file.

## The zip

```
krapos-2026-10-13-1842.zip
├── manifest.json
├── settings/
│   ├── data.json
│   └── files/logo.svg
├── members/
│   ├── data.json
│   └── files/<nickname>-<n>.jpg
├── songs/
│   ├── data.json
│   └── files/<song>/<file>
└── gigs/
    ├── data.json
    └── files/<costume>.jpg
```

- The name of the zip is the name of the band in lowercase letters and hyphens, then the date and time of the export.
- A part that was not exported has no folder.
- Every file of a row is named in its `data.json` by its path inside the part (`"cover": "files/seven-nation-army/cover.jpg"`). The server gives it a new place in `storage/` on import, as for an upload, and checks it as an upload is checked (type from its content, size).

### `manifest.json`

```json
{
  "format": 1,
  "app": "brass-band-manager",
  "appVersion": "0.4.0",
  "exportedAt": "2026-10-13T18:42:07+02:00",
  "exportedBy": "lulu@example.org",
  "parts": ["settings", "members", "songs", "gigs"],
  "counts": { "member": 31, "song": 48, "gig": 112 },
  "files": { "songs/files/seven-nation-army/cover.jpg": "sha256:9f2c…" }
}
```

- `format` is the version of this document. The app imports every format up to its own and refuses a newer one, saying which version of the app it needs.
- `files` lists every file with its SHA-256: a missing or altered file stops the import.

### `data.json`

One object per table of the part, each holding its rows. Field names are those of the DBML; `id` and the foreign keys are replaced by the keys above. Dates are `YYYY-MM-DD`, times `HH:MM`, instants ISO 8601 with their offset; empty fields are `null`.

```json
{
  "gig": [
    {
      "name": "Fête des Lumières",
      "status": "CONFIRMED",
      "startsOn": "2026-12-04",
      "endsOn": "2026-12-06",
      "meetingTime": "18:00",
      "placeName": "Place des Terreaux",
      "organizers": ["lulu@example.org"],
      "costumes": ["Paillettes", "Jungle"],
      "slots": [
        {
          "position": 1,
          "name": "Vendredi soir",
          "note": "Défilé sur la presqu'île",
          "costume": "Paillettes",
          "answers": [{ "memberEmail": "lulu@example.org", "answer": "YES" }]
        }
      ],
      "setlists": [
        {
          "number": 1,
          "slotPosition": 1,
          "description": "Après le repas",
          "songs": ["Get Lucky", "Crazy", "Toxic"]
        }
      ]
    }
  ]
}
```

The lists that belong to a row (slots, answers, organisers, the songs of a setlist in their order, the phrases of a song as `"spokenNames": ["seven nation armee"]`) are written inside it, as above, rather than as separate tables. The examples of this document are made up.

## Invitations after an import

An import that adds members who have no password (invited, or arrived as invited) sends each their invitation by email, unless the admin turns off "Envoyer les invitations par e-mail" on the screen that confirms the import (on by default; off for a test installation). The switch is not shown on an instance without a mail server. The admin who imports is never invited (Members domain, "An invitation leaves by email", issue #50).

## Reprise: loading a band from spreadsheets

Added in v1.3 (0.4.0, issue #43). Screens: Figma, page `Band settings`, sections 9 and 10.


### What it is for

Starting an installation with the data a band already keeps in spreadsheets: its members, its songs and their files, its gigs with their slots and the answers of members. It is not the export of the app (the zip in JSON above), which moves an installation as it is.

Not loaded by a reprise: setlists (made in the app), the settings of the band (name, logo, sections, instruments, known spellings, costumes: set in the app before the reprise), and what belongs to each member's account (password, appearance, accessibility, notifications, calendar address, levels given to songs).

### Who, and how

- **The admin only**, from Band settings, Import, where an export is dropped. The password is asked again, as for an import.
- **"Télécharger les modèles"** gives a zip made by the server for this installation: the five empty CSV files with their header row and two made-up example rows, the folders `members/photos/` and `songs/`, and `allowed-values.csv`, which lists every accepted value of every column that has a list (see "Allowed values").
- The admin fills the files, zips the whole and drops it. The server reads it, shows what it will add and update, and loads only once the admin confirms.
- **All or nothing.** Any error stops the reprise before anything is written. The screen lists every error with its file and its line ("members.csv, ligne 12 : l’instrument « Sax mib » n’existe pas ici").
- **Add or update, never delete.** A row whose key exists in the installation updates it; otherwise it is added. What the files do not hold is kept.
- **No notification.** A reprise sends no notification of any kind (new song, new score, gig playable or confirmed…), whatever the settings of the members: it loads what already existed (decided on 2026-10-24). The invitations below are the only emails it sends.
- **Invitations** (issue #50): a member added by the reprise has no password, so is `INVITED`. With a mail server, each receives the email of invitation once the reprise is loaded, unless the admin turns off "Envoyer les invitations par e-mail" (on by default; off for a test installation). The admin who loads is never invited.

### The zip

```
reprise.zip
├── members.csv
├── songs.csv
├── gigs.csv
├── slots.csv
├── answers.csv
├── members/photos/<nickname>.jpg
└── songs/<name of the song>/<files>
```

A file that is not in the zip is simply not read: a reprise can hold members only, songs only, and so on. A file that refers to rows of another (an answer refers to a member and a slot) finds them in the zip or in the installation.

### Rules for every CSV file

- **Encoding and separator.** UTF-8. The separator is `;` or `,`, found from the header row: Excel in French writes `;`.
- **Header row.** The first row names the columns, exactly as written below (English, camelCase, as in the model). Their order is free. A column that is not listed is refused; an optional column can be left out.
- **Several values in one cell** are separated by `|`, for instance `SONG_MANAGER|GIG_MANAGER` or `Souba|Percu`.
- **Values from a list** (statuses, roles, moods, answers…) are written as their code (`IN_REPERTOIRE`) or as their label in the app (`Au répertoire`), case and accents ignored. `allowed-values.csv` lists both.
- **Names of the band** (instruments, sections, costumes) are written as in the app; an instrument may also be written as one of its known spellings ("sax mib").
- **Dates** `YYYY-MM-DD` or `DD/MM/YYYY`; **times** `HH:MM`; **durations** in seconds or `m:ss`.
- **An empty cell** of an optional column leaves the value of an existing row unchanged; on a new row it leaves the field empty. A field is emptied in the app, not by a reprise (decided on 2026-10-24).
- **Lists of a row** (the roles of a member, the positions of a song, the organisers of a gig…) given in a cell replace the list of an existing row; an empty cell leaves it unchanged.

### members.csv — one row per member, key `email`

**A member whose email already exists in the installation is updated** with the cells that are filled; a new email adds a member.

| Column | Field | Required | Values |
| --- | --- | --- | --- |
| `email` | `member.email` | Yes | An email address; stored in lowercase. The key |
| `nickname` | `member.nickname` | Yes | Unique in the band, case and accents ignored |
| `firstName` | `member.firstName` | Yes | |
| `lastName` | `member.lastName` | Yes | |
| `instrument` | `member.instrumentId` | Yes | An instrument of the band, or one of its known spellings |
| `status` | `member.status` | No | `ACTIVE`, `POWER_MEMBER`, `LEFT`. A new member is `INVITED` whatever is written, unless `LEFT` (a former member, kept for the history of answers; decided on 2026-10-24); on an existing member who has a password, changes between the three |
| `roles` | `memberRole.role` | No | `ADMIN`, `MEMBER_MANAGER`, `SONG_MANAGER`, `GIG_MANAGER`, `SETLIST_MANAGER`, separated by `|`. Empty on a new row: a plain member. The admin who loads keeps `ADMIN` whatever is written |
| `mobilePhone` | `member.mobilePhone` | No | Read with the country of the band when it has no `+`, stored in international format |
| `streetAddress` | `member.streetAddress` | No | Several lines in one quoted cell |
| `postalCode` | `member.postalCode` | No | |
| `city` | `member.city` | No | |
| `countryCode` | `member.countryCode` | No | Two letters, ISO 3166-1 (`FR`) |
| `addressInstructions` | `member.addressInstructions` | No | Door code, floor, where to park |
| `language` | `member.language` | No | A language of the app (`fr`). Empty on a new row: the language of the band |
| `photo` | `member.photoPath` | No | The name of a file of `members/photos/`. Empty: `<nickname>.jpg`, `.jpeg`, `.png` or `.webp` when it exists. Checked as an upload |

### songs.csv — one row per song, key `name`

**A song whose name already exists in the installation is updated**, compared without regard to case or accents, as in the app: never a second song of the same name. Its cells that are filled replace its fields, and its files are replaced as described under "Files".

| Column | Field | Required | Values |
| --- | --- | --- | --- |
| `name` | `song.name` | Yes | The name the band gives it. The key, and the name of its folder in `songs/` |
| `originalTitle` | `song.originalTitle` | Yes | |
| `originalArtist` | `song.originalArtist` | Yes | |
| `status` | `song.status` | No | `PROPOSED`, `IN_PROGRESS`, `IN_REPERTOIRE`, `TEMPORARY`, `ABANDONED`. Default `PROPOSED` |
| `inRepertoireOn` | `song.inRepertoireOn` | No | A date. Empty for a song `IN_REPERTOIRE`: the 1st of January of the year of the file (Songs domain) |
| `mood` | `song.mood` | No | `CHILL`, `MEDIUM`, `PARTY` (Chill, Normal, Teuf). Default `MEDIUM` |
| `positions` | `songPosition.position` | No | `START`, `FIRST_HALF`, `MIDDLE`, `SECOND_HALF`, `END`, separated by `|`. Default `FIRST_HALF|MIDDLE|SECOND_HALF` |
| `tiringFor` | `songTiringSection` | No | Sections of the band, separated by `|` |
| `trickyFor` | `songTrickySection` | No | Sections of the band, separated by `|` |
| `bpm` | `song.bpm` | No | 20 to 400 |
| `durationSeconds` | `song.durationSeconds` | No | 10 to 1200 seconds, or `m:ss`. Empty: read from the MIDI file when there is one |
| `versionOn` | `song.versionOn` | No | A date |
| `versionNote` | `song.versionNote` | No | |
| `copyright` | `song.copyright` | No | Authors and composers |
| `clipUrl` | `song.clipUrl` | No | The address of a YouTube video. The thumbnail is fetched by the server, as in the app |
| `discordChannel` | `song.discordChannelId` | No | The link of the channel or its number. Refused when the band has no Discord server |
| `spokenNames` | `songSpokenName.phrase` | No | Phrases the dictation should know, separated by `|` |

**Files.** The folder `songs/<name>/` holds the files of the song, read by the same rules as the import of songs in the app: the cover, the MuseScore file, the MIDI file, the MusicXML, the recording, and one PDF per part, whose instrument is read from its file name with the known spellings. A file whose part cannot be read is an error of the reprise.

**Re-importing a song** replaces each of its files by the one of the same kind given in its folder: the cover by the cover, the MuseScore file by the MuseScore file, the part of an instrument by the part of the same instrument, and so on. A file the folder does not give is kept: a reprise never deletes a file. The replaced files are deleted from the storage once the reprise is loaded, as when a file is replaced in the app; the MIDI file and the MusicXML produced from a new MuseScore file follow the rules of the app.

### gigs.csv — one row per gig, key `name` + `startsOn`

| Column | Field | Required | Values |
| --- | --- | --- | --- |
| `name` | `gig.name` | Yes | |
| `startsOn` | `gig.startsOn` | Yes | A date |
| `endsOn` | `gig.endsOn` | No | A date, not before `startsOn`. Empty for a gig of one day |
| `status` | `gig.status` | No | `DRAFT`, `PROPOSED`, `ACCEPTED`, `CONFIRMED`, `CANCELLED`. Default `PROPOSED` |
| `meetingTime` | `gig.meetingTime` | No | `HH:MM` |
| `placeName` | `gig.placeName` | No | |
| `placeUrl` | `gig.placeUrl` | No | |
| `streetAddress` | `gig.streetAddress` | No | |
| `postalCode` | `gig.postalCode` | No | |
| `city` | `gig.city` | No | |
| `latitude` | `gig.latitude` | No | Decimal degrees, with `longitude` or not at all |
| `longitude` | `gig.longitude` | No | Decimal degrees |
| `notes` | `gig.notes` | No | Several lines in one quoted cell |
| `discordChannel` | `gig.discordChannelId` | No | As for a song |
| `organizers` | `gigOrganizer` | No | Emails of members, separated by `|` |
| `costumes` | `gigCostume` | No | Costumes of the band, separated by `|` |

Not loaded: `remindedAt`. `proposedAt` is not taken from the file: a gig loaded by a reprise is never shown as new (decided on 2026-10-24).

### slots.csv — one row per slot, key `gigName` + `gigStartsOn` + `position`

A gig that has no row here gets one slot, position 1, without a name.

| Column | Field | Required | Values |
| --- | --- | --- | --- |
| `gigName` | the gig | Yes | The `name` of a gig of gigs.csv or of the installation |
| `gigStartsOn` | the gig | Yes | Its `startsOn` |
| `position` | `gigSlot.position` | Yes | 1, 2, 3… |
| `name` | `gigSlot.name` | When the gig has several slots | "Samedi midi" |
| `note` | `gigSlot.note` | No | |
| `costume` | `gigSlot.costumeId` | No | One of the costumes of the gig |

### answers.csv — one row per answer, key the slot + `memberEmail`

| Column | Field | Required | Values |
| --- | --- | --- | --- |
| `gigName` | the gig | Yes | |
| `gigStartsOn` | the gig | Yes | |
| `slotPosition` | the slot | No | Default 1 |
| `memberEmail` | `gigSlotAttendance.memberId` | Yes | The email of a member of members.csv or of the installation |
| `answer` | `gigSlotAttendance.answer` | Yes | `YES`, `NO`, `MAYBE`, `IF_NEEDED` (Oui, Non, Peut-être, Si besoin) |

An answer is personal data: the file holds it only for the members of the band, and it is deleted with the zip.

### Allowed values

`allowed-values.csv` has three columns, `column`, `code`, `label`: one row per accepted value. The lists of the model (statuses, roles, moods, positions, answers) are written once in this document; the lists of the installation (instruments with their known spellings, sections, costumes, languages) are read from the installation when the templates are downloaded. A value that is not in the list is an error, with the line and what was expected.

### Checks

The end-to-end tests cover at least: a reprise into an empty installation gives the screens of the files; a reprise loaded twice changes nothing the second time; a member whose email exists is updated, not duplicated; a song whose name exists is updated, the files given replace those of the same kind and the others are kept; a reprise sends no notification; an unknown instrument, an unknown member in answers.csv and an unreadable part are refused with their file and line, and nothing is written; invitations leave only when the switch is on and the instance has a mail server; a member who is not admin cannot reach the reprise.

## Checks of the export and import

The end-to-end tests cover at least: an export then an import into an empty installation gives the same screens; an import twice changes nothing the second time; a file whose admin is not in it is refused; a missing reference is refused with its list; a file of a newer format is refused; a file altered after export is refused; a member who is not an admin cannot reach either action.
