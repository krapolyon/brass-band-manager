---
name: brass-band-design
description: Design of the brass band app, its art direction, its themes and variables, its business objects and their representations, its components, its interface wording and the way design work moves from exploration to Figma to code. Use whenever the work touches a screen, a layout, a component, a colour, a theme, a variable or token, an icon, a piece of text shown in the interface, the Figma file or the style study, even if the request does not say "design".
---

# Brass band app: design

This skill governs the design of the brass band app: an installable web app (React PWA) used mostly on a phone by the thirty or so members of a band, and meant to be open-sourced so that other bands can run it under their own name, logo and colours.

It lives in the repository at `.claude/skills/brass-band-design/SKILL.md` and is versioned with the code. It records decisions the project owner has made, and it is adjusted with him as the design evolves (see "Keeping this skill current").

## Where design happens

| Place | What it is for | Status of what it holds |
|---|---|---|
| Claude Design canvas | Finding a direction: several options side by side, fast | Disposable. A direction, never a specification |
| Figma | The definitive design: variables, components, screens | The source of truth |
| Code | Implements Figma. CSS custom properties mirror the Figma variables one for one | Follows Figma |

Design is done in the design conversations of the project, with Figma. Claude in VS Code does not design: it reads the design from Figma through the Figma connector (MCP) and implements it. When Figma and the code disagree, Figma is right: fix the code, or make the change in Figma first. This keeps a single place to look.

The owner changes the design directly in Figma, which is exactly what variables and components are for. So before any work, read the current state of the file: the variables, and the components the task touches. If the file differs from what this skill describes, the file is right. Work from it, and propose the line to update here.

