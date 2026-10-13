# Export and import of the data — format 1

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
| `songs` | `song`, `songPart`, `memberSong` | cover, MuseScore, MIDI, MusicXML, recording, clip thumbnail, PDF parts | `settings`, `members` (for `memberSong`) |
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
| `gig` | `name` + `startsOn` |
| `gigSlot` | its gig + `position` |
| `setlist` | its gig + `number` |

A reference to a member is its email, to a song its name, to an instrument its name, and so on: `"memberEmail": "lulu@example.org"`, `"songName": "Seven Nation Army"`.

## What an import changes

- **Add or update, never delete.** A row of the file whose key exists on the server updates it; otherwise it is added. A row of the server that the file does not hold is kept. To remove something, remove it in the app.
- **Inside an imported row, its own lists are replaced**: the roles of a member, the parts of a song, the slots, organisers, costumes, answers and setlists of a gig. A gig of the file therefore arrives exactly as it was exported.
- **`band`** is overwritten, except the settings that only make sense on one host (none today; the Discord settings will be listed here when they exist).
- **A reference that cannot be found** (an answer from a member who is neither in the file nor on the server) makes the import refuse, with the list of what is missing. Nothing is imported in part.
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

The lists that belong to a row (slots, answers, organisers, the songs of a setlist in their order) are written inside it, as above, rather than as separate tables. The examples of this document are made up.

## Checks

The end-to-end tests cover at least: an export then an import into an empty installation gives the same screens; an import twice changes nothing the second time; a file whose admin is not in it is refused; a missing reference is refused with its list; a file of a newer format is refused; a file altered after export is refused; a member who is not an admin cannot reach either action.
