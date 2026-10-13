---
name: "brass-band-design"
description: "Design of the brass band app, its art direction, its themes and variables, its business objects and their representations, its components, its interface wording and the way design work moves from exploration to Figma to code. Use whenever the work touches a screen, a layout, a component, a colour, a theme, a variable or token, an icon, a piece of text shown in the interface, the Figma file or the style study, even if the request does not say \"design\"."
---

# Brass band app: design

This skill governs the design of the brass band app: an installable web app (React PWA) used mostly on a phone by the thirty or so members of a band, and meant to be open-sourced so that other bands can run it under their own name, logo and colours.

It is versioned in the repository at `skills/brass band design/skills/brass-band-design/SKILL.md`, and loaded by Claude from the owner's account: a change is made in both places. It records decisions the project owner has made, and it is adjusted with him as the design evolves (see "Keeping this skill current").

## Where design happens

| Place | What it is for | Status of what it holds |
|---|---|---|
| Claude Design canvas | Finding a direction: several options side by side, fast | Disposable. A direction, never a specification |
| Figma | The definitive design: variables, components, screens | The source of truth |
| Code | Implements Figma. CSS custom properties mirror the Figma variables one for one | Follows Figma |

Design is done in the design conversations of the project, with Figma. Claude in VS Code does not design: it reads the design from Figma through the Figma connector (MCP) and implements it. When Figma and the code disagree, Figma is right: fix the code, or make the change in Figma first. This keeps a single place to look.

The owner changes the design directly in Figma, which is exactly what variables and components are for. So before any work, read the current state of the file: the variables, and the components the task touches. If the file differs from what this skill describes, the file is right. Work from it, and propose the line to update here.

The Figma file of the app is "Brass band manager": https://www.figma.com/design/xYuIOrGu1cS6ocbMo7M5dD/Brass-band-manager

