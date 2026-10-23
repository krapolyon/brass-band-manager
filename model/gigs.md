# Business dictionary — Gigs domain

> v1.10 — 2026-10-24 · Validated by the owner, for 0.3.2 · No change to the tables · A gig shows the messages of its Discord channel that tag the app (issue #45); the song picker of a setlist filters "Pas joués" and the moods (issue #52)
> v1.9 — 2026-10-23 · Validated by the owner, for 0.3.1 · No change to the tables · The setlist generator places songs by their possible positions and draws Chill songs near the start, Teuf near the end (issue #47, Songs v1.9)
> v1.8 — 2026-10-18 · Validated by the owner, for 0.3.1 · No change to the tables · An answer "if needed" counts for the playability of a slot, without being a yes (issue #37): the gig can be confirmed by the app thanks to it, and the screen names who is counted that way
> v1.7 — 2026-10-18 · Validated by the owner (0.3.0) · No change to the tables · The Discord channel of a gig is typed in its form and shown to every member as a link (issue #33); the length of a setlist and the setlist generator (issue #25)
> v1.6 — 2026-10-16 · No change to the tables · Milestone 0.2.0, with Members v1.21 (migration `013_notificationsAndCalendar.sql`): a gig that becomes playable or confirmed is notified, the live setlist follows the setting of each member and spares the device that moved it (issue #23); the setlist editor counts how often a song is played in the gig, adds songs from a list, and removes a song by a swipe (issue #20); the calendar feed of a member (issue #21)
> v1.5 — 2026-10-15 · No change to the tables · From the beta (milestone 0.1.1): a confirmed gig can be put back to `ACCEPTED` or `PROPOSED` by hand (#17); the end date can be removed (#16); the address and the description of a setlist are typed over several lines (#15)
> v1.4 — 2026-10-13 · Decided with the design of the home screen (Figma, page `Home`): `gig.proposedAt`, the instant a gig first reaches a status members see; a gig is new for 15 days after it; the gig of the day and the answers in place on the home screen · Migration: `012_gigProposedAt.sql`
> v1.3 — 2026-10-13 · Validated by the owner · The live setlist, decided with the design: a setlist belongs to a slot; the setlist manager starts it live, moves it on song by song and ends it; the members who said yes to the slot follow it by notification · Migration: `010_setlistLive.sql`
> v1.2 — 2026-10-13 · Decided with the design of gigs: a setlist is numbered within its gig (1, 2, 3…); only a song in the repertoire or a temporary one is added to a setlist · Migration: `009_setlistNumberPerGig.sql`
> v1.1 — 2026-10-13 · Rules found while writing the API (no schema change): a draft that has answers is not deleted; when the server holds a gig for over; when the app looks whether an accepted gig is playable; an organiser who left stays on a gig that is saved again
> v1.0 — 2026-10-13 · Model: `gigs.dbml` · Validated by the owner on 2026-10-13 · Migration: `008_gigs.sql`, with the reminders of the band (Band v1.6) and the push subscriptions (Members v1.17)
> v0.3 — 2026-10-13 · DRAFT, no question left · No field for the quote, `ACCEPTED` is set by hand; two automatic reminders, a number of days before the gig; a member who leaves stays organiser of the gigs already played; a gig not confirmed whose date has passed is to close; setlists are built with this domain, last
> v0.2 — 2026-10-13 · DRAFT · Model: `gigs.dbml` · No migration yet · Answers of the owner: a gig is confirmed by the app once accepted and playable, or forced by hand; a cancelled gig can be reopened; organisers edit their gig and answer for others; coordinates of the place; the costumes of the gig are the list a slot chooses from; costumes managed by the admin; a reminder button
> v0.1 — 2026-10-13 · DRAFT

The gigs and places named in this document are examples. The names of members are made up.

The date, the meeting time and the place are those of the gig, not of each slot, and a slot has no stops: the overview model (v0.7) and the scoping document were changed with this domain.

## 1. Gig (`gig`, `gigOrganizer`, `gigCostume`)

### Definition
A concert the band is asked to play, from the first contact to the day itself. In the French locale a gig is a "plan", and the members who organise it are its "brasseurs".

### Fields
| Field | Label (en) | Label (fr) | Required | Real example | Realistic length | Rules |
|---|---|---|---|---|---|---|
| `name` | Name | Nom du plan | Yes | Fête des Lumières | 10 to 40 characters | Not unique: the same gig comes back every year |
| `startsOn` | Start date | Date de début | Yes | 2026-12-04 | — | |
| `endsOn` | End date | Date de fin | No | 2026-12-06 | — | Never before `startsOn`. Empty for a gig of one day. Once filled, it is emptied with the clear button of the field: the date picker of a phone has no way to clear a date (#16) |
| `meetingTime` | Meeting time | Heure de rendez-vous | No | 18:30 | — | On the first day, on the clock of the place. One for the whole gig |
| `placeName` | Place | Lieu | No | Place des Terreaux | 10 to 40 characters | |
| `placeUrl` | Link to the place | Lien du lieu | No | The site of the venue | Up to 500 characters | An `https` address |
| `streetAddress` | Address | Adresse | No | 12 rue des Capucins, derrière la grille verte | 1 to 3 lines | Typed in a text area that shows two lines and grows with its text; the line breaks are kept when it is shown |
| `postalCode` | Postal code | Code postal | No | 69001 | 5 characters | Can be filled without the street |
| `city` | City | Ville | No | Lyon | Up to 30 characters | Can be filled without the street |
| `latitude`, `longitude` | GPS coordinates | Coordonnées GPS | No | 45.767300, 4.834400 | 6 decimals | Both or neither. Typed or pasted as one text, "45.7673, 4.8344". Latitude from -90 to 90, longitude from -180 to 180 |
| `notes` | Information | Infos diverses | No | Parking behind the town hall, meal provided | A few lines | Free text |
| `discordChannelId` | Discord channel | Salon Discord | No | 1203984756120394875 | 17 to 20 digits | Digits only. Unique: one channel per gig. Typed as the link of the channel or its identifier, as for a song. Shown as a card at the end of the gig: the messages of the channel that tag the app, then a button that opens the channel in Discord (see "Discord on a gig") |
| `remindedAt` | Last reminder | Dernière relance | — | 2026-11-20 18:00 | — | Never typed: set when a reminder is sent |
| `proposedAt` | Proposed | Proposé | — | 2026-10-12 21:14 | — | Never typed: set once, the first time the gig reaches `PROPOSED`, `ACCEPTED` or `CONFIRMED`. Empty for a gig that has only been a draft |

### Life cycle
| Status | Meaning | Goes to | Trigger | Effects |
|---|---|---|---|---|
| `DRAFT` | Someone contacted the band; it is noted down | `PROPOSED`, `CANCELLED` | Whoever may edit the gig | Seen by those who manage gigs and by its organisers only. Nobody answers, nobody is reminded |
| `PROPOSED` | The conditions are being discussed | `ACCEPTED`, `CONFIRMED` (forced), `CANCELLED` | Whoever may edit the gig | Every current member sees the gig and answers for its slots |
| `ACCEPTED` | The band and whoever asked agree, with or without a quote; the band is not playable yet | `CONFIRMED`, `CANCELLED` | To `CONFIRMED`: the app, as soon as the gig is playable; or whoever may edit the gig, who forces it | Members keep answering |
| `CONFIRMED` | The gig takes place | `ACCEPTED`, `PROPOSED`, `CANCELLED` | Whoever may edit the gig | The meeting information comes first on the screen of the gig. Back to `ACCEPTED` or `PROPOSED` by hand only, when it was confirmed by mistake: see "Put back by hand" |
| `CANCELLED` | The gig does not take place | `DRAFT`, `PROPOSED` | Whoever may edit the gig reopens it and chooses which of the two | Hidden from the list by default. Answers are kept, and found again when it is reopened |

The status labels in French are "Brouillon", "Proposition", "Accepté", "Validé" and "Annulé".

- **Confirmed by the app.** A gig goes from `ACCEPTED` to `CONFIRMED` by itself in two cases: an answer makes it playable while it is accepted, or it becomes accepted while it is already playable. This is the only change of status the app makes. The app looks at it when an answer is saved and when the gig becomes accepted, at no other moment: an accepted gig that becomes playable because a member left the band is confirmed at the next answer, or by hand.
- **Forced by hand.** Whoever may edit the gig can set `CONFIRMED` although a section has no yes: a member of another section fills in. The screen asks to confirm, and says which sections are missing.
- **No way back by itself.** A confirmed gig stays confirmed when an answer changes afterwards. If it is no longer playable, the gig shows a warning with the missing sections.
- **Put back by hand** (decided on 2026-10-15, #17). Whoever may edit the gig can put a confirmed gig back to `ACCEPTED` or `PROPOSED`, for a confirmation made by mistake. The answers are kept. The rule "confirmed by the app" applies again as it stands: a gig put back to `ACCEPTED` while it is still playable is confirmed again at the next answer saved. The status panel says so when that is the case ("Il repassera en Validé à la prochaine réponse") and offers `PROPOSED` first. No field records that the gig was put back.
- **Accepted by hand.** Quotes are not managed yet: the gig has no field for one, and whoever may edit the gig sets `ACCEPTED` once the band and whoever asked agree. A gig without a quote goes the same way, or is forced to `CONFIRMED` straight from `PROPOSED`.

Two more states are shown and never stored, because they come from the clock. They apply to a `CONFIRMED` gig only: a gig that was not confirmed was not played.

- **In progress** ("En cours"): from 20 minutes after the meeting time on the first day, until the end of the last day. Without a meeting time, from the start of the first day.
- **Past** ("Passé"): after the last day. Hidden from the list by default, like the cancelled gigs.

The screen reads these two states on the clock of the device. The server only decides when a gig is over, to stop the answers, to shorten the list and to know which gigs a member who leaves no longer organises: the day after its last day has ended on its own clock, so that no time zone closes a gig early.

A gig in `DRAFT` whose date has passed is deleted by whoever manages gigs: the list of drafts marks it as out of date. A gig in `PROPOSED` or `ACCEPTED` whose date has passed was not played: it leaves the list of the gigs to come, and those who may edit it see it marked as to close ("À clore"), to cancel it.

### Rules
- **Playable** (changed on 2026-10-18, issue #37, built in 0.3.1; until then an answer `IF_NEEDED` does not count). A slot is playable as soon as every section of the band has one member who answered yes or if needed for it. A gig is playable as soon as one of its slots is. Only the sections that have a current member count: an empty section blocks nothing. `IF_NEEDED` is not a yes (it is counted apart, shown apart, and the member would rather not come), but it counts for playability; `MAYBE` does not. Computed from the answers each time, never stored.
- **Playable thanks to "if needed".** When a section is covered only by members who answered `IF_NEEDED`, the slot is playable, and the screen names them, so that whoever organises the gig can tell them they are needed: "Jouable, grâce à Riton (si besoin)". A section without anyone who answered yes or if needed is named as missing: "Pas encore jouable : personne en Souba."
- **Consequences.** A gig can be confirmed by the app (life cycle, "Confirmed by the app") and notified as playable thanks to an answer `IF_NEEDED`. The reminders and the share of answers do not change: an `IF_NEEDED` is an answer.
- **What my answer changes.** A member who has answered neither yes nor if needed is told when their answer alone would make the slot playable: their section is the last one without anyone.
- **The list.** It shows the gigs to come, the nearest first. Cancelled and past gigs are added on request. Each row shows the status, the answer of the signed-in member and, while the gig is not `CONFIRMED`, whether it is playable.
- **New.** `proposedAt` is set the first time the gig reaches a status members see (`PROPOSED`, `ACCEPTED` or `CONFIRMED`), and never changed afterwards: a gig that is cancelled then reopened keeps it, and does not become new again. A gig is new ("Nouveau") for 15 days after that instant, counted on the clock of the device. The home screen shows it, with the day in relative words ("Proposé hier").
- **The home screen.** It lists the gigs to come that the member sees in the list of gigs, the nearest first, without the gigs to close. A gig with one slot the member has not answered, in `PROPOSED`, `ACCEPTED` or `CONFIRMED`, shows the four answers under its card; a gig with several slots opens the gig. An alert counts the gigs that wait for an answer of the member on one slot at least, and can narrow the list to them.
- **The gig of the day.** On the home screen a `CONFIRMED` gig comes first, in a larger form, from the start of its first day until it is past: every day of a gig of several days. It says in how long the band meets on the first day, until the meeting time; then that the gig is in progress. Two gigs on the same day are both shown, the one that meets first before the other. The gig of the day is not in the list: the alert does not count it, and the member answers for it on its own screen.
- **Deleting a gig** is for a draft only, and for a draft nobody answered for. It deletes its slots, its organisers and its list of costumes. A gig that was cancelled then reopened as a draft keeps the answers it had: it cannot be deleted, it is cancelled again.
- **The screen of a gig** changes with its state: the answers, the date, the time and the address first while it is not playable; the meeting information and the notes once it is `CONFIRMED`; the setlists, when it has some, once it is in progress.
- **Costumes of the gig** (`gigCostume`): the costumes to bring, none or several, chosen in the list of the band. A slot chooses its own among them. Taking a costume off the gig empties it on the slots that had it.
- **Reminder.** A button "Remind" ("Relancer") sends a push notification at once to the `ACTIVE` members who have not answered for one slot at least of the gig. Offered on a gig in `PROPOSED`, `ACCEPTED` or `CONFIRMED` that is not past. The screen shows when the last reminder was sent.
- **Notifications of a gig** (decided on 2026-10-16, issue #23). Two notifications tell members about a gig they are involved in: the members who organise it, or who answered yes, maybe or if needed on one of its slots, among the current members whose setting is on (Members domain, "Notification settings").
  - **Playable** (`notifyGigPlayable`): the gig goes from not playable to playable. Looked at when an answer is saved, by the member or for them. Sent on every such change, not once per gig: a gig that stops being playable and becomes playable again is notified again. Not sent when the same answer also confirms the gig: the "confirmed" one says more.
  - **Confirmed** (`notifyGigConfirmed`): the gig becomes `CONFIRMED`, by the app or by hand. Again on every change: a gig put back to `ACCEPTED` and confirmed again is notified again.
  - Only for a gig in `PROPOSED`, `ACCEPTED` or `CONFIRMED` that is not over. A notification names the gig and its date, never a member: "Les Krapos – Plan jouable", "Fête des Lumières – ven. 4 déc. : chaque pupitre a quelqu'un"; "Les Krapos – Plan validé", "Vide-grenier de la Croix-Rousse – sam. 17 oct. – RDV 9 h 30". It opens the gig.
  - The device that saved the answer or the status does not receive it.
- **Automatic reminders.** Two per gig, each a number of days before `startsOn`, sent from a given hour on that day to the same members as the button. They concern the gigs in `PROPOSED` and `ACCEPTED`. None is sent on a day a reminder was already sent for the gig, by the button or by the app: `remindedAt` says so. A gig created after the day of a reminder does not get it. The two numbers of days and the hour are settings of the band; an empty number of days means that this reminder is not sent. The hour is read on the clock of the server, which is set to the time zone of the band.

### Relations
- Organisers (`gigOrganizer`): none or several members, current when they are added. A member who leaves the band is taken off the gigs that are not over yet, and stays organiser of those already played, shown by nickname.
- Slots (`gigSlot`): one at least, created with the gig.
- Costumes to bring (`gigCostume`): none or several.
- Setlists (`setlist`): none or several.
- Quotes: later feature. The first version records only that the quote is accepted, through the status.

### Access rights
| Who | View | Create | Edit, slots and costumes included | Change status | Remind | Delete |
|---|---|---|---|---|---|---|
| Any signed-in member | Every gig except those in `DRAFT`, every field, `discordChannelId` as a link (changed in v1.7) | No | No | No | No | No |
| An organiser of the gig | This gig whatever its status | No | Yes, this gig, its organisers included | Yes, this gig | Yes, this gig | No |
| `GIG_MANAGER`, `ADMIN` | Every gig, `DRAFT` included | Yes | Yes | Yes | Yes | Yes, a gig in `DRAFT` only: a gig members have seen is cancelled, not deleted |

The right of an organiser depends on the gig, not on a role: the shared layer checks "manages gigs, or organises this gig" in one place, used by every action on a gig.

### Personal data
- `streetAddress`, `postalCode`, `city`, `latitude`, `longitude`: the address of a person when the gig is at someone's home. Purpose: getting to the gig. Seen by every current member, like the rest of the gig.
- `notes`: free text. The form asks not to write the phone or the email of the client in it.
- The client has no field of their own in the first version: they come with the quotes.

### Display
- Dates through `Intl`, in the language of the member: "ven. 4 – dim. 6 déc." for several days.
- A gig with only a postal code and a city shows them as its place.
- The coordinates open the map application of the device.
- The gig of the day shows its place on one line, as the screen of the gig does: the name of the place, the street when there is one, then the postal code and the city, "Boulevard de la Croix-Rousse, 69004 Lyon".
- Representations in the design library (Figma, pages `Gigs` and `Home`): `Gig/Card` (with `Show new` and `New text`, the line "Nouveau" above the card, and `Show answers`, the four answers under it: both on the home screen only), `Gig/Hero` (the confirmed gig of the day, on the home screen), `Gig/Header`, `Gig/Picture`, `Gig/Meeting`, `Gig/Infos`; for a slot, `GigSlot/Card` and `GigSlot/WhoComes`; for a setlist, `Setlist/Card` and `SetlistSong/Row` (with `Show played`, the `PlayedDots` of the other setlists of the gig).
- The count of a slot is "x oui sur y", y being the current members of the band.

## 2. Slot (`gigSlot`, `gigSlotAttendance`)

### Definition
A moment of a gig for which members say whether they come: a roll call. In the French locale a slot is a "présence". A gig of one evening has one; the Fête des Lumières has five: "Vendredi soir", "Samedi midi", "Samedi après-midi", "Samedi soir", "Dimanche".

### Fields
| Field | Label (en) | Label (fr) | Required | Real example | Realistic length | Rules |
|---|---|---|---|---|---|---|
| `name` | Name | Nom | When the gig has several slots | Samedi après-midi | Up to 25 characters | Unique within the gig |
| `position` | — | — | Yes | 3 | — | Set by the order chosen on the screen |
| `note` | Note | Note | No | Parade, we walk for two hours | 1 to 3 lines | |
| `costumeId` | Costume | Déguiz | No | Paillettes | — | One of the costumes of the gig |
| `answer` | Answer | Réponse | — | `IF_NEEDED` | — | One of the four values; no row means no answer |

The answer labels in French are "Oui", "Non", "Peut-être" and "Si besoin". No answer is shown as such, never as a no.

### Rules
- A gig always has one slot at least: the last one cannot be deleted. Deleting a slot deletes its answers, after a confirmation.
- A member answers for a gig in `PROPOSED`, `ACCEPTED` or `CONFIRMED`, until the gig is past. They can change their answer as often as they want, and not go back to no answer.
- Current members answer (`ACTIVE` and `POWER_MEMBER`). Both count for playability.
- Reminders go to `ACTIVE` members who have not answered, never to `POWER_MEMBER` ones.

### Access rights
| Who | View | Answer | Edit the slot |
|---|---|---|---|
| Any signed-in member | Every answer of every current member, for the gigs they see | For themselves | No |
| An organiser of the gig | The same | For themselves, and for another member who told them, on this gig | Yes, on this gig |
| `GIG_MANAGER`, `ADMIN` | The same | For themselves, and for another member who told them | Yes |

### Personal data
- `answer`: purpose, knowing whether the band can play and who comes. Seen by every current member. Kept when the member leaves, so that past gigs keep who played; the member is then shown by nickname only.

## 3. Costume (`costume`)

### Definition
An outfit the band wears at a gig. In the French locale a costume is a "déguisement", shortened to "déguiz". Each band has its own: "Jungle", "Paillettes", "Éphémère", "Libre".

### Fields
| Field | Label (en) | Label (fr) | Required | Real example | Realistic length | Rules |
|---|---|---|---|---|---|---|
| `name` | Name | Nom | Yes | Paillettes | Up to 20 characters | Unique |
| `imagePath` | Picture | Image | No | — | — | JPEG, PNG or WebP, kept in the storage folder and served to signed-in members only. Made small by the browser that sends it, 1200 pixels wide at most; the server accepts nothing larger (1200 by 2400, 800 kB) |
| `position` | — | — | Yes | 2 | — | |

### Rules
- A costume used by a gig cannot be deleted, even a gig already played: it is what the band wore.
- No costume is created at install: the list starts empty.
- Managed in the settings of the band, like sections and instruments.

### Access rights
| Who | View | Create, edit, delete |
|---|---|---|
| Any signed-in member | Yes | No |
| `ADMIN` | Yes | Yes |

## 4. Setlist (`setlist`, `setlistSong`)

### Definition
An ordered list of songs played at a slot of a gig, followed live by the members who play it. A gig can have several: one per set, or one per slot.

### Fields
| Field | Label (en) | Label (fr) | Required | Real example | Realistic length | Rules |
|---|---|---|---|---|---|---|
| `gigSlotId` | Slot | Présence | Yes | Samedi midi | — | One of the slots of the gig. Asked only when the gig has several; the only slot otherwise |
| `number` | Number | Numéro | Yes | 2 | — | Given by the app: one more than the highest of the setlists of the same gig, 1 for its first. Never typed. Unique within the gig |
| `description` | Description | Description | No | Parade, 45 minutes | 1 to 2 lines, up to 120 characters | Typed in a text area that shows two lines and grows with its text; the line breaks are kept when it is shown |
| `position` | — | — | Yes | 7 | — | A song can come twice in a setlist |
| `songId` | Song | Morceau | Yes | Seven Nation Army | — | A song whose status is `IN_REPERTOIRE` or `TEMPORARY` when it is added |
| `liveStartedAt` | — | — | No | 2026-10-17 10:12 | — | Filled while the setlist is live |
| `livePosition` | Song being played | Morceau en cours | No | 3 | — | A position of the setlist; filled while it is live |

### Life cycle
| State | Meaning | Goes to | Trigger | Effects |
|---|---|---|---|---|
| Not live | Written, or played and ended | Live | “Lancer en direct”, by who manages setlists | `liveStartedAt` set, `livePosition` = 1. Any other live setlist of the band ends. A notification to the followers |
| Live | Being played | Live, another song | “Suivant” at the end of a song; or who manages setlists scrolls the live list up or down and stops on a song, to correct | `livePosition` set to that song, never beyond the first or the last. A notification to the followers |
| Live | Being played | Not live | “Terminer”, which replaces “Suivant” on the last song | Both fields emptied. A last notification to the followers: “Setlist terminée” |

The followers are the current members who answered yes to the slot of the setlist, whose setting `notifyLiveSetlist` is on (Members domain, "Notification settings"), and who have at least one device that accepted notifications (Members, `pushSubscription`). The device that pressed "Lancer", "Suivant" or "Terminer" does not receive the notification of that press (decided on 2026-10-16): the other devices of the same member do. There is no way to follow without notifications: the live screen of the app shows the same thing to any member who opens it.

The notification names the song being played and the two after it: “3/6 · Prochain : Toxic”, then “Puis : Valerie · Uptown Funk”; on the last song “6/6 · Dernier : Seven Nation Army”. On an iPhone a notification cannot be replaced: the notifications pile up, the newest on top, so each one reads on its own. On Android it replaces the previous one without a new vibration, and shows “Suivant” to who manages setlists.

### Rules
- Setlists are numbered within their gig: the Fête des Lumières has its setlists 1, 2 and 3, and the next gig starts again at 1. Deleting a setlist does not renumber the others.
- Only a song the band plays can be added to a setlist: in the repertoire (`IN_REPERTOIRE`) or temporary (`TEMPORARY`, learned for an occasion, often this very gig). The songs offered while typing or dictating are those. A song whose status changes afterwards stays in the setlists that already hold it.
- A setlist is written before the gig or, more often, once it has started. It stays editable after the gig: it says what was played.
- A setlist holds 100 songs at most.
- A gig that leaves `CONFIRMED` (cancelled) hides its setlists and ends the one that was live.
- A song used by a setlist cannot be deleted (Songs domain). A slot that has setlists cannot be deleted: its setlists are moved to another slot or deleted first.
- The setlists of a gig are shown from `CONFIRMED` on (in progress and past included): before, the band does not know it plays. A member who taps a song of a setlist opens the song, in the mode they used last.
- **Played dots** (decided on 2026-10-16, issue #20). While a setlist is written, each song shows how many times it is in the other setlists of the same gig, all slots and days together: one plain dot per time, three at most. A song never counts itself. In the list of all songs (below) the count takes every setlist of the gig, this one included. Computed from the setlists each time, never stored.
- **Adding from a list** (issue #20). Besides typing and dictating, a button beside the microphone opens every song a setlist can hold (`IN_REPERTOIRE`, `TEMPORARY`), in alphabetical order, with a search field. A song already in this setlist shows a tick. A tap appends the song at the end of the setlist and the list stays open; a second tap appends it again (a song can come twice). The list closes with its cross or by dragging it down.
- **Filters of the list** (issue #52, decided on 2026-10-24). Under the search field: "Pas joués" (the songs in no setlist of this gig: no dot) and the three moods, Chill, Normal and Teuf. All off when the list opens. "Pas joués" adds up with the moods; the moods add up between them (Chill or Teuf). Nothing is stored.
- **Discord on a gig** (issue #45, decided on 2026-10-24). A gig that has a channel shows, at the end of its sheet, the messages of its channel that tag the app (the bot of the band, or the role Discord gives it), all of them, the latest first, to every member who sees the gig; the tag of the app is taken out of the text shown. It reads the channel as a song does (Songs domain, "Display"): the last 100 messages, kept 10 minutes on the server, never in the database. Without a bot or when nothing tags the app, the sentence and the button only.
- **Moving and removing a song** (issue #20). The handle moves a song. A song is removed by sliding its row to the left, which reveals "Retirer", or by sliding it further. Without a pointer: the row takes the focus, Delete removes it, and Alt with the up or down arrow moves it. The menu of a song, with Monter and Descendre, is gone.
- A live setlist can still be edited; its position stays the same number, and who manages setlists corrects it by scrolling if needed.
- **Length of a setlist** (issue #25). The lengths of its songs (read from their MIDI file), plus the time between two songs of the band (`band.setlistGapSeconds`, 30 s by default) between each of them: 6 songs of 3:30 make 21:00 + 5 × 0:30 = 23:30. Shown rounded to the minute ("≈ 24 min"). Songs without a length are left out of the sum, and the screen says how many ("2 morceaux sans durée"). Computed, never stored.
- **Proposing a setlist** (issue #25, the generator the band used until now, `JCrache/krapo`). In the editor of a setlist, who manages setlists asks the app to propose its songs. Two choices: how many songs (10 by default, 3 to 30), and whether to include the new songs (off by default; a song is new for 2 months after it entered the repertoire, Songs domain, "Setlist attributes"). The app picks among the songs a setlist can hold (`IN_REPERTOIRE`, `TEMPORARY`), and avoids those already in the other setlists of the gig as long as there are enough. Each proposal follows these rules:
  - each song goes only where one of its possible positions allows (changed on 2026-10-23, issue #47; Songs domain, "Setlist attributes"): the first three places take only songs that have Début, the last three only songs that have Fin;
  - a tiring song stays in the first half, except among the last three when it has Fin: Fin wins;
  - two songs tricky for the same section never follow each other.
  
  Among the songs a place allows, the draw favours the mood: the nearer the start, the more likely a Chill song; the nearer the end, the more likely a Teuf song; Normal anywhere. It is a preference, never a rule that blocks a proposal.
  
  When the rules cannot all be kept (a small repertoire), the app keeps the order of this list, drops the last rules first, and says it. The proposal replaces the songs of the setlist in the editor; nothing is saved until "Enregistrer la setlist", and "Une autre" draws again. The songs are then moved, removed and added by hand as usual. Draws are random: nothing about them is stored.
- Later, not modelled: how often each song is played, counted from the setlists of past gigs.

### Access rights
| Who | View | Create, edit, delete | Start live, move on, end |
|---|---|---|---|
| Any signed-in member | The setlists of the gigs they see, from `CONFIRMED` on, and the live screen | No | No |
| `SETLIST_MANAGER`, `ADMIN` | The same | Yes | Yes |

## 5. Calendar feed (no table)

Decided on 2026-10-16 (issue #21): a member subscribes their calendar app to a personal address (Members domain, "Calendar address"). The app writes into nobody's calendar.

### What the feed holds
- **One event per gig**, over the whole gig: a gig of several days, or with several slots, is one event.
- **Which gigs**: those in `PROPOSED`, `ACCEPTED` or `CONFIRMED` for which the member answered yes, maybe or if needed on one slot at least, and whose last day is less than 12 months ago (decided with the owner). A gig the member said no to everywhere, a cancelled gig and a draft are absent: a calendar that had them removes them.
- **Firm or tentative**: firm (`STATUS:CONFIRMED`) when the member said yes on one slot at least, tentative (`STATUS:TENTATIVE`) otherwise.
- **Title**: the name of the band, then the name of the gig, with its status in front when it is not `CONFIRMED`: "Les Krapos – Fête des Lumières", "Les Krapos – Proposition : Fête de la soupe". The band name is reused, no field of its own (decided with the owner); the calendar is named after the band too.
- **Start**: the first day at the meeting time. **End**: midnight at the end of the last day (decided with the owner: the model has no end time, and no length is invented). A gig without a meeting time is an event of whole days, from its first to its last day. The meeting time is on the clock of the place; the feed writes it in UTC, from the time zone of the band (server configuration).
- **Place**: the name of the place, the street, the postal code and the city. **Link**: the screen of the gig in the app.
- **Identity**: one identifier per gig and per instance, which never changes; a version number that grows whenever the gig or the answers of the member change, so that a calendar app takes the change.
- Nothing about other members, the notes of the gig or the Discord channel.

### Rules
- The address is public (no session): a calendar app has no sign-in. It answers only when its token is the one of a current member; any other address, whatever the reason (unknown token, member who left, reset token), gets the same "not found", after a second, so that trying addresses leads nowhere.
- The answer is marked private, to be asked again each time (`private, max-age=0`), and asks search engines not to index it.
- Nothing about the address or the feed is written to a log.

### Access rights
| Who | Read the feed | Create or reset the address |
|---|---|---|
| Whoever holds the address of a current member | That member's gigs, as above | No |
| The member | Yes | Yes, their own |
| Anyone else, an admin included | No: they never see the address | No |

## 6. Other domains

Changed with this domain:

- **Members** (v1.21): the notification settings of the account (`notifyGigPlayable`, `notifyGigConfirmed`, `notifyLiveSetlist`) and the calendar address (`calendarToken`), which the calendar feed (entry 5) reads.
- **Members** (v1.18): a device that accepted notifications also receives the live setlist.
- **Members** (v1.17): `pushSubscription`, a device that accepted push notifications. The permission "manage costumes" goes to `ADMIN`. The role `SETLIST_MANAGER` is offered once setlists are built. A member who leaves is taken off the gigs they organise that are not over.
- **Band** (v1.6): `gigFirstReminderDays` (15 by default), `gigSecondReminderDays` (5) and `gigReminderHour` (18).
- **Songs**: nothing changes; `song` is referred to by `setlistSong`.
- **Overview** (v0.7) and **scoping**: slots without dates, no stops, costumes, setlists tied to a gig and built in the first version, at the end of this domain.

## 7. Open questions

For later: the generator could also aim at a length ("45 minutes") rather than a number of songs.


None. Decided by the owner on 2026-10-13: the five statuses, `CONFIRMED` set by the app or forced; a cancelled gig can be reopened; organisers edit their gig and answer for others; one meeting time per gig; optional coordinates; the costumes of the gig as the reference, managed by the admin; the reminder button and two automatic reminders; setlists built in this domain, last.
