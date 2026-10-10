# Business dictionary — Members domain

> v1.8 — 2026-10-11 · Model: `members.dbml` · Validated · Migration: `001_members.sql`

Examples in this document are made up. No real member appears in the repository.

## 1. Member (`member`, `memberRole`)

### Definition
A person who plays or has played in the band, and their account in the app: the two are the same object. In the French locale a member is a "fanfaron".

### Fields
| Field | Label (en) | Label (fr) | Required | Example | Realistic length | Rules |
|---|---|---|---|---|---|---|
| `nickname` | Nickname | Surnom | Yes | Jibé · Marilou la Tornade | 3 to 20 | The name shown everywhere. Unique in the band, compared without regard to case |
| `firstName` | First name | Prénom | Yes | Jean-Baptiste · Marie-Lou | 3 to 20 | |
| `lastName` | Last name | Nom | Yes | Morel-Dubois · Fontaine | 3 to 25 | |
| `email` | Email address | Adresse email | Yes | jb.morel@example.org | 15 to 40 | Unique. Stored in lowercase. Is the sign-in identifier |
| `mobilePhone` | Mobile phone | Téléphone mobile | No | +33612345678 | 12 | Stored in international format, displayed in the local format |
| `streetAddress` | Address | Adresse | No | 12 bis rue des Tanneurs | 10 to 60 | Can hold several lines |
| `postalCode` | Postal code | Code postal | No | 69007 | 5 to 10 | Free text: formats differ between countries |
| `city` | City | Ville | No | Lyon | 3 to 30 | |
| `countryCode` | Country | Pays | No | FR | 2 | Chosen in a list. Stored as a two-letter ISO code, displayed as a name in the member's language |
| `addressInstructions` | Access instructions | Instructions d'accès | No | Code 4812B, 3e étage gauche | 0 to 200 | Door code, floor, parking |
| `instrumentId` | Instrument | Instrument | Yes | Sax Ténor | — | One instrument per member. Gives the section |
| `passwordHash` | Password | Mot de passe | When ACTIVE or POWER_MEMBER | — | — | Never displayed, never sent to the front. The password has 10 characters at least and no composition rule. Two technical limits: 72 bytes at most (what the hashing keeps), and no NUL character |
| `status` | Status | Statut | Yes | ACTIVE | — | See life cycle |
| `language` | Language | Langue | Yes | fr | 2 to 5 | Set from the band's default language at creation |
| `colorScheme` | Appearance | Apparence | Yes | AUTO | — | Automatic (follows the device), light or dark |
| `accentTheme` | Theme | Thème | No | copper | — | One of the accent themes of the design system. Empty: the default theme of the band |
| `textSizePercent` | Text size | Taille de police | Yes | 125 | — | Accessibility option. From 100 to 200 |
| `hasHighContrast` | High contrast | Contraste élevé | Yes | false | — | Accessibility option |
| `hasIncreasedSpacing` | Increased spacing | Espacement augmenté | Yes | false | — | Accessibility option |
| `hasLegibleFont` | More legible font | Police plus lisible | Yes | false | — | Accessibility option |
| `hasReducedMotion` | Reduced motion | Mouvement réduit | Yes | false | — | Accessibility option |
| `hasExtendedTimeouts` | Extended timeouts | Délais augmentés | Yes | false | — | Accessibility option |

`failedSignInCount` and `signInLockedUntil` are never displayed.

### Life cycle
| Status | Meaning | Goes to | Trigger | Effects |
|---|---|---|---|---|
| `INVITED` | Created by a member manager, no password yet | `ACTIVE` | The member opens their password link and chooses a password | Can sign in |
| `INVITED` | | deleted | A member manager cancels the invitation | The row is deleted: nothing refers to it yet |
| `ACTIVE` | Plays regularly, can sign in | `POWER_MEMBER` | A member manager sets it by hand | Nothing is erased; roles, sessions and password are kept. The member is no longer reminded to answer for gigs |
| `POWER_MEMBER` | Was active and plays less: comes to help out on some gigs. Can sign in, answers for gigs, counts in whether a gig is playable | `ACTIVE` | A member manager sets it by hand | Reminders resume |
| `ACTIVE`, `POWER_MEMBER` | | `LEFT` | A member manager marks the member as gone | All sessions and the pending password link are deleted at once. `mobilePhone`, the five address fields and the roles are erased. Names, nickname, email and instrument are kept |
| `LEFT` | Has left the band | `INVITED` | A member manager brings the member back | A new password link is created; the old password is not reused |