The art direction was settled in a study canvas, "Les Krapos — étude de style" (the owner's private canvas: https://claude.ai/artifact/AKFmX1RdFqjqcVWPe4UHZm). Its row "G" is the retained direction. Read it as an intention to carry into Figma, not as screens to copy: several of them are not validated, the Live mode in particular.

The Figma file of the app does not exist yet. Add its link here when it is created.

## Business objects and their representations

The design is organised around the business objects of the data model (`model/` in the repository: a member, a song, a gig, a slot of a gig, an instrument…), not around screens. Each object has a small set of **representations**: the ways it can appear in the interface. A screen is then an assembly of representations, and an object looks the same wherever it shows up.

A starting vocabulary, to adjust with the owner:

| Representation | What it is | Example |
|---|---|---|
| Mention | The object named inside a line of text or another component | The organisers of a gig |
| Row | One line in a list | A song in the list of songs |
| Card | A compact summary that stands on its own | A slot of a gig with its answers |
| Tile | The visual alone, square | The cover art of a song |
| Header | The top of the object's own screen, in a large and a compact form | A song, with its artwork and title |

How to work with them:

- A business component is named `<Object>/<Representation>`, the object taking its English name from the model: `Song/Row`, `Song/Header`, `Member/Mention`, `GigSlot/Card`.
- Create a representation only when a feature needs it. An object does not need the whole set.
- What a representation shows comes from the business dictionary (`model/<domain>.md`): the fields, their labels, real examples and realistic lengths. The entry of each object lists the representations that exist and those still missing; keep that list up to date.
- Generic components (button, chip, tab bar, mode bar, sheet) form the base layer. Representations are built from them and never restyle them locally.
- A new look for an object is a proposal to change its representation everywhere, not an exception on one screen.

## One conversation per feature

Design work is done feature by feature, each in its own conversation, in this order. The owner validates each step before the next one starts: he designs in Figma himself and has the final say on every visual choice.

1. **Brief.** Restate the feature in a few lines. List the business objects it shows and the states to cover. Describe one or two ways to lay it out, in words. Nothing is drawn yet.
2. **Explore.** Draw the screens freely. At this stage everything can still move, so do not build components: plain frames are fine. Keep the result consistent with the rest of the app all the same: use the shared variables, and reuse the representations that already exist as they are.
3. **Extract.** Once the owner has chosen, list the objects on the screens and the representations they need. For each one, say whether it exists, has to be extended, or has to be created. Build what is missing in the library, bound to variables.
4. **Rebuild.** Redo the screens from library components. Then cover the states: empty, loading, error, long text, missing data, a member without the right, the light and the dark scheme, and at least two accent themes.
5. **Check** against the list at the end of this skill.
6. **Hand-off.** Notes for the code, read from VS Code: variables used, component mapping, behaviours a static screen does not show, translation keys for the copy.

Consistency across the app matters more than a clever screen. Before adding to a feature, look at the whole: the navigation and the overall map of screens already reserve a place for the later features (setlists, rehearsals, song stats, quotes), and a screen designed alone rarely fits afterwards.

## Roles and language

- Talk to the owner in French.
- Everything written into the repository or into Figma is in English: component names, variable names, layer names, annotations, hand-off notes. Other bands and contributors from other countries have to be able to read them.
- Interface copy is written in French first, and always goes through translation keys. No text is baked into an image or a component.

## Art direction

**Modern, clean, elegant, never cartoonish.** The reference for the level of modernity is today's music apps. They are a marker, not a model to copy. No mascot, no emoji used as icons, no glitter or novelty textures. Gradient backgrounds and illustrations are welcome when they bring something, as long as the result stays calm.

**Colour comes from the content.** Every song the band plays is a cover, so every song has the cover art of the original. That art is the hero of a song screen, and a heavily blurred copy of it lights the top of the screen (the "halo"). Each song gets its own atmosphere without anyone choosing a colour. A screen with no artwork, a gig for instance, gets a halo built from soft colour fields instead.

**The member chooses the accent.** The app offers several colour themes. A theme sets the accent used by controls (the active mode, the main action, the selected answer, the current tab) and tints the ground slightly. It never recolours the content. The gold of the band's logo is one theme among others, not a default to defend.

**Light by day, dark by night.** The study was drawn dark first. A light scheme is wanted as well, with the app following the time of day or the device setting. Every colour therefore exists in both schemes from the start.

**Two kinds of surface.** Floating controls (the mode bar of a song, the tab bar, the buttons over the halo) are glass: translucent, blurred, with a hairline border. Content sits on plain, opaque sheets. Keeping the two apart tells the member what is navigation and what is content.

**Round and generous.** Large radii, pill-shaped controls, big titles, room between blocks. The band's logo is a chunky, rounded lettering; the interface echoes its generosity, not its colours.

**The friendly, joking tone lives in the words.** The band's voice is warm and takes nothing too seriously. That voice goes into labels, empty screens, reminders and errors, and stays out of the visuals. See "Words in the interface".

**An identity that survives a rebrand.** Another band will replace the name, the logo and the colours. What makes the app recognisable has to be what remains: structure, typography, the halo, motion, the way it speaks.

### Still to confirm with the owner

| Point | What the study used |
|---|---|
| Typefaces | Bricolage Grotesque for titles, Instrument Sans for text |
| Accent themes and their names | Four: copper, coral, mint, lilac |
| The light scheme | Not drawn yet |
| The names of the representations | The starting vocabulary above |
| The Live mode of a song | Drawn, not validated; to be redone with the feature |

Do not treat a line of this table as decided. Ask, or read what the owner has set in Figma, then move it into the sections above.

## Phone first

The app is used standing up, often outdoors, sometimes with an instrument in the hands.

- Design at phone width first (390 px wide is the working reference), then let the layout breathe on larger screens.
- Put the main action where the thumb rests, in the lower half. Reaching for the top of the screen is for secondary actions.
- Touch targets are at least 44 px. In the modes used while playing, go well beyond: a control hit with a free finger between two phrases has to be hard to miss.
- Nothing depends on hover. A gesture always has a visible control that does the same thing.
- Navigation is a floating tab bar with five entries: home, songs, gigs, members, settings.
- A song is organised by modes, switched from one bar: MP3, MIDI, PDF, Clip, Live. The artwork is large when one arrives on the song, and shrinks to a thumbnail beside the title when a mode needs the room.
- The app is a PWA: do not draw a fake status bar or a fake keyboard, and leave the device's safe areas free.

## Variables and themes

Every colour, radius, spacing and type size is a variable, in explorations as well as in components. A value typed by hand cannot follow a theme change, and the whole point of the themes, of the two schemes, of the owner's direct edits and of other bands' rebranding is that one change reaches everything.

- **Primitives**: the raw scales (colour ramps, spacing steps, radii, type sizes). Components never use them directly.
- **Semantic variables**: what components use. Named for their role, not their look: `ground`, `sheet`, `glass`, `border`, `text`, `textMuted`, `accent`, `onAccent`, `success`, `warning`, `danger`.
- **Two independent axes**: the scheme (light, dark) and the accent theme. A member can combine any scheme with any theme, so they are two separate sets of modes, not one list of combinations.
- Status colours (playable, something missing, cancelled) are not the accent and do not change with the theme. A status is never carried by colour alone: add an icon or a word.
- Names are in English and camelCase, the same in Figma and in the CSS (`accent` in Figma, `--accent` in the code).

## Components

- No ready-made component kit, in Figma or in code. The first attempt at this app used one and came out looking like every other app built with it. Components are designed for this app. In code, a library that provides behaviour and accessibility without any styling is fine.
- Look in the library before creating. A new component is justified by a need no existing one covers, not by a slightly different screen.
- Components are named in English, in PascalCase, with their variants as properties, and carry a one-line description of what they are for. Business components follow `<Object>/<Representation>`.
- A component uses only semantic variables.

## Words in the interface

- Speak to the member with "tu". Use the band's own words in the French locale (fanfaron, plan, brasser), and plain equivalents in the translation keys and in other locales.
- The tone is friendly and can joke, in one short line, where the member has a second to smile: an empty screen, a reminder, a nudge to answer. Example from the study: "Il te reste dimanche à répondre. Indice : il y a un apéro."
- Clarity wins over the joke. An error says what happened and what to do next, with no humour that delays the answer. A destructive action is named for exactly what it does.
- A button says what it does ("Lire ma partie", not "Valider"), and keeps the same name through the whole flow.
- Sentence case everywhere. No all-caps labels.

## Check before showing a screen

For an exploration, the first, third and fifth lines are enough. For a rebuilt screen, all of them:

- Every colour, radius and spacing comes from a variable.
- Every business object on the screen is an instance of one of its representations.
- The screen holds in the dark and the light scheme, and with at least two accent themes.
- Text contrast is at least 4.5:1 (3:1 from 24 px), including muted text and text on the accent.
- Real content was used: a long song title, a compound first name, a gig with three slots.
- Touch targets are at least 44 px; the main action sits in the lower half.
- The empty, loading and error states exist.
- No text is baked into an image; every string has a translation key.
- Nothing on the screen names this band, its logo or its colours outside the instance settings.

## Working in Figma

- Load the `figma-use` skill before any write in Figma, `figma-generate-library` for variables and components, `figma-generate-design` for screens.
- Read first, write second, and say what is about to be written before doing it. The owner works in the same file and may have changed it since the last conversation.
- Work in small steps and look at the result after each write (a screenshot of the node). A screen that was never looked at is not finished.
- Never overwrite a change the owner made by hand. If it conflicts with the task, ask.

## Keeping this skill current

This file is the reference for design decisions, and it is adjusted with the owner as the work goes: many decisions will come from what he changes in Figma, not from a conversation. When a conversation settles a decision, or when Figma shows that one has changed, propose the exact line to add or replace, with its reason, and the section it goes in. When a rule here turns out wrong in use, say so and propose the change, do not work around it silently. The file changes through a commit, like any other.
