# Business dictionary — Songs domain

> v1.3 — 2026-10-13 · The reading mode ("Live") and the rehearsal marks, settled with the owner while they were built: only real rehearsal marks count; the part of the member's instrument; repeats and voltas followed, jumps in words not; the tempo of the band, else the one of the score, or tapped. No change to the schema
> v1.2 — 2026-10-13 · Validated by the owner on 2026-10-13 · The MIDI file and the MusicXML of a song are produced from its MuseScore file by the browser that imports it (`song.musicXmlPath`); an instrument chosen by hand during an import can be remembered as an alias; the aliases are managed in the band settings by whoever manages songs; the tracks of the MIDI player are read with the same aliases · Migration: `007_songMusicXml.sql`
> v1.1 — 2026-10-12 · Model: `songs.dbml` · Rules settled with the design of the screens, no change to the schema. Validated by the owner on 2026-10-12 for what the simple version of songs uses (last file wins, files changed by dropping, download everything, peaks computed once by the browser, deletion asks first); the two rules about the tempo and the rehearsal marks wait for the MIDI player and the reading mode · Migrations: `006_songs.sql`
> v1.0 — 2026-10-12 · Validated

The songs named in this document are well-known ones, taken as examples: they are not the repertoire of a band. The names of members are made up.

## 1. Song (`song`)

### Definition
A piece the band plays, is learning or considers learning. Every song is a cover: it has an original title, an original artist and the cover art of the original. In the French locale a song is a "morceau".

### Fields
| Field | Label (en) | Label (fr) | Required | Example | Realistic length | Rules |
|---|---|---|---|---|---|---|
| `name` | Internal name | Nom interne | Yes | Crazy · Seven Nation | 3 to 30 | The name the band gives to the song, shown everywhere. Unique, compared without regard to case or accents. Never translated |
| `originalTitle` | Original title | Titre original | Yes | Crazy in Love · Seven Nation Army | 3 to 60 | Never translated |
| `originalArtist` | Original artist | Interprète original | Yes | Beyoncé feat. Jay-Z · The White Stripes | 3 to 50 | Free text: one field, even for several artists. Never translated |
| `bpm` | Tempo (bpm) | Tempo (bpm) | No | 104 | 2 to 3 digits | A whole number from 20 to 400. Filled only when the band plays at another tempo than the one of the MuseScore file. Empty: the tempo of the file |
| `status` | Status | Statut | Yes | IN_REPERTOIRE | — | See life cycle |
| `versionOn` | Last update | Dernière mise à jour | No | 2026-09-14 | — | The day the arrangement last changed. Typed by hand, never in the future |
| `versionNote` | Version note | Note de version | No | Nouveau pont avant le dernier refrain, la fin est doublée | 0 to 300 | Can hold several lines |
| `clipUrl` | Video clip | Clip | No | https://www.youtube.com/watch?v=… | 30 to 100 | The address of a YouTube video. Played inside the app. See "Clip" |
| `clipThumbnailPath` | Clip thumbnail | Vignette du clip | No | — | — | Never typed: fetched by the server. See "Clip" |
| `discordChannelId` | Discord channel | Salon Discord | No | 1203984756120394875 | 17 to 20 digits | Digits only. Unique: one channel per song |
| `coverPath` | Cover art | Jaquette | No | — | — | An image file: JPEG, PNG or WebP, square. See "Files" |
| `museScorePath` | MuseScore file | Fichier MuseScore | No | — | — | A `.mscz` file. See "Files" |
| `midiPath` | MIDI file | Fichier MIDI | No | — | — | A `.mid` or `.midi` file. See "Files" |
| `audioPath` | Recording | Enregistrement | No | — | — | The song played by the band: an mp3 or m4a file. See "Files" |