The status labels in French are "Invité", "Actif", "Power member" and "Parti". No status changes by itself: `POWER_MEMBER` in particular is never deduced from how often a member answers or plays.

In every rule below, **a current member** is a member whose status is `ACTIVE` or `POWER_MEMBER`. The two differ on one point only, reminders, which belongs to the Gigs domain.

A member is never deleted once `ACTIVE`: their answers to past gigs stay. The email of a member who left is kept so that they can be invited again.

### Rules
- **Install.** Installing the app is only possible while the `member` table is empty. A first screen presents the steps, lets the person choose the language (Band domain, `band.md`) and asks for the install key (below). It then goes in three steps:
  1. name the band and, if wanted, give its logo (Band domain, `band.md`);
  2. choose the sections and instruments of the band from the starting library (entry 2), which can be adjusted and extended on the spot. The instruments the library marks as preselected are ticked when the step opens. At least one instrument has to be kept: the first member needs one;
  3. create the first member: email, password, last name, first name, nickname and instrument, chosen among the instruments kept at step 2. This member is `ACTIVE` and holds the `ADMIN` role.

  Nothing is saved before the last step is confirmed: an install that is abandoned leaves an empty database. Confirming the last step signs the first member in on the device used, as a sign-in would.

  Install also asks for the **install key**: a text written in the configuration of the server by the person who set the app up. Without it, whoever reached a new instance first could make themself its admin.

  The key is asked on the first screen and checked at once, before the three steps: nobody fills them in to learn at the end that the key is wrong. The first screen cannot be left without the right key. The key is checked again when the last step is confirmed: that second check is the one that protects the instance, the first one is a comfort. A wrong key gets its own answer, unlike a wrong password at sign-in: there is no member yet whose existence could leak.
- **Always one admin.** The last current member holding `ADMIN` can neither lose that role nor become `LEFT`.
- **Sign-in.** Email and password, for current members only (`ACTIVE` and `POWER_MEMBER`). Every refusal gets the same answer, in the same time: wrong email, wrong password, member who cannot sign in, sign-in locked. The screen therefore says both things at once: wrong email or password, and wait a while after several tries. Signing in again on a device replaces its session.
- **Wrong passwords.** After 5 wrong passwords in a row, sign-in for this member is refused for 15 minutes (`signInLockedUntil`), right password included. A successful sign-in resets the count. Sessions already open are not affected. Known limit: someone who knows a member's email can keep that member from signing in on a new device by failing on purpose; the app stores no IP address, so it does not limit tries per visitor.
- **Password change.** Deletes every other session of the member.

### Roles and permissions
A member holds zero, one or several roles. The list of roles is fixed by the app.

A role is a named set of **permissions**. The code never asks "is this member a gig manager?" but "may this member edit a gig?": each action checks one permission, and a single table in the code says which roles grant it. Changing what a role allows, or adding a role, is then a change in one place.

| Permission | Granted by |
|---|---|
| View members, sections and instruments; edit one's own record | Every current member |
| Manage members (create, edit, change status including `POWER_MEMBER`, create a password link) | `MEMBER_MANAGER`, `ADMIN` |
| Manage roles | `ADMIN` |
| Manage sections and instruments | `ADMIN` |
| Manage band settings | `ADMIN` |
| Manage songs | `SONG_MANAGER`, `ADMIN` |
| Manage gigs | `GIG_MANAGER`, `ADMIN` |
| Manage setlists (later feature) | `SETLIST_MANAGER`, `ADMIN` |
| Manage quotes (later feature) | `QUOTE_MANAGER`, `ADMIN` |

The permissions of the other domains are detailed in their own dictionaries. There is no table of permissions in the database: bands do not define their own roles. If that need appears, the checks in the code stay as they are and only the source of the table changes.

### Relations
- Instrument: a member plays exactly one instrument; an instrument is played by any number of members. No history kept: changing instrument replaces the value.
- Role: a member holds zero to several roles (`memberRole`). No history kept.
- Session: a member has zero to several sessions, one per signed-in device.
- Password link: a member has zero or one pending link.

### Access rights
| Who | View | Create | Edit | Change status |
|---|---|---|---|---|
| Any signed-in member | Every field of current members (`ACTIVE` and `POWER_MEMBER`) except those about the password and the preferences: the member list is the directory of the band | No | Their own record, except roles and status | No |
| `MEMBER_MANAGER` | The same, plus `INVITED` and `LEFT` members | Yes | Any record, except roles | Yes |
| `ADMIN` | The same | Yes | Any record, and roles | Yes |

