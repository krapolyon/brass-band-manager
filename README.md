# brass-band-manager
An internal tool for brass bands / marching bands : members, tunes, gigs and setlist

An installable web app (PWA) that a band hosts for itself: one band, one instance, under its own name, logo and colours.

The project is at its very beginning: this repository holds the technical base, not a usable app yet.

## Running it locally

You need [Node](https://nodejs.org) 22.12 or later and [Docker Desktop](https://www.docker.com/products/docker-desktop/), started.

```sh
npm run setup
```

This installs everything, starts a local stack in Docker (Apache with PHP, and MySQL) and leaves the app running at http://localhost:8080. It can be run again at any time.

| To | Run |
|---|---|
| Work on the front, with live reload | `npm run dev`, then http://localhost:5173 |
| Run the end-to-end tests | `npm test` |
| Check the code | `npm run check` |
| Stop the stack | `npm run stack:down` |

## Installing it on a host

Deployment is described in `docs/architecture.md`, "Deployment". One thing is worth knowing from the start. When the app is first opened it asks for an **install key**: a text of your choice, 16 characters at least, that you write beforehand in `config.php` on the server, next to the database password. It is what stops a stranger from installing your instance, and becoming its admin, before you do. It is used once.

Each instance also needs an **encryption key**. It encrypts the names, email addresses, phone numbers and addresses of the members in the database. Write it in `config.php` before the install, or, for an instance installed earlier, before the database update of version 0.3.1: that update encrypts the members already there, and refuses to run without a key.

1. **Make it on your computer**, from this folder:

   ```sh
   npm run encryption:key
   ```

   It prints one line, such as `'encryptionKey' => 'q3J…=',` (44 characters between the quotes). A new key at each run: make one for beta and another for production.
2. **Paste that line into `config.php` on the server**, in the data folder beside the deployed folder (`<folder>-data/config.php`), next to the install key, in place of the line `'encryptionKey' => '',` if there is one. Save it, and upload it again with your FTP client.
3. **Keep a copy of the line in a password manager**, one entry per instance (for instance "Brass band — beta — encryption key"), apart from the backups of the database. A backup of the database without its key cannot be read by anyone, the band included.
4. **Then** run the install, or the database update (Band settings, "Mise à jour de la base").

Never change the key, or remove it, once the app holds members: the app could no longer read them, and their screens would answer an error (`encryptionKeyWrong` on the server) instead of something wrong. If `config.php` is lost, write it again with the copy of step 3. Never commit the key, never send it by email, never paste it into a chat or an issue.

What it protects: a copy of the database that leaks (a backup, an export). What it does not protect against: someone who can read the files of the server, since the key is written there.

The app keeps the files it is given (the logo of the band, later the songs) in a `storage` folder next to `api`. It has to be writable by PHP, kept out of what the web server serves, and backed up with the database.

## Songs: what the app reads in a MuseScore file

A song is imported by dropping its files together. The MuseScore file (`.mscz`) is the source of the score: the browser of whoever imports the song reads it, and produces from it the MIDI file the MIDI player plays and the score the reading mode shows. Nothing has to be exported from MuseScore by hand.

**The name of a staff decides which instrument a track is.** In the MIDI player each track is given to an instrument of the band by the name written on its staff in MuseScore (the "long instrument name", the one printed at the start of the first line), not by the sound chosen to play it. So a staff named `Basse` that plays with the sound of a euphonium is the track of the instrument the band calls "P’tite basse".

The name is read the way the names of PDF files are:

- it is cut into words, in lowercase and without accents;
- each instrument is known by its own name and by its **known spellings** (in the app: Settings, Band settings, "Orthographes connues"), for instance `tp` and `trumpet` for the trumpet;
- a spelling matches when all its words are in the name, and the spelling with the most words wins: `trombone` alone is one instrument, `trombone ut` another.

A track whose name matches no instrument, or two, is still shown and played, under the name it has in the file. To have it recognised, either add its name to the known spellings of the instrument, or rename the staff in MuseScore and drop the file on the song again.

A name cannot always tell: a staff named `Tuba` goes to the instrument that has the spelling `tuba`, whoever plays it. When two instruments share the same kind of staff, name each staff after its instrument of the band.

**Rehearsal marks become the sections of the song.** A rehearsal mark of MuseScore (Add, Text, Rehearsal mark, or Ctrl+M on a note; its text can be anything, "Refrain" as well as "A") is offered by the MIDI player as a range to play again and again, from the mark to the next one. Staff text and system text are not read as marks. The Live mode, which shows the part of each member rising at the tempo, offers the same marks to choose where to start.

A file saved by MuseScore 4.4 is read through its full score alone: the styles and the separate parts kept in the file are not needed for the MIDI file or the score, and are left aside.

If the app cannot read a MuseScore file (one saved by a version of MuseScore more recent than its engine, for instance), it says so and keeps the file. Export a MIDI file and a MusicXML file from MuseScore and drop them on the song: they are then used instead.

## Documentation

| Document | What it tells |
|---|---|
| [docs/architecture.md](docs/architecture.md) | How the app is built, how to add a route, a screen, a text or a migration, and why each dependency is there |
| [docs/scoping.md](docs/scoping.md) | What the app is for, the decisions taken and the build order |
| [CLAUDE.md](CLAUDE.md) | The rules followed when writing code, for people and for AI assistants |
| [model/](model/) | The data model |

## Stack

React and TypeScript built with Vite for the front; PHP with Slim, Doctrine DBAL and Valinor for the API; MySQL; Playwright for the tests. It is meant to run on plain shared hosting, with no build step and no permanent process on the host.

## Licence

GNU Affero General Public License v3. See [LICENSE](LICENSE).