### Life cycle
| Status | Meaning | Goes to | Trigger | Effects |
|---|---|---|---|---|
| `PROPOSED` | Proposed for the repertoire, not started. The status of a new song | Any other | Whoever manages songs sets it by hand | None |
| `IN_PROGRESS` | Being arranged and learned | Any other | By hand | None |
| `IN_REPERTOIRE` | Played by the band | Any other | By hand | None |
| `TEMPORARY` | Learned for one occasion and playable, not meant to stay in the repertoire | Any other | By hand | None |
| `ABANDONED` | No longer played, or given up before it was ready | Any other | By hand | Nothing is erased: record, files and levels are kept |

The status labels in French are "Proposé", "Montage en cours", "Au répertoire", "Temporaire" and "Abandonné". A song has one status at a time: a temporary song is not also "in progress". No status changes by itself, and every status can follow every other: a song given up can be taken up again.

### Files
- **Stored as files, not in the database**, under a name chosen by the app, never the name of the uploaded file. The database holds the path: a file is not found by a name built from the name of the song, so renaming a song touches no file. A backup is the database and the storage folder together.
- **One file of each kind per song at most.** Sending a new one replaces the old one, which is deleted. Every file can also be removed.
- **None is required.** A song that is only proposed has no file yet.
- **Never public.** Every file is served to signed-in members only, through the API.
- **What a file is is decided from its content**, and its extension has to agree.
- **Cover art.** JPEG, PNG or WebP, no SVG. Always square: the browser crops the image to a centred square and reduces it to 1024 pixels a side before sending it, as for the photo of a member, and the server accepts a square image of that size at most.
- **Recording.** A recording of the band itself, not the original: mp3 or m4a.
- **Size limits** (decided on 2026-10-12): 10 MB for the MuseScore file and for the recording, 5 MB for a part, 1 MB for the MIDI file, 10 MB for the MusicXML file, 2 MB for the cover art once reduced.
- **Downloading.** A file is offered under a readable name built by the app from the name of the song, and the instrument for a part.
- **Downloading everything.** From the list of songs, a member downloads in one `.zip` archive the parts of their own instrument, every recording, every MIDI file or every MuseScore file, for the songs the list shows (search and filters included). The server builds the archive on demand; nothing is stored.
- **The waveform of a recording.** The MP3 mode draws the recording as bars the member touches or drags. Its peaks are computed once per recording, not each time it is played: by the browser that sends the recording, and kept in a small file beside it, which goes when the recording goes.
- **Generated files.** The MuseScore file is the source of the score. When one is sent, the browser of whoever sends it produces two files from it and sends them with it: the MIDI file, whose tracks are named after the staves of the score, and the score as MusicXML, which the reading mode shows. Both replace the ones in place. MuseScore cannot run on the host, so nothing is converted there.
- **Rehearsal marks.** The rehearsal marks of the MuseScore file ("Repère", added with Ctrl+M) are offered by the MIDI player to choose the range it plays again (they are written in the MIDI file the app produces, each at the measure it is played at), and by the reading mode to choose where to start (it reads them in the score). A staff text or a system text is not a mark: it can say anything (owner, 2026-10-13).
- **The reading mode ("Live")** shows the part of the member's instrument, found by the name of its staff as a track is (entry 2, "Reading the name of a track"); any other part is one tap away. The score rises line by line at the tempo: the one of the band (`bpm`), else the one written in the score, or the one the member taps. Repeats and voltas are followed, and bring the score back down; a jump written in words (D.S., D.C., to the coda) is not, and the member drags the score there (owner, 2026-10-13). Nothing about it is saved.
- **When the conversion fails**, the MuseScore file is kept and the import says that the MIDI player and the reading mode have nothing for this song. A `.mid` or a MusicXML file exported by hand from MuseScore and dropped with the others is then used: a file dropped by hand counts only when the MuseScore file gave none. Without one, the MIDI file and the MusicXML the song had from an earlier MuseScore file are removed: they are no longer those of its score.

### Import
Whoever manages songs drops the files of a song together, in any number and any order, and the app puts each one in its place.

