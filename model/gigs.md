# Business dictionary — Gigs domain

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
| `endsOn` | End date | Date de fin | No | 2026-12-06 | — | Never before `startsOn`. Empty for a gig of one day |
| `meetingTime` | Meeting time | Heure de rendez-vous | No | 18:30 | — | On the first day, on the clock of the place. One for the whole gig |
| `placeName` | Place | Lieu | No | Place des Terreaux | 10 to 40 characters | |
| `placeUrl` | Link to the place | Lien du lieu | No | The site of the venue | Up to 500 characters | An `https` address |
| `streetAddress` | Address | Adresse | No | 12 rue des Capucins | 1 to 2 lines | |
| `postalCode` | Postal code | Code postal | No | 69001 | 5 characters | Can be filled without the street |
| `city` | City | Ville | No | Lyon | Up to 30 characters | Can be filled without the street |
| `latitude`, `longitude` | GPS coordinates | Coordonnées GPS | No | 45.767300, 4.834400 | 6 decimals | Both or neither. Typed or pasted as one text, "45.7673, 4.8344". Latitude from -90 to 90, longitude from -180 to 180 |
| `notes` | Information | Infos diverses | No | Parking behind the town hall, meal provided | A few lines | Free text |
| `discordChannelId` | Discord channel | Salon Discord | No | 1203984756120394875 | 17 to 20 digits | Digits only. Unique: one channel per gig |
| `remindedAt` | Last reminder | Dernière relance | — | 2026-11-20 18:00 | — | Never typed: set when a reminder is sent |

### Life cycle
| Status | Meaning | Goes to | Trigger | Effects |
|---|---|---|---|---|
| `DRAFT` | Someone contacted the band; it is noted down | `PROPOSED`, `CANCELLED` | Whoever may edit the gig | Seen by those who manage gigs and by its organisers only. Nobody answers, nobody is reminded |
| `PROPOSED` | The conditions are being discussed | `ACCEPTED`, `CONFIRMED` (forced), `CANCELLED` | Whoever may edit the gig | Every current member sees the gig and answers for its slots |
| `ACCEPTED` | The band and whoever asked agree, with or without a quote; the band is not playable yet | `CONFIRMED`, `CANCELLED` | To `CONFIRMED`: the app, as soon as the gig is playable; or whoever may edit the gig, who forces it | Members keep answering |
| `CONFIRMED` | The gig takes place | `CANCELLED` | Whoever may edit the gig | The meeting information comes first on the screen of the gig |
| `CANCELLED` | The gig does not take place | `DRAFT`, `PROPOSED` | Whoever may edit the gig reopens it and chooses which of the two | Hidden from the list by default. Answers are kept, and found again when it is reopened |

The status labels in French are "Brouillon", "Proposition", "Accepté", "Validé" and "Annulé".

- **Confirmed by the app.** A gig goes from `ACCEPTED` to `CONFIRMED` by itself in two cases: an answer makes it playable while it is accepted, or it becomes accepted while it is already playable. This is the only change of status the app makes. The app looks at it when an answer is saved and when the gig becomes accepted, at no other moment: an accepted gig that becomes playable because a member left the band is confirmed at the next answer, or by hand.
- **Forced by hand.** Whoever may edit the gig can set `CONFIRMED` although a section has no yes: a member of another section fills in. The screen asks to confirm, and says which sections are missing.
- **No way back by itself.** A confirmed gig stays confirmed when an answer changes afterwards. If it is no longer playable, the gig shows a warning with the missing sections.
- **Accepted by hand.** Quotes are not managed yet: the gig has no field for one, and whoever may edit the gig sets `ACCEPTED` once the band and whoever asked agree. A gig without a quote goes the same way, or is forced to `CONFIRMED` straight from `PROPOSED`.

Two more states are shown and never stored, because they come from the clock. They apply to a `CONFIRMED` gig only: a gig that was not confirmed was not played.

- **In progress** ("En cours"): from 20 minutes after the meeting time on the first day, until the end of the last day. Without a meeting time, from the start of the first day.
- **Past** ("Passé"): after the last day. Hidden from the list by default, like the cancelled gigs.

The screen reads these two states on the clock of the device. The server only decides when a gig is over, to stop the answers, to shorten the list and to know which gigs a member who leaves no longer organises: the day after its last day has ended on its own clock, so that no time zone closes a gig early.