The art direction was settled in a study canvas, "Les Krapos — étude de style" (the owner's private canvas: https://claude.ai/artifact/AKFmX1RdFqjqcVWPe4UHZm). Its row "G" is the retained direction, and it has been carried into the Figma variables. The study is now history: read it for the intention, never for a value, and not as screens to copy. Several of them are not validated, the Live mode in particular.

## The Figma file

- **`Design system` page.** One frame, three groups: Foundations (colour, accent themes, typography, space and sizes, surfaces), Components — base, Components — business objects. Every component sits in a card with its name and one line on when to use it. A new component gets its card; a business object gets its card with its first representation.
- **One page per feature**, named after the feature in English: `Install`, `Members` (sign-in, forgotten password, onboarding, directory, the member's own settings, managing members), `Band settings`, `Songs` (the list, the song in its five modes, the import, the management of songs), `Home` (the gigs to come with the answers in place, the gig of the day, the latest songs of the repertoire).
- **While a feature is explored**, two layouts that are both plausible sit side by side in the same section, named `option A`, `option B`, and the section title says there is a choice to make. The "Read me" note lists the choices under "To validate".
- **On a feature page**: numbered sections (the flow on a phone, then its states, then one section per larger width, then the schemes and accent themes), and a "Read me" note at the left. The note carries the status (exploration, to validate or validated), the source in the model with its version, what is decided, the components the screens are built from, and the open points. Keep it true: it is what the owner and Claude in VS Code read first.
- **Screen frames** are named `<Feature> / <Screen> — <state>`: `Install / First member — errors`.
- **Scheme and theme checks are clones**, not redrawn screens: clone the frame and set other variable modes on it. If a clone looks wrong, the fix belongs in a variable or a component.

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
- Base components (button, field, row, chip, message, tab bar, mode bar, sheet) form the base layer. Representations are built from them and never restyle them locally.
- A new look for an object is a proposal to change its representation everywhere, not an exception on one screen.

## One conversation per feature

Design work is done feature by feature, each in its own conversation, in this order. The owner validates each step before the next one starts: he designs in Figma himself and has the final say on every visual choice.

1. **Brief.** Read the feature in the model first, at its latest version: a model that changed since the last conversation changes the screens. Restate the feature in a few lines. List the business objects it shows and the states to cover. Describe one or two ways to lay it out, in words. Nothing is drawn yet.
2. **Explore.** Draw the screens freely, at phone width. Everything can still move, so do not build business representations yet: plain frames bound to variables are fine. Base components are the exception. A button or a field serves every feature, so build it in the library as soon as a screen needs it and use instances from the start. When two layouts are plausible, draw both side by side with real content and let the owner choose.
3. **Extract.** Once the owner has chosen, list the objects on the screens and the representations they need. For each one, say whether it exists, has to be extended, or has to be created. Build what is missing in the library, bound to variables.
4. **Rebuild.** Redo the screens from library components. Then cover the states: empty, loading, error, long text, missing data, a member without the right. Then the four widths (see "Larger screens"), the light and the dark scheme, and at least two accent themes. The rebuilt screens replace the exploration on the page: the layout that was not chosen is not kept.
5. **Check** against the list at the end of this skill.
6. **Hand-off.** Notes for the code, read from VS Code: variables used, component mapping, behaviours a static screen does not show, translation keys for the copy.

Consistency across the app matters more than a clever screen. Before adding to a feature, look at the whole: the navigation and the overall map of screens already reserve a place for the later features (setlists, rehearsals, song stats, quotes), and a screen designed alone rarely fits afterwards.

A design conversation often settles things that belong to the model (a default value, what happens at the end of a flow). Those go to `model/<domain>.md`, not here: list them for the owner at the end of the conversation.

## Roles and language

- Talk to the owner in French.
- Everything written into the repository or into Figma is in English: component names, variable names, layer names, annotations, hand-off notes. Other bands and contributors from other countries have to be able to read them.
- Interface copy is written in French first, and always goes through translation keys. No text is baked into an image or a component. French is also the language the app opens in before anyone has chosen one.

## Art direction

**Modern, clean, elegant, never cartoonish.** The reference for the level of modernity is today's music apps. They are a marker, not a model to copy. No mascot, no emoji used as icons, no glitter or novelty textures. Gradient backgrounds and illustrations are welcome when they bring something, as long as the result stays calm.

**Colour comes from the content.** Every song the band plays is a cover, so every song has the cover art of the original. That art is the hero of a song screen, and a heavily blurred copy of it lights the top of the screen (the "halo"). Each song gets its own atmosphere without anyone choosing a colour. A screen with no artwork, a gig or a form for instance, gets a halo built from soft colour fields instead: the `Halo` component.

**The member chooses the accent.** The app offers several colour themes. A theme sets the accent used by controls (the active mode, the main action, the selected answer, the current tab) and tints the ground slightly. It never recolours the content. The gold of the band's logo is one theme among others, not a default to defend.

**Light by day, dark by night.** The app follows the time of day or the device setting, so every colour exists in both schemes from the start. The dark scheme comes from the study; the light one was first drawn in Figma.

**Two kinds of surface.** Floating controls (the mode bar of a song, the tab bar, the buttons over the halo, the bar that holds the main action of a long screen) are glass. Content sits on plain, opaque sheets. Keeping the two apart tells the member what is navigation and what is content. In Figma the glass is Figma's native glass effect, the effect style `glass`, over the fill `glass` (black at 20 % in the dark scheme, as in the owner's earlier design): no hand-made stroke, background blur or highlight is added to it. Anything that floats over the cover of a song is set to the dark scheme, whatever the scheme of the screen, and to dark high contrast when high contrast is on.

**Round and generous.** Large radii, pill-shaped controls, big titles, room between blocks. The band's logo is a chunky, rounded lettering; the interface echoes its generosity, not its colours.

**The friendly, joking tone lives in the words.** The band's voice is warm and takes nothing too seriously. That voice goes into labels, empty screens, reminders and errors, and stays out of the visuals. See "Words in the interface".

**An identity that survives a rebrand.** Another band will replace the name, the logo and the colours. What makes the app recognisable has to be what remains: structure, typography, the halo, motion, the way it speaks.

### Still to confirm with the owner

| Point | Where it stands |
|---|---|
| Typefaces | Bricolage Grotesque for titles, Instrument Sans for text, as in the study. In Figma: `fontDisplay` and `fontText` |
| Accent themes: number, names, values | Four in Figma: Copper, Coral, Mint, Lilac. The owner tunes them himself in the `Theme` collection |
| The light scheme | Proposed in Figma, not validated. The owner finds that the halo works less well in light: to rework |
| The larger screens | The widths are decided (see "Larger screens"), and so is the navigation of the app on a desktop (floating menu). The tablet layout drawn for Install is a first proposal. The `Songs` page draws the app at 768 (tab bar 480 wide, centred: a proposal) and 1920 (content capped and centred) |
| The accessibility options | Set up in Figma in October 2026 (see "Accessibility modes" under "Variables and themes"); the values of the two high contrast modes and the sizes of `TextSize` are validated by the owner. Still to settle, seen on the clones of the `Members` page: a chip can be cut in a column of fixed width when the text grows; in high contrast the status colours and the accent used as text keep their ordinary values, and the soft status backgrounds stay translucent |
| The names of the representations | The starting vocabulary above, plus `Track` (one instrument in the MIDI player, `SongPart/Track`) |
| The Live mode of a song | Redrawn on the `Songs` page (option B: the page rises line by line, no cursor); to finalise after the prototype of the reading mode |
| Icons | Iconsax, chosen by the owner. Its free licence forbids redistributing the files: the owner arranges a licence before the code is published |

Do not treat a line of this table as decided. Ask, or read what the owner has set in Figma, then move it into the sections above.

Colour values are deliberately absent from this skill. The owner adjusts the accents and the halo colours directly in the variables: read them from Figma, and do not reopen them in a conversation unless he asks.

## Phone first

The app is used standing up, often outdoors, sometimes with an instrument in the hands.

- Design at phone width first (390 px wide is the working reference), then let the layout breathe on larger screens.
- Put the main action where the thumb rests, in the lower half. Reaching for the top of the screen is for secondary actions.
- Touch targets are at least 44 px. In the modes used while playing, go well beyond: a control hit with a free finger between two phrases has to be hard to miss.
- Nothing depends on hover. A gesture always has a visible control that does the same thing.
- Navigation is a floating tab bar with five entries: home, songs, gigs, members, settings (`TabBar`). It sits 12px from the sides and above the bottom safe area; a screen that scrolls under it keeps 126px free at its end. A screen opened from a tab (a form, a record) hides it and shows a back button. From a text size of 160 % it shows its icons alone (`Show labels` off): five labels no longer fit, and each entry keeps its name for screen readers.
- A song is organised by modes, switched from one bar (`ModeBar`): MP3, MIDI, PDF, Clip, Live. On a phone the top of the song is `Song/Header` Large in every mode but Live and MIDI landscape: the cover fills the width, the back and more buttons and the mode bar float over it in glass, and the content sits on a panel whose rounded top corners overlap the cover. The PDF is read full screen from its own button. On a tablet and a desktop the header is Compact: the cover beside the name, over the halo.
- The app is a PWA: do not draw a fake status bar or a fake keyboard. A phone frame does not reserve the top safe area: the content starts 32 px from the top (`spaceXxl`), in `ScreenTop`. In code the top padding is the larger of 32 px and `env(safe-area-inset-top)` plus 8 px, so that a notch never covers the back button. 34 px stay free at the bottom of a phone frame, under the bars. Safe areas are not variables: in code they come from `env(safe-area-inset-*)`.

### Larger screens

The same app runs in a browser on a tablet or a computer. Every feature is drawn at four widths:

| Screen | Frame width |
|---|---|
| Phone | 390 px, the reference, drawn first |
| Tablet | 768 px |
| Small desktop | 1280 px |
| Large desktop | 1920 px |

- A larger screen is derived from the phone screen: the same components, the same order, the same words. More width buys room (a second column, a list beside its detail), never another feature.
- **On a desktop the left of the window is a floating glass panel**, 16 px from the edges, with the radius of a sheet (`radiusLg`), as tall as the window: it stays in place while the right side scrolls. The halo lives inside it, behind the glass, and never spreads over the whole window: at that size it is too much. The right side is plain ground.
- **In a flow** (install, onboarding, sign-in) the panel carries the step and the title, and the right side carries the content and its actions. The panel is 448 px wide at 1280 and 648 px at 1920.
- **In the app** the panel is the menu (`SideNav`, 264 px wide): the logo and the name of the band at the top, the five entries, the signed-in member at the bottom. The title of the page is on the right, above the content, with the actions of the page at its right.
- **A list that is managed becomes a table on a desktop** (`Member/TableHeader`, `Member/TableRow`): one line per object, the status in its own column. A list that is browsed stays a grid of cards.
- On a tablet and a desktop the container that carries the content is centred in its pane, never left against its edge.
- A column of text or of fields does not stretch with the window: cap its width so that lines stay readable. In Figma give that column a fixed width, not a maximum width: instances inside a column capped by a maximum can render at the width of their component. In code it is a max-width.
- **A list beside its detail** (gigs, songs) is never narrower than on a phone once the window allows it: 300 px at 1024, growing with the window to 390 px at 1280, then 440 px from 1920. The detail takes the rest; on a small desktop it is one column, two columns from 1920. A compact header puts its titles under the picture when they would get less than 240 px.
- A record opened from a list (a gig, a song) hides the tab bar at every width below 1024, the tablet included.
- Draw the larger screens at the Rebuild step, once the phone screens are made of components. In an exploration, the phone is enough, unless the larger layout is itself the open question.

## Variables and themes

Every colour, radius, spacing and type size is a variable, in explorations as well as in components. A value typed by hand cannot follow a theme change, and the whole point of the themes, of the two schemes, of the owner's direct edits and of other bands' rebranding is that one change reaches everything.

The file holds six collections:

| Collection | Modes | What it holds | Who uses it |
|---|---|---|---|
| `Primitives` | Default | Raw colours, named by hue and step: `neutral/900`, `white/a8` | `Scheme` only, through aliases. Hidden from the pickers |
| `Theme` | One per accent theme | What a theme sets: the accent, the text on it, and the tint of the ground and of the sheets in each scheme | `Scheme` only, through aliases. Hidden from the pickers |
| `Scheme` | Dark, Light, Dark high contrast, Light high contrast | The semantic colours | Components and screens |
| `Size` | Default | Spacing, radii, sizes of controls, type sizes, the two typefaces. The type sizes and the typefaces are aliases of the two collections below | Components, screens and text styles |
| `TextSize` | 100 %, 120 %, 140 %, 160 %, 180 %, 200 % | The size of each text style at each step of the text size option (`textSizeBody`…) | `Size` only, through aliases. Hidden from the pickers |
| `Typeface` | Default, Legible | The family of titles and of text (`typefaceDisplay`, `typefaceText`): the two of the app, or Atkinson Hyperlegible Next | `Size` only, through aliases. Hidden from the pickers |

- **Two independent axes**: the scheme and the accent theme. A member can combine any scheme with any theme, which is why they are two collections and not one list of combinations. A frame takes its scheme and its theme from the modes set on it.
- **Semantic colours are named for their role, not their look.** Surfaces: `ground`, `sheet`, `glass`, `control`, `scrim`. Lines: `border`, `glassBorder`. Text and icons: `text`, `textMuted`, `accentText`. Accent: `accent`, `onAccent`. Status: `success`, `warning`, `danger`, each with a `…Soft` background. Halo: `haloAccent`, `haloCool`, `haloDeep`. Fading: `fadeNear`, `fadeMid`, `fadeFar`, `fadeFaint` (opacities, in percent). Map: `mapGround`, `mapGreen`, `mapWater`, `mapBuilding`, `mapStreet`, the greys of a map preview, one value per mode of `Scheme`.
- **`accent` is a fill; accent-coloured text or icons use `accentText`.** On a light ground the accent fill is too pale to read as text, so `accentText` is darker in the light scheme.
- Status colours (playable, something missing, cancelled) are not the accent and do not change with the theme. A status is never carried by colour alone: add an icon or a word.
- **Sizes**: `space…` for gaps and paddings, `radius…`, `controlHeight` and `controlHeightSm` (the smallest touch target), `iconSize`, `borderWidth`, `focusWidth`, `fontSize…`, `fontDisplay` and `fontText`. Read the values in Figma.
- **Text always uses a text style**: `display`, `title`, `heading`, `bodyLarge`, `body`, `bodyStrong`, `label`, `button`, `caption`, `micro`. Their typeface and size are bound to the `Size` variables.
- Text typed in a field is at least 16 px: below that, an iPhone zooms the page when the field takes focus.
- **A new variable** gets a semantic name, explicit scopes (never all of them), the code syntax `var(--name)`, a one-line description, and its swatch on the `Design system` page.
- **A new accent theme is a new mode of `Theme`.** The team's Figma plan (Professional) allows up to 10 modes per collection (checked in October 2026).
- Names are in English and camelCase, the same in Figma and in the CSS (`accent` in Figma, `--accent` in the code).

### Accessibility modes

The six accessibility options of a member (`model/members.md`) combine freely. Three of them are variable modes, so that a frame can be checked with them; the three others cannot be modes and are rules for the code.

- **Text size** is the mode of `TextSize`: six steps, 100 to 200 % by 20. Only text grows: spacing, radii, icons and the height of controls keep their size, so a control gets its height as a minimum, never as a fixed height. A size never grows beyond the display size (40 px), and the display size does not grow: page titles are large enough to read (decided by the owner). Line heights stay in percent and follow. In code every size is in rem, spacing included (decided by the owner): the option never changes the size of the root, but a browser whose own font size was changed scales the whole app, page titles included.
- **The legible font** is the mode `Legible` of `Typeface`: Atkinson Hyperlegible Next for titles and text, in the weights the text styles already use.
- **High contrast** is two more modes of `Scheme`. Text and secondary text reach 7:1 on every surface, lines reach 3:1, `glass` and `control` turn opaque, `onAccent` is black, and the three fields of the halo take the colour of the ground: the halo disappears. It is also applied when the device asks for more contrast.
- **Increased spacing** has no mode, because a line height or a letter spacing bound to a variable is counted in pixels and could not follow the text size. In code: letter spacing 0.12 em, word spacing 0.16 em, line height 1.5 at least, and twice the font size between two paragraphs.
- **Reduced motion** removes animations and transitions of large amplitude; it is also applied when the device asks for it. **Extended timeouts** keep notifications and tooltips on screen until they are closed. Neither changes a still screen.
- A frame takes its modes like its scheme and its theme. The `Members` page has a section of clones under these modes; the card "Accessibility modes" of the `Design system` page shows them side by side.

## Components

- No ready-made component kit, in Figma or in code. The first attempt at this app used one and came out looking like every other app built with it. Components are designed for this app. In code, a library that provides behaviour and accessibility without any styling is fine.
- Look in the library before creating. A new component is justified by a need no existing one covers, not by a slightly different screen.
- Components are named in English, in PascalCase, and carry a description of what they are for. Business components follow `<Object>/<Representation>`.
- What changes the look is a variant (`Kind`, `Size`, `State`); what changes the content is a property (a label, an icon to swap, a part to show or hide).
- A component whose content varies takes it in a slot: `Sheet`, `BottomSheet`, `Dialog`, `Section/Card`. The slot of the component stays empty; each instance fills its own.
- A component that contains another one keeps it as an exposed nested instance (the buttons of a `BottomBar`, the `ListRow` of an `Instrument/Row`): its label and its state are set on the nested instance.
- A component uses only semantic variables.

The base layer today: `Button`, `IconButton`, `TextField` (also the select, with a chevron as trailing icon), `ImageField`, `Checkbox`, `Radio`, `Switch`, `SegmentedControl`, `Slider`, `FilterChip`, `ListRow`, `NavRow`, `SwitchRow`, `Chip`, `Message`, `Avatar`, `ThemeSwatch`, `QuickAction`, `SliderRow`, `AccessibilityOptions`, `Sheet`, `StepIndicator` (two or three steps), `ScreenTop`, `BottomBar`, `TabBar`, `SideNav`, `BottomSheet`, `Dialog`, `Halo`, `ModeBar`, `DropZone`, `Waveform`, `LevelScale`, `Rating` (with `RatingStar`), `Gauge`, `AlertCard`, and the icons. The business objects today: `Instrument/Row`, `Section/Card`, `Section/Badge`, `PictogramChoice`, `Band/Mention`, `Member/Card`, `Member/Row`, `Member/Header`, `Member/Mention`, `Member/TableHeader`, `Member/TableRow`, `Song/Tile`, `Song/Row`, `Song/Card`, `Song/Header`, `Song/Mention`, `Song/TableHeader`, `Song/TableRow`, `Song/Latest`, `Gig/Hero`, `SongFile/Row`, `SongPart/Row`, `SongPart/Track`, `Gig/Card`, `Gig/Picture`, `Gig/Pictures`, `Gig/Header`, `Gig/Meeting`, `Gig/Infos`, `GigSlot/Card`, `GigSlot/WhoComes`, `Attendance/Choices`, `Section/AttendanceRow`, `Setlist/Card`, `SetlistSong/Row`. Base components added with gigs: `ChoiceButton`, `TextArea`, `ListRow` `State=Disabled`, `Chip` `Kind=Info`. The library in Figma is the reference, not this list.

**Icons** come from Iconsax and are named `Icon/<Name>`: 24 px, each a component set with two variants. `Style=Outline` (Iconsax Linear: a 1.5 px stroke with round caps, its stroke bound to `text`) is the icon at rest; `Style=Filled` (Iconsax Bold, its fill bound to `text`) marks the current item. Inside a component an icon is a swappable property, never a variant per icon. To recolour an icon in an instance, set the stroke and the fill of its vectors. After swapping an icon, set them again and look at the result: the override does not always follow the swap.

New icons come from the free set of Iconsax, Linear and Bold, each flattened to its vectors. An icon the free set lacks is drawn in its style and says so in its description (Close, Accessibility, Contrast, Biceps, Check). The free licence of Iconsax forbids redistributing its files: the owner arranges a licence before the code is published, and until then the repository does not hold them as a set.

**The current item** of a `TabBar` or a `ModeBar` shows its filled icon, and its icon and label take the accent (`accent` on the icon, `accentText` on the label). No pill behind it: the shape changes, so the state never rests on colour alone.

**Section pictograms** (`Icon/Trumpet`, `Icon/Saxophone`, `Icon/Trombone`, `Icon/Tuba`, `Icon/Sousaphone`, `Icon/Drum`, `Icon/Flute`, `Icon/Clarinet`) are filled silhouettes drawn by the owner (flute and clarinet were drawn after his): one vector, its fill bound to `text`. `Icon/Music` is the fallback of a section without one. To recolour a pictogram in an instance, set the fill of its vector, not its stroke.

On the accent colour, an icon or a pictogram takes `onAccent`, never `text`: light on accent gives 1.6 to 2.5:1, `onAccent` gives 6.6 to 9.5:1 across the four themes.

**Patterns**, settled with the Install, Members and Songs features. Reuse them before inventing another way:

- Choosing several in a list: rows with a checkbox, each row keeping its own actions at the end. Choosing one: rows with a radio (`ListRow`, `Leading=Unselected` / `Selected`). The line that adds an item is the last row of the list (`ListRow`, `Leading=Add`).
- Editing one item of a list, or choosing one value among many: a `BottomSheet` over the `scrim` on a phone or a tablet, a `Dialog` on a desktop. Not another screen.
- The main action of a screen lives in a `BottomBar`: glass and pinned when the screen is longer than the phone, plain when the screen fits. The caption above the button counts what was chosen, or says why the button is off. On a desktop the actions end the content, aligned to its right: the button that moves forward is the rightmost, and any other action sits on its left. The same holds in a `Dialog`.
- A flow in steps shows where the member is (`StepIndicator`: "Étape 2 sur 3" and a progress line) and offers a way back on every step.
- Choosing an instrument: a flat list of `Instrument/Row`, in the order of the band. Sections are not used as group titles: many hold a single instrument, and the section follows from the instrument anyway.
- A group of fields, a list or a summary sits on a `Sheet`.
- A form in error says how many fields are wrong in one `Message` at the top, and what is wrong under each field.
- A setting that has no consequence beyond itself (appearance, accessibility) applies at once, through a `Switch`, a `SegmentedControl` or a `Slider`, with no save button. A form that changes what others see or how the member signs in (profile, password, name of the band) keeps a `BottomBar` with its button.
- A status in a list is a `Chip`, shown only when it is not the ordinary one: an active member has none. The chip and any mark sit at the end of the row: a status never moves the content, and every row keeps the same height. From a text size of 160 % the chip goes under the second line of the row, so that the name keeps its room.
- Files come in through a `DropZone`: dropped in bulk or chosen, sorted by the rules of the model, with as few questions as possible. Large at the top of an import, Compact in a sheet. Editing the files of an object is the same drop zone, never a field per file: the files about to be replaced are listed, each with an undo, and saved with the form.
- A destructive action always asks first, in a `BottomSheet` (a `Dialog` on a desktop): what goes with it, that it cannot be undone, and the gentler way when there is one ("Le passer en Abandonné"). The destructive button is `Danger` and names exactly what it does.
- An empty list or a search with no result is a `Sheet` with an icon, a title and one line that says what to do; the action, if any, is a button under it. A loading list shows grey rows of the shape of its rows. An error says what happened and what to do, in a `Message`, with a way to retry.
- An average the band gives is a `Rating` (stars, rounded to the half, with the value and the number of answers); a share of a whole is a `Gauge` with the numbers in words. A member gives a level with `LevelScale`.
- An action that cannot be done stays visible, disabled, with the reason written under it and the numbers that explain it (a section that still has three instruments). A choice that cannot be made in a list is `ListRow` `State=Disabled`, its reason as its detail (a status no longer possible).
- When the text grows, a row lets its trailing chip or button go under the text rather than cut a word: rows wrap, the text keeps a minimum width (160 px in most rows).
- Several pictures of one object (the costumes of a gig) share its picture, split by diagonals with a line of ground between them; three at most.
- A screen used while playing (the live setlist) reads like song lyrics: the current item on a fixed focus line, the ones past fading upwards, the ones to come smaller and fainter (the opacities `fadeNear`, `fadeMid`, `fadeFar`, `fadeFaint` of `Scheme`, stronger in high contrast). It keeps the screen on, has one forward button in the lower half, corrects by scrolling, and carries no explanatory text.
- A map is a still preview, never an embedded map service: drawn by MapLibre from the open vector tiles of the OpenStreetMap Foundation, in the greys of the map variables, with streets, water, parks and buildings only: no names, no shops. The credit “© OpenStreetMap” stays visible at the bottom right; two glass `IconButton` at the top right zoom in and out (`Icon/SearchZoomIn`, `Icon/SearchZoomOut`); tapping the map opens the maps app of the device, as “Y aller” does. The street names are read in that app.
- The top-right button of a screen opens a menu (`Icon/More`) only when it holds several actions. When its one action is deleting what the screen edits, it is that action (`Icon/Trash`, `IconButton` `Kind=Glass`), which asks first. A member with no action there has no button.
- What the app learns for an object (the phrases the dictation heard for a song) is shown where that object is edited: one row whose detail lists it, opening a `BottomSheet` built like the known spellings, each item deleted with the trash, the last row adding one by hand. The sheet saves at once.
- A push notification reads on its own: it names its position (“4/6 · Prochain : Valerie”), because on an iPhone a web app cannot replace a notification and they pile up, the newest on top. The last one says plainly that it is over.
- Photos of members in the file are stand-ins, blurred on purpose (`Design system` page, `Avatar` card). No real person appears in the file.
- A list of members is a grid of `Member/Card` in alphabetical order of the nickname: a round photo with the pictogram of the section as a badge, the nickname, the instrument. Two columns on a phone, four on a small desktop. The card has the radius of a group of controls (`radiusMd`), less round than a sheet. A power member is marked with `Icon/Biceps` beside the nickname, never with an emoji.
- `Attendance/Choices` keeps 8 between its answers in Small as in Large.
- A panel of content pinned over a screen that scrolls (`Song/Latest`) is opaque, the ground with a border line, never glass: glass is for navigation and controls.
- A filter that narrows a list is a `FilterChip`, a toggle that shows a tick when it is on. Filters are off when the screen opens.
- A summary of settings is made of `NavRow` and stays short: settings that belong together share one entry (name, logo, accent colour and language of the band under "Apparence").
- Every screen starts with `ScreenTop`: back button, step, one action, the band, the title and its subtitle, each shown or hidden by a property. It is the only place where the top margin of a screen is set.
- Accessibility is never a forced step. Every screen before sign-in, onboarding included, shows a button "Accessibilité" in `ScreenTop`, which opens the options in a `BottomSheet`. After sign-in the options are in the settings. In both places they are the same component, `AccessibilityOptions`.

## Words in the interface

- Speak to the member with "tu". Use the band's own words in the French locale (fanfaron, plan, brasser), and plain equivalents in the translation keys and in other locales.
- The tone is friendly and can joke, in one short line, where the member has a second to smile: an empty screen, a reminder, a nudge to answer. Example from the study: "Il te reste dimanche à répondre. Indice : il y a un apéro."
- Clarity wins over the joke. An error says what happened and what to do next, with no humour that delays the answer. A destructive action is named for exactly what it does.
- A button says what it does ("Lire ma partie", not "Valider"), and keeps the same name through the whole flow.
- A field has its label above it, never inside. The hint under it gives the rule before the member breaks it.
- Sentence case everywhere. No all-caps labels.
- The names the band gives (sections, costumes, slots) are shown as they are, never put in the plural or declined: “Il ne manque plus que Souba”, “personne en Souba”, “Manque : Percu, Souba”. A member is named by their nickname.
- French copy takes a no-break space before `?`, `!`, `;` and `:`: without it, a title leaves its question mark alone on a line.

## Check before showing a screen

For an exploration, the first, third and fifth lines are enough. For a rebuilt screen, all of them:

- Every colour, radius and spacing comes from a variable, and every text uses a text style.
- Every business object on the screen is an instance of one of its representations.
- The screen holds in the dark and the light scheme, and with at least two accent themes.
- The screen holds with text at 200 %, with the legible font and in the two high contrast modes: clone it and set the modes.
- Text contrast is at least 4.5:1 (3:1 from 24 px), including muted text, text on the accent and text over a halo.
- Real content was used: a long song title, a compound first name, a gig with three slots, a name that wraps on two lines.
- Touch targets are at least 44 px; the main action sits in the lower half.
- The empty, loading and error states exist.
- The screen exists at the four widths.
- No text is baked into an image; every string has a translation key.
- Nothing on the screen names this band, its logo or its colours outside the instance settings.

## Working in Figma

- Load the `figma-use` skill before any write in Figma, `figma-generate-library` for variables and components, `figma-generate-design` for screens.
- Read first, write second, and say what is about to be written before doing it. The owner works in the same file and may have changed it since the last conversation.
- Work in small steps and look at the result after each write. A screen that was never looked at is not finished. If the screenshot link cannot be downloaded, take the capture from inside the script (`await node.screenshot()`).
- After building, run a script that lists what is not bound: spacing, fills, strokes and radii without a variable, text without a style. Fix what it finds before showing the screens.
- Set the text of an instance through its properties, never by typing into its layers. Fill a slot by appending to the slot of the instance.
- An empty slot keeps the height it was given: size it small in the component, or the component shows a hole.
- An instance placed in a slot can be drawn at the width of its component although its layout says it fills the slot (a border that stops halfway, a hint cut off). Look at a screenshot of every screen built by script; resizing the instance once redraws it.
- Never overwrite a change the owner made by hand. If it conflicts with the task, ask.
- A picture put into a component as a layer follows the size of the instance only if its constraints are Scale: otherwise it stays in a corner at its first size.
- A mask does not apply reliably to an instance inside a component: to crop a picture to a shape, fill the shape with the picture instead.
- An opacity bound to a variable is counted in percent (60, not 0.6).
- A frame cloned by script loses the contents of the slots of its instances: rebuild them in the clone. A variant cloned by script loses the bindings of its properties: copy `componentPropertyReferences` from its sibling.
- After the width of a column changes, instances inside it can keep their old layout until they are resized once: resize them, and look at a screenshot.
- `haloCool` and the other halo colours are never used outside the halo: they become the ground in high contrast.
- A script can create an image from bytes (`figma.createImage(figma.base64Decode(…))`): PNG and JPEG only, WebP is refused. Compare the hash it returns with the SHA-1 of the file to be sure the bytes arrived whole.
- A swatch that shows another accent theme is a `ThemeSwatch` with that mode of `Theme` set on the instance: no colour is typed.
- An icon made from an SVG is flattened to one vector (`figma.flatten`) before it goes into its component. `flatten` keeps the absolute position: set `x` and `y` again afterwards.
- Resizing a layer nested in an instance by script does not hold: a size that changes from one instance to the next (the fill of a `Gauge`) is a variant.
- A frame cloned from a screen can carry a child set to fill vertically inside a container that hugs: check the heights after a clone, and set such children to hug.
- A paint set on a vector nested in an instance must carry the resolved colour as well as the variable: read it with `variable.resolveForConsumer(node)`, then bind. A paint built with a placeholder colour is drawn with the placeholder, although the binding is there.
- An instance nested three levels deep does not redraw a component swapped inside it: give the content a free slot instead of a swap.
- A nested instance whose component was swapped is not found by its layer name reliably: look for it by its main component (`mainComponent.name.startsWith('Icon/')`).
- After the children of a slot are replaced, the slot can keep its old height and the old positions: put the new children in one frame, and check the height in a screenshot. Inside a slot, `children.indexOf(node)` fails: compare ids.
- An auto-layout frame that hugs keeps a width of 100 px when all its children are hidden: marks that can all be absent go directly in the row, not in a group of their own.
- A line height or a letter spacing bound to a variable is counted in pixels, even when the text had it in percent. Leave them in percent, unbound, wherever they have to follow the font size.
- Before a script sets a mode of `Typeface` on a frame, or changes a typeface variable, it loads every family the variable can take, in every weight the text styles use.

## Keeping this skill current

This file is the reference for design decisions, and it is adjusted with the owner as the work goes: many decisions will come from what he changes in Figma, not from a conversation. When a conversation settles a decision, or when Figma shows that one has changed, propose the exact line to add or replace, with its reason, and the section it goes in. When a rule here turns out wrong in use, say so and propose the change, do not work around it silently. The file changes through a commit, like any other.