| The file is | It becomes |
|---|---|
| A JPEG, PNG or WebP image | The cover art |
| A `.mscz` file | The MuseScore file |
| A `.mid` or `.midi` file | The MIDI file, when the MuseScore file gives none |
| A `.musicxml` or `.mxl` file | The MusicXML file, when the MuseScore file gives none |
| An mp3 or m4a file | The recording |
| A PDF | The part of the instrument its name tells (entry 2, "Reading the name of a file") |

A NoteWorthy file (`.nwc`), which the earlier app kept, is no longer one of them: every song has a MuseScore file.

- **Nothing is saved before it is shown.** The app shows where each file goes, and whoever manages songs corrects or confirms. A PDF whose name tells no instrument, or two instruments, is shown without one and is given one by hand.
- **Two files for the same place** (two images, two PDFs of one instrument) ask nothing: the last one dropped wins. The case is rare, and a question would cost more than it saves.
- **A file of another kind is refused**, with its name and the reason. The other files are kept.
- **A file that takes the place of an existing one is announced** before it replaces it.
- **The files of an existing song are changed the same way.** There is no field per part: files dropped on a song take the place of the file of the same role, by the rules above, and the rest stays. The files about to be replaced are listed, each can be withdrawn, and nothing changes before the form is saved.
- This is what the import of the earlier app of the band did. Two things differ: a file is no longer renamed after the song, and it is no longer found by its name but by the path the database holds.

### Clip
- **YouTube only, for now.** The address has to be the one of a YouTube video, in one of the forms YouTube gives (`youtube.com/watch?v=…`, `youtu.be/…`); any other address is refused. It is stored as typed, and the app reads the identifier of the video from it.
- **The clip is played inside the app**, on the sheet of the song, which shows the thumbnail of the clip with a play button.
- **Nothing is loaded from the video site before the member asks to play.** The player of the site is loaded when the member presses the button, in the mode of YouTube that sets no cookie before playing. Opening a song therefore reports nobody to the video site.
- **The thumbnail is kept by the app** (`clipThumbnailPath`). When the address is saved, the server fetches the thumbnail of that video from the image server of YouTube, once, and stores it with the other files of the song; it is then served like them, to signed-in members only. A thumbnail shown straight from YouTube would report every member who opens the song. The server only ever asks that one image server, for an identifier it has checked: the address typed is never fetched.
- **The thumbnail follows the address**: fetched again when the address changes, deleted when it is removed. Nobody uploads it. When it cannot be fetched, the clip is saved all the same and the cover art stands in for the thumbnail.

### Rules
- **Two songs cannot have the same internal name.** Two songs can have the same original title: two arrangements of one original.
- **The tempo of the band wins.** Where a tempo is used (MIDI player, reading mode), it is `bpm` when filled, the tempo of the file otherwise.
- **A tempo counts the beat of the time signature**: the quarter note in 4/4, the dotted quarter in compound time (6/8, 12/8). A member who taps the tempo in compound time taps the eighth notes, and the app shows the tempo converted (186 to the eighth is 62 to the dotted quarter).
- **Rehearsal marks and time signature come from the MuseScore file**, through what the reading mode reads of it. The reading mode offers the marks (A, B, Coda…) as starting points only when the file has some.
- **The version is typed, not deduced.** Replacing a file does not change `versionOn`: whoever manages songs says when the arrangement really changed, and what changed. Only the current version is kept: there is no history of versions.
- **Deleting a song** is for a song created by mistake. It deletes its files, its parts and the levels members gave it. Once setlists exist, a song used by a setlist cannot be deleted.
- **Deleting always asks first**, says what goes with the song and that it cannot be undone, and offers to set the status to `ABANDONED` instead.

### Relations
- Part: a song has zero to several parts, one per instrument at most (entry 2).
- Member: a member gives a song a mastery level and an enjoyment level (entry 3).
- Setlists and rehearsals refer to songs (later features, overview model).

### Access rights
| Who | View | Create | Edit | Change status | Delete |
|---|---|---|---|---|---|
| Any signed-in member | Every field and every file, whatever the status, except `discordChannelId` | No | No | No | No |
| `SONG_MANAGER`, `ADMIN` | The same, and `discordChannelId` | Yes | Yes, files included | Yes | Yes |