Exporting the list of members asks for the password again.

### Instance settings
- Default language of new members (`band.defaultLanguage`).
- Default accent theme (Band domain).
- Session durations, the number of wrong passwords tolerated and the validity of a password link are fixed in the code for now, with the defaults written in the model.

### Personal data
- `nickname`, `firstName`, `lastName`: identification. Seen by every signed-in member.
- `email`: sign-in and directory of the band. Seen by every signed-in member.
- `mobilePhone`, `streetAddress`, `postalCode`, `city`, `countryCode`, `addressInstructions`: directory of the band, so that members can reach and visit each other. Given by the member, optional, seen by every signed-in member, erased when the member leaves.
- Preferences (language, appearance, theme, accessibility options) are seen by the member only. Accessibility options can hint at a disability: they are never shown to anyone else, an admin included, and never appear in an export.
- None of these fields is ever written to a log.

### Display
- The nickname is the name shown in every representation. First and last names appear on the member's own screen and in the directory.
- Missing phone or address: the line is not shown.
- Representations in the design library: none exists yet. Expected: mention, row, header.

### Accessibility options
The default design is not required to reach the highest level of the accessibility guidelines (WCAG AAA). The options below must let a member bring the app to level AA at least, and to AAA wherever that is feasible.

| Option | Values | What it does | Text shown under the option (fr) |
|---|---|---|---|
| High contrast | Off, on | Stronger contrast between text and background; translucent surfaces and coloured halos become plain and opaque | Renforce le contraste entre le texte et le fond. Utile en cas de basse vision, de fatigue visuelle ou de forte luminosité ambiante. |
| Text size | 100 % to 200 % | Enlarges all text without breaking the layout. An installed app has no zoom control, so this is the only way to get bigger text | Agrandit tous les textes sans modifier la mise en page. |
| Increased spacing | Off, on | More space between letters, between words and between lines | Aère le texte : espace entre les lettres, entre les mots et entre les lignes. |
| More legible font | Off, on | Replaces the typefaces of the app with one designed to tell similar characters apart (I / l / 1, O / 0). Atkinson Hyperlegible is the reference; the choice belongs to the design | Distingue plus nettement les caractères qui se ressemblent (I / l / 1, O / 0). |
| Reduced motion | Off, on | Removes animations and transitions of large amplitude | Supprime les animations et les transitions de grande amplitude. Utile en cas de troubles vestibulaires, de migraines ou de sensibilité au mouvement. |
| Extended timeouts | Off, on | Notifications and tooltips stay on screen until the member closes them | Les notifications et les infobulles restent affichées jusqu'à ce que tu les fermes. |

- The list and the wording come from another project of the owner, adapted to the "tu" used in this app.
- High contrast and reduced motion are also applied when the device asks for them, without the member having to set anything.
- Text size is offered as a slider with a few steps; the steps are chosen by the design, within 100 to 200 %.
- The exact visual effect of each option is defined by the design (`brass-band-design` skill). Every screen must hold with all six options on.

## 2. Section and instrument (`section`, `instrument`)

### Definition
An instrument is what a member plays. A section groups the instruments that play the same kind of part; in the French locale a section is a "pupitre". Each band organises its sections its own way, because it follows how its arrangements are written.

### Fields
| Field | Label (en) | Label (fr) | Required | Example | Realistic length | Rules |
|---|---|---|---|---|---|---|
| `section.name` | Section | Pupitre | Yes | P'tites basses | 5 to 15 | Unique. In the band's own words, never translated |
| `section.position` | Order | Ordre | Yes | 4 | — | Order of the sections in every list |
| `instrument.name` | Instrument | Instrument | Yes | Trombone Sib | 5 to 15 | Unique across the band. Never translated |
| `instrument.sectionId` | Section | Pupitre | Yes | Trombone | — | An instrument belongs to exactly one section |
| `instrument.position` | Order | Ordre | Yes | 2 | — | Order inside the section |

### Starting library
The app ships with a starting library of sections and instruments, one per interface language. At install, the band picks what it plays from it, renames and regroups as it wishes, and adds what is missing. The chosen rows are copied into `section` and `instrument`; from then on they belong to the band, and the library is not consulted again.

The library is a file of the app, not a table. French library:

| Section | Instruments |
|---|---|
| Trompette | Trompette |
| Saxophone | Sax Alto, Sax Ténor, Sax Baryton (not preselected), Sax C Melody |
| Trombone | Trombone Ut, Trombone Sib |
| P’tites basses | P’tite basse (tubas, euphoniums and the like) |
| Souba | Souba (sousaphone) |
| Percu | Batterie, Percus |
| Flûte | Flûte, Piccolo |
| Clarinette | Clarinette |

