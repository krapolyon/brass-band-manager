# Changelog

What changes in the app, version after version. This file is written by
`npm run changelog` from `web/src/changelog/en.json`: do not edit it by hand.

## 1.0.0 — 2026-10-24

### Changed

- A new password has 15 characters at least, and can be neither among the most used passwords nor built from the email or the name of the band. A password chosen before still signs in.

### Fixed

- Security fixes following the pentest.
- On a computer, a click anywhere on the line of a member in “Manage members” opens their record, the “…” at its end included.
- The icon of the band shows again at the top of the emails.

## 0.4.0 — 2026-10-24

### Added

- The admin can export the data of the band, import an export, and load a band from spreadsheets (members, songs, gigs, answers), from the band settings. The browser then makes the MIDI file and the score of each MuseScore file loaded.
- An invitation leaves by email, and can be sent again from the record of the invited member.
- The setlist generator asks for a length, 45 minutes to start with, set by the admin.

### Changed

- Ten accent colours, four of them new; a colour chosen before moves to the one that replaces it.
- The emails of the app are drawn in the colours of the band.
- The length of a setlist is shown above its songs, and under its title when it is read.
- A new member starts in the dark scheme.

### Fixed

- The browser tab shows the icon of the band in Safari too.

## 0.3.2 — 2026-10-24

### Added

- In the list of songs of a setlist, the songs not played yet in the gig can be filtered, and by mood.
- A gig shows the messages of its Discord channel that tag the app.

### Changed

- A song shows the Discord messages that tag both the app and the section of the signed-in member; the tag of the app is taken out of the message.
- A song you have not rated yet says so, and a rating more than a year old asks whether you still agree.
- The steps to install the app on an iPhone follow Safari as it is today.
- The mood “Medium” is now called “Normal”.

### Fixed

- The Live mode draws the key signature of scores saved with MuseScore 4.

## 0.3.1 — 2026-10-23

### Added

- After sign-in, a phone offers once to put the app on its home screen, with the steps for that phone. It stays in the settings, under “Install the app”, while the app is not installed.

### Changed

- The names, email addresses, phone numbers and addresses of members are encrypted in the database.
- An “if needed” answer now counts for whether a gig can be played, and the gig names who it counts on.
- A song has a mood and the places of a set it can be played at, instead of its categories, and a copyright field. The setlist generator follows them.
- A band without Discord no longer sees it in the form of a song.

### Fixed

- The browser tab shows the icon of the band.

## 0.3.0 — 2026-10-18

### Added

- Discord: the songs and gigs open their channel, and the sheet of a song shows the latest messages that tag your section.
- Choose how each notification reaches you: by notification, by email, or both.
- The band can give the installed app an icon of its own.
- Songs now have a length and style and difficulty information, used by the new setlist generator.
- The MIDI player can loop over several rehearsal marks that follow each other.

### Changed

- The reminders to answer reach you by email when none of your devices receives notifications.

### Fixed

- An instrument hidden or left empty in the MuseScore file no longer shows in the MIDI player nor in the Live mode.

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