A gig in `DRAFT` whose date has passed is deleted by whoever manages gigs: the list of drafts marks it as out of date. A gig in `PROPOSED` or `ACCEPTED` whose date has passed was not played: it leaves the list of the gigs to come, and those who may edit it see it marked as to close ("À clore"), to cancel it.

### Rules
- **Playable.** A slot is playable as soon as every section of the band has one member who answered yes for it. A gig is playable as soon as one of its slots is. Only the sections that have a current member count: an empty section blocks nothing. `MAYBE` and `IF_NEEDED` are not a yes. Computed from the answers each time, never stored.
- **Playable if needed.** The screen also tells when a slot would be playable if the members who answered `IF_NEEDED` came.
- **What my answer changes.** A member who has not answered yes is told when their yes alone would make the slot playable: their section is the last one without a yes.
- **The list.** It shows the gigs to come, the nearest first. Cancelled and past gigs are added on request. Each row shows the status, the answer of the signed-in member and, while the gig is not `CONFIRMED`, whether it is playable.
- **Deleting a gig** is for a draft only, and for a draft nobody answered for. It deletes its slots, its organisers and its list of costumes. A gig that was cancelled then reopened as a draft keeps the answers it had: it cannot be deleted, it is cancelled again.
- **The screen of a gig** changes with its state: the answers, the date, the time and the address first while it is not playable; the meeting information and the notes once it is `CONFIRMED`; the setlists, when it has some, once it is in progress.
- **Costumes of the gig** (`gigCostume`): the costumes to bring, none or several, chosen in the list of the band. A slot chooses its own among them. Taking a costume off the gig empties it on the slots that had it.
- **Reminder.** A button "Remind" ("Relancer") sends a push notification at once to the `ACTIVE` members who have not answered for one slot at least of the gig. Offered on a gig in `PROPOSED`, `ACCEPTED` or `CONFIRMED` that is not past. The screen shows when the last reminder was sent.
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
| Any signed-in member | Every gig except those in `DRAFT`, with every field except `discordChannelId` | No | No | No | No | No |
| An organiser of the gig | This gig whatever its status, `discordChannelId` included | No | Yes, this gig, its organisers included | Yes, this gig | Yes, this gig | No |
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
- Representations in the design library: to draw (row of the list, header of its screen, mention). None exists yet.

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
| `imagePath` | Picture | Image | No | — | — | JPEG, PNG or WebP, kept in the storage folder and served to signed-in members only |
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
An ordered list of songs played at a gig. A gig can have several: one per set, or one per slot.

### Fields
| Field | Label (en) | Label (fr) | Required | Real example | Realistic length | Rules |
|---|---|---|---|---|---|---|
| `number` | Number | Numéro | Yes | 142 | — | Given by the app: one more than the highest. Never typed |
| `description` | Description | Description | No | Parade, 45 minutes | Up to 60 characters | |
| `position` | — | — | Yes | 7 | — | A song can come twice in a setlist |

### Rules
- A setlist is written before the gig or, more often, once it has started. It stays editable after the gig: it says what was played.
- A song used by a setlist cannot be deleted (Songs domain).
- Later, not modelled: how far the band is in the setlist during the gig, with a button to move on; the next songs on the lock screen of the phone; how often each song is played, counted from the setlists of past gigs.

### Access rights
| Who | View | Create, edit, delete |
|---|---|---|
| Any signed-in member | The setlists of the gigs they see | No |
| `SETLIST_MANAGER`, `ADMIN` | The same | Yes |

## 5. Other domains

Changed with this domain:

- **Members** (v1.17): `pushSubscription`, a device that accepted push notifications. The permission "manage costumes" goes to `ADMIN`. The role `SETLIST_MANAGER` is offered once setlists are built. A member who leaves is taken off the gigs they organise that are not over.
- **Band** (v1.6): `gigFirstReminderDays` (15 by default), `gigSecondReminderDays` (5) and `gigReminderHour` (18).
- **Songs**: nothing changes; `song` is referred to by `setlistSong`.
- **Overview** (v0.7) and **scoping**: slots without dates, no stops, costumes, setlists tied to a gig and built in the first version, at the end of this domain.

## 6. Open questions

None. Decided by the owner on 2026-10-13: the five statuses, `CONFIRMED` set by the app or forced; a cancelled gig can be reopened; organisers edit their gig and answer for others; one meeting time per gig; optional coordinates; the costumes of the gig as the reference, managed by the admin; the reminder button and two automatic reminders; setlists built in this domain, last.