The first six lines are the organisation of the band that started the project. Their instruments are the ones preselected at install, except the Sax Baryton: a band unticks what it does not play and ticks the rest. Each library says, instrument by instrument, which ones are preselected.

### Rules
- A section with instruments cannot be deleted. An instrument played by a member, or used by a part of a song, cannot be deleted. Both can be renamed and moved.
- Moving an instrument to another section moves its members with it: the section of a member is always the one of their instrument.
- After install, an admin can add sections and instruments at any time.

### Relations
- A section holds one to several instruments; an instrument belongs to one section.
- Parts of songs refer to an instrument (Songs domain). The known spellings of an instrument in score files (`instrumentAlias` in the overview model) are detailed with the Songs domain.
- **A section is present at a gig slot as soon as one of its members is.** How this makes a slot playable is detailed with the Gigs domain; it is the reason why sections are an object and not a label.

### Access rights
| Who | View | Create | Edit | Delete |
|---|---|---|---|---|
| Any signed-in member | Yes | No | No | No |
| `ADMIN` | Yes | Yes | Yes | When unused |

### Display
- Sections are listed in the order of `position`, instruments in the order of their own `position` inside their section. Equal positions are ordered by name.
- Where one instrument is chosen (the instrument of a member), instruments are listed flat, in that same order. Sections are not shown as group titles: many hold a single instrument, and the section follows from the instrument.
- Representations in the design library: `Instrument/Row` (listed with its actions, to tick, or the one chosen in a list) and `Section/Card` (a section with its instruments, to pick and to manage them). Expected: mention (the instrument beside a member's nickname).

## 3. Session and password link (`memberSession`, `memberPasswordLink`)

### Definition
A session is a device on which a member is signed in. A password link is a single-use address that lets a member choose a password: it serves for the invitation of a new member and for a forgotten password.

### Rules
- The device holds a random token in a cookie that page code cannot read and that is sent over HTTPS only. The database holds only the SHA-256 of the token, so that a copy of the database does not let anyone sign in.
- A session ends when it has not been used for 90 days, or one year after sign-in, whichever comes first.
- A member can sign out the current device, or all their devices at once.
- **The member manager sends the link himself.** The app shows the link once, when it is created; the member manager copies it and sends it by the means of his choice. The app sends no email for now. Sending it by email from the app is expected later: the model does not change, only the way the link travels.
- A password link is valid 7 days and once. Creating a new one for the same member cancels the previous one.
- Using a password link sets the password, moves an `INVITED` member to `ACTIVE`, deletes the link and every existing session of the member, and signs the member in.

### Access rights
| Who | View | Create | Delete |
|---|---|---|---|
| A member | Nothing is listed | A session, by signing in | Their own sessions, by signing out |
| `MEMBER_MANAGER`, `ADMIN` | Whether a link is pending for a member; the link itself only at the moment it is created | A password link for any member | A pending link; all sessions of a member, by marking them `LEFT` |

### Personal data
- No IP address and no device name is stored.

## 4. Storage conventions

These apply to every table of the app and are not repeated in the DBML.

- Every table carries `createdAt`, `updatedAt` and `updatedByMemberId` (the member who made the last change; empty when the app did it by itself, at install for instance). This is a technical trace, not business history: no screen shows it.
- Instants are stored in UTC, in `DATETIME` columns. `TIMESTAMP` is not used: in MySQL it stops in January 2038.
- Text is compared without regard to case or accents (`utf8mb4_unicode_ci`): "Jibé" and "jibe" are the same nickname.

## 5. Open questions

None blocking.

To confirm:

- Wrong install keys are not counted: no member exists yet to carry a count, and the app stores no IP address. Instead, the key must be 16 characters at least (a shorter one counts as no key, and install stays closed), and a wrong key is answered after one second. With a long random text, as the configuration file asks, guessing leads nowhere.
- A server whose install key is still empty answers like a wrong key. Default: keep one answer; the screen sends the person to the configuration of the server in both cases.

Noted for later domains:

- How presence per section makes a gig slot playable: Gigs domain. `POWER_MEMBER` members count in it like `ACTIVE` ones.
- Reminders to answer for a gig are sent to `ACTIVE` members only, never to `POWER_MEMBER` ones: Gigs domain.
- Push subscriptions (`pushSubscription` in the overview model): later.
- The default accent theme of the band: Band domain. The list of accent themes: design system.