### Instance settings
- The Discord server of the band (`band.discordServerId` in the overview model) comes with the Discord feature. Until then `discordChannelId` is stored and shown by no screen but the form of the song. A band without Discord leaves it empty.

### Personal data
- None. A song holds nothing about a person of the band.

### Display
- The internal name is the name shown in every representation. The original title and the original artist appear on the sheet of the song.
- Missing cover art: the placeholder of `Song/Tile` (the music icon on a plain square).
- Missing tempo, version, clip or file: the line is not shown.
- Representations in the design library (Figma, checked on 2026-10-12): `Song/Tile` (the cover, everywhere), `Song/Row` (the list; `Selected` beside the song on a desktop), `Song/Card` (the grid), `Song/Header` (Large over the cover on a phone, Compact on larger screens), `Song/Mention` (the mini-player), `Song/TableHeader` and `Song/TableRow` (the table of those who manage songs), `SongFile/Row` (a file placed by the import). Missing: none needed yet.

## 2. Part and alias (`songPart`, `instrumentAlias`)

### Definition
A part is the score of one instrument in a song, as a PDF already laid out; in the French locale a part is a "partition". An alias is a known spelling of an instrument in the names of files.

### Fields
| Field | Label (en) | Label (fr) | Required | Example | Realistic length | Rules |
|---|---|---|---|---|---|---|
| `songPart.instrumentId` | Instrument | Instrument | Yes | Sax Alto | — | One of the instruments of the band |
| `songPart.pdfPath` | Score | Partition | Yes | — | — | A PDF file. A part without its PDF does not exist |
| `instrumentAlias.alias` | Known spelling | Orthographe connue | Yes | sax mib · sxm · trombone | 2 to 25 | One or several words. Stored in lowercase, without accents. Unique across all instruments |

### Rules
- **One part per instrument and per song at most.** There is no second voice and no full score: a full score is printed from the MuseScore file. Sending a PDF for an instrument that already has one replaces it.
- **A member opens their own part first.** The part shown first is the one of the instrument of the member; every other part stays one tap away.
- **An instrument that has a part cannot be deleted** (Members domain, entry 2). Deleting an instrument deletes its aliases.

### Reading the name of a file
The earlier app of the band read file names with rules written in its code for the instruments of one band. Here the same rules are data, so that each band has its own.

- The name of the file is cut into words: lowercase, accents removed, everything that is not a letter or a digit is a separation. `Crazy_Sax-Mib.pdf` gives `crazy`, `sax`, `mib`, `pdf`.
- **An alias matches when all its words are in the name**, in any order, as whole words: `tb` is not found in `tbut`.
- **The alias with the most words wins.** `trombone` names the Trombone Sib and `trombone ut` the Trombone Ut: `Crazy trombone ut.pdf` is the Trombone Ut. This is how a default is written: the short alias goes to the instrument meant when nothing more is said.
- **The name of an instrument is always an alias of it**, without being written in the table.
- When the winning aliases name two instruments, or when no alias matches, the import asks (entry 1, "Import"). The instrument is then chosen by hand.
- **A choice made by hand can be remembered.** Beside the instrument chosen, a box "Remember this name for next time" ("Retenir ce nom pour la prochaine fois"), off by default. Ticked, the words of the name of the file that are not words of the name of the song become an alias of the instrument, saved with the song. When these words are already an alias of another instrument, or when none is left, nothing is added and the import says so.
- A word of the name of the song can match an alias: the import shows what it understood before saving, and is corrected there.

### Reading the name of a track
The MIDI player shows one line per track of the MIDI file.

