# Changelog

What changes in the app, version after version. This file is written by
`npm run changelog` from `web/src/changelog/en.json`: do not edit it by hand.

## 0.2.0 — 2026-10-16

### Added

- New types of notifications in a new settings screen: playable and confirmed gigs, the live setlist, new songs, new MuseScore files, new parts for your instrument.
- Calendar sync of your gigs.
- In a setlist, add songs from the list of every song; dots show how often a song is already played at the gig.
- The Live mode can follow the MIDI player: the score scrolls with the music.

### Changed

- In a setlist, swipe a song to the left to remove it.
- The phone that moves the live setlist no longer receives a next song notification.

### Fixed

- The waveform of a recording shows its quiet and loud parts again.
- On iPhone, no more dark band at the top of the installed app.

## 0.1.1 — 2026-10-16

### Changed

- The app now shows this changelog.
- The text size adjustment is now a per-device setting.
- A gig confirmed by mistake can go back to Accepted or Proposal.
- The address of a gig and the description of a setlist fit on several lines.

### Fixed

- The end date of a gig can be removed.
- When adding a song to a setlist, the suggestions no longer hide under the keyboard.
- On iPhone, the MIDI player no longer stays silent when you come back to the app.

## 0.1.0 — 2026-10-13 — the first beta

### Added

- The first beta: the members of the band, the songs with their recordings, MIDI files, scores and reading mode, the gigs with the answers of everyone, and the setlists.