- **A track is named after its staff.** A MuseScore file gives each part two names: the one printed on the staff (`Basse`, `Souba`) and the one of the sound chosen to play it (`Euphonium`, `Sousaphone`). A MIDI file exported by MuseScore carries the second. The MIDI file the app produces carries the first: the name the arranger wrote.
- **The name of a track is read as the name of a file is**: cut into words, matched against the same aliases, the alias with the most words wins.
- **The aliases are one list.** A spelling met only in tracks (`trumpet`, `drumset`) is added to the instrument like any other.
- **A track that is recognised is shown under the name of its instrument**, with the pictogram of its section. The tracks of the instrument of the member are the ones drawn as their own.
- **A track that is not recognised is still shown and played, under the name it has in the file.** It is nobody's own track. The same when its name tells two instruments.
- **Two tracks can be the same instrument**: both are shown, in the order of the file.
- **A name alone cannot always tell.** A staff named `Tuba` is the Souba in the starting library, whoever plays it: when it is the part of the P’tite basse, the staff is renamed in MuseScore (`Basse`) and the file sent again.
- Any signed-in member may ask which instrument a name of track is: the MIDI player needs it. The answer gives the instrument, never the list of the aliases.
- Nothing is saved: the tracks are read each time the file is opened, so adding an alias is enough to recognise a track of every song.

### Managing the aliases
- The aliases are listed in the band settings, one line per instrument in the order of the band ("Orthographes connues"). Whoever manages songs adds and deletes them there; a member who manages songs without being an admin sees this one entry of the band settings.
- **An alias is cleaned before it is saved**: lowercase, accents removed, words separated by one space. An alias with no letter and no digit is refused.
- **An alias names one instrument.** One that another instrument already has is refused, and the refusal names that instrument. The name of an instrument cannot be given as an alias to another one.

### Starting aliases
The starting library of sections and instruments (Members domain, entry 2) comes with the aliases of its instruments, copied at install with the instruments that are kept. French library, from the rules of the earlier app, and the names MuseScore gives to staves in English (owner, 2026-10-13):

| Instrument | Aliases |
|---|---|
| Trompette | `trompette`, `trompettes`, `tp`, `trumpet`, `cornet` |
| Sax Alto | `sax`, `saxo`, `saxophone`; each of the three with `alto` or `mib`; `sxm` |
| Sax Ténor | `sax`, `saxo` or `saxophone`, each with `tenor` or `sib`; `sxt` |
| Sax C Melody | `sax`, `saxo` or `saxophone`, each with `ut`, `melody` or `melodie`; `sxc` |
| Trombone Sib | `trombone`, `trombone sib`, `tb` |
| Trombone Ut | `trombone ut`, `tbut` |
| P’tite basse | `basse`, `basses`, `bs`, `french horn` |
| Souba | `souba`, `soubassophone`, `sb`, `sousaphone`, `tuba` |
| Batterie | `batterie`, `drumset` |
| Percus | `percu`, `percus`, `percussion`, `percussions`, `bongo` |

### Relations
- A part belongs to one song and to one instrument.
- An instrument has zero to several aliases; an alias names one instrument.

### Access rights
| Who | View | Create | Edit | Delete |
|---|---|---|---|---|
| Any signed-in member | Every part of every song | No | No | No |
| `SONG_MANAGER`, `ADMIN` | The same, and the list of the aliases | Parts and aliases | Parts. An alias is not edited: it is deleted and added again | Parts and aliases |

### Display
- Parts are listed in the order of sections and instruments (Members domain, entry 2).
- Representations in the design library: `SongPart/Row` (the part picker: available, shown, missing) and `SongPart/Track` (one instrument in the MIDI player: own or not, muted or not).

## 3. Levels of a member on a song (`memberSong`)

### Definition
What a member says of a song: how well they play it (mastery) and how much they like playing it (enjoyment, the "kif" in the French locale). The band reads them together to see which songs should leave the repertoire. They do not serve to prepare setlists.

### Fields
| Field | Label (en) | Label (fr) | Required | Example | Realistic length | Rules |
|---|---|---|---|---|---|---|
| `masteryLevel` | Mastery | Maîtrise | No | 4 | 1 digit | A whole number from 1 to 5. Empty: not said |
| `enjoymentLevel` | Enjoyment | Kif | No | 5 | 1 digit | A whole number from 1 to 5. Empty: not said |

### Rules
- **Each member sets their own levels, and nobody else does**, an admin included.
- **The two levels are independent**, and each can be emptied again.
- **A level is about the song as the member plays it today.** It is kept when the member changes instrument or when the arrangement changes: the member updates it.
- **The band sees averages, never a person.** For each song and each of the two levels: the average of the current members who answered, and how many answered. No screen and no answer of the API gives the level of a named member to anyone else.
- **Erased when the member leaves.** The purpose ends with the membership.

### Access rights
| Who | View | Set |
|---|---|---|
| A current member | Their own levels; for each song, the average and the number of answers of the band | Their own |
| `SONG_MANAGER`, `ADMIN` | The same: no role shows the level of a named member | Their own |

### Personal data
- `masteryLevel`, `enjoymentLevel`: what a member thinks of their own playing and of a song. Purpose: knowing which songs the band masters and enjoys least, to decide which ones leave the repertoire. Given by the member, optional, seen by the member only, shown to the others as an average, erased when the member leaves, never in an export, never written to a log.
- Known limit: with very few answers, an average tells a level. With one answer it is the level of whoever answered, whom nothing names.

## 4. Open questions

None blocking. Validated by the owner on 2026-10-12 (v1.0).

To settle while the feature is built:

- The app does not keep the name a file had on the device, by design ("Files"). The edit screen of Figma writes "Freed_tb_v3.pdf · remplace Freed_tb.pdf": the built screen says that the new file replaces the one in place, without naming it.
- The tempo of the MuseScore file is shown by Figma on the song and under the tempo field ("124"). The MIDI player and the reading mode read it; the screen of the song and the edit form do not yet, and show the tempo only when the band has its own.
- The gauge of parts of the management table counts against every instrument of the band, those nobody plays included (confirmed on 2026-10-12).
- The sound of the MIDI player comes from recorded samples of instruments, served by the app and never fetched from another site. The set of samples and its licence are validated with the dependency; it covers the instruments of a brass band, and another instrument is played with the nearest one.
- The MIDI file is produced by a MuseScore engine of 2023 (`webmscore`): to listen to on a few real songs. A file saved by a later MuseScore may one day not open: the files exported by hand are the way out.
- The titles written in the files of the band are not reliable ("Titre"): the record of a new song is prefilled from the name of the file.

- Whether the host lets the server fetch an image from another site: to check on the OVH plan. Without it, the cover art stands in for the thumbnail.
- The `.zip` of "Download everything": its size and the time to build it on the shared hosting, checked with the real repertoire.
- Offline: not a priority (scoping document). The screens show a message when the network is missing; whether the list of the last visit stays readable depends on what the front keeps.

- The screens of the domain are drawn in Figma, page `Songs` (2026-10-12).
- The aliases of the starting library are written here; the library file of the app (`api/resources/instrumentLibrary.fr.json`) receives them with the feature. An instance installed before has none: whoever manages songs adds them.

Decided by the owner on 2026-10-12: the five statuses and the meaning of `TEMPORARY`; the recording is one of the band, optional; one PDF per instrument, no full score; levels seen as averages only, to decide which songs leave the repertoire; only the current version is kept; the Discord channel is stored and not shown before the Discord feature; a song can be deleted; the cover art is cropped to a square of 1024 pixels; the clip is played inside the app, YouTube only for now, and its thumbnail is fetched and kept by the server; every song has a MuseScore file and NoteWorthy files are not kept; the rule that reads the name of a file and the starting aliases; an instrument chosen by hand during an import adds no alias by itself (changed in v1.2: it can be remembered).

Proposed with the design of the screens on 2026-10-12 (v1.1, to validate): two files for the same place, the last one wins; the files of a song are changed by dropping, never one field per part; download everything as a `.zip`; the peaks of a recording computed once; a tempo counts the beat of the time signature; rehearsal marks and time signature read from the MuseScore file; deleting asks first and offers `ABANDONED` instead.
