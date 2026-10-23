import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useBand } from '../../band.ts';
import { ChoiceButton } from '../../components/ChoiceButton.tsx';
import { ChoiceGroup } from '../../components/ChoiceGroup.tsx';
import { FilterChip } from '../../components/FilterChip.tsx';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { SelectField, TextField } from '../../components/TextField.tsx';
import { useSections } from '../../members.ts';
import {
  newSongPositions,
  type SetPosition,
  type Song,
  type SongMood,
  type SongRecord,
  type SongStatus,
  setPositions,
  songMoods,
  songStatuses,
} from '../../songs.ts';
import { duration } from './format.ts';

// The record of a song as its form holds it: every field is a text, as it is
// typed. Used by the second step of the import and by the edit screen.
export type SongDraft = {
  name: string;
  originalTitle: string;
  originalArtist: string;
  copyright: string;
  bpm: string;
  status: SongStatus;
  versionOn: string;
  versionNote: string;
  clipUrl: string;
  discordChannelId: string;
  /** What the setlist generator reads (model/songs.md, "Setlist attributes"). m:ss as typed. */
  duration: string;
  /** The length was typed by hand: a MIDI file dropped afterwards does not replace it. */
  isDurationTyped: boolean;
  inRepertoireOn: string;
  mood: SongMood;
  positions: SetPosition[];
  tiringSectionIds: number[];
  trickySectionIds: number[];
};

/** A length typed as m:ss, in seconds; null when empty; NaN when it is not one. */
export function secondsOf(text: string): number | null {
  const typed = text.trim();
  if (typed === '') return null;
  const found = /^(\d{1,2}):([0-5]\d)$/.exec(typed);
  return found ? Number(found[1]) * 60 + Number(found[2]) : Number.NaN;
}

export function draftOf(song?: Song): SongDraft {
  return {
    name: song?.name ?? '',
    originalTitle: song?.originalTitle ?? '',
    originalArtist: song?.originalArtist ?? '',
    copyright: song?.copyright ?? '',
    bpm: song?.bpm?.toString() ?? '',
    status: song?.status ?? 'PROPOSED',
    versionOn: song?.versionOn ?? '',
    versionNote: song?.versionNote ?? '',
    clipUrl: song?.clipUrl ?? '',
    discordChannelId: song?.discordChannelId ?? '',
    duration: song?.durationSeconds ? duration(song.durationSeconds) : '',
    // A length already saved is not replaced by a file either.
    isDurationTyped: (song?.durationSeconds ?? null) !== null,
    inRepertoireOn: song?.inRepertoireOn ?? '',
    mood: song?.mood ?? 'MEDIUM',
    positions: song?.positions ?? newSongPositions,
    tiringSectionIds: song?.tiringSectionIds ?? [],
    trickySectionIds: song?.trickySectionIds ?? [],
  };
}

/** What the API receives: the whole record, an empty field as null. */
export function recordOf(draft: SongDraft): SongRecord {
  const orNull = (text: string) => (text.trim() === '' ? null : text.trim());
  return {
    name: draft.name,
    originalTitle: draft.originalTitle,
    originalArtist: draft.originalArtist,
    copyright: orNull(draft.copyright),
    status: draft.status,
    // Not a whole number: sent as it is, and refused by the API with the others.
    bpm: orNull(draft.bpm) === null ? null : Number(draft.bpm),
    versionOn: orNull(draft.versionOn),
    versionNote: orNull(draft.versionNote),
    clipUrl: orNull(draft.clipUrl),
    discordChannelId: orNull(draft.discordChannelId),
    // Not a length: sent as it is, and refused by the API with the others.
    durationSeconds: secondsOf(draft.duration),
    inRepertoireOn: orNull(draft.inRepertoireOn),
    mood: draft.mood,
    positions: draft.positions,
    tiringSectionIds: draft.tiringSectionIds,
    trickySectionIds: draft.trickySectionIds,
  };
}

/** Field => what is wrong with it, in the words of the API (required, tooLong, invalid, duplicate). */
export type SongErrors = Partial<Record<keyof SongDraft | 'durationSeconds', string>>;

/** What the form can tell before sending. The API checks everything again. */
export function checkDraft(draft: SongDraft): SongErrors {
  const errors: SongErrors = {};
  for (const field of ['name', 'originalTitle', 'originalArtist'] as const) {
    if (draft[field].trim() === '') errors[field] = 'required';
  }
  if (draft.bpm.trim() !== '' && !/^\d+$/.test(draft.bpm.trim())) errors.bpm = 'invalid';
  const seconds = secondsOf(draft.duration);
  if (seconds !== null && !(seconds >= 10 && seconds <= 1200)) errors.duration = 'invalid';
  return errors;
}

type Props = {
  draft: SongDraft;
  onChange: (draft: SongDraft) => void;
  errors: SongErrors;
  /** The record of a new song: the name was taken from the MuseScore file. */
  isNew?: boolean;
  /** The card of the files, which the edit screen shows after the version. */
  files?: ReactNode;
  /** The card of the dictation, which the edit screen shows after "Le morceau". */
  afterSong?: ReactNode;
};

/** The fields of the draft typed as text. */
type TextKey = {
  [Field in keyof SongDraft]: SongDraft[Field] extends string ? Field : never;
}[keyof SongDraft];

/** Toggles a value in a list, keeping the order of `all`. */
function toggled<T>(list: T[], value: T, on: boolean, all: readonly T[]): T[] {
  const next = on ? [...list, value] : list.filter((one) => one !== value);
  return all.filter((one) => next.includes(one));
}

// Figma: Songs / Edit and Songs / Import — step 2: the cards of the record
// of a song. "Pour les setlists" (0.3.0, issue #25) comes after the version:
// what the setlist generator reads.
export function SongFormFields({ draft, onChange, errors, isNew, files, afterSong }: Props) {
  const { t } = useTranslation();
  const moodGroup = useId();
  const hasDiscord = useBand().data?.hasDiscord ?? false;
  const sections = useSections().data ?? [];
  const sectionIds = sections.map((section) => section.id);
  const set = (field: TextKey) => (value: string) => onChange({ ...draft, [field]: value });
  const typed = (field: TextKey) => ({
    value: draft[field],
    onChange: (event: { target: { value: string } }) => set(field)(event.target.value),
  });

  // The message of a field: its own when the fault is particular to it.
  const message = (field: keyof SongErrors): string | undefined => {
    const problem = errors[field];
    if (!problem) return undefined;
    if (field === 'positions') return t('songs.form.error.positions');
    if (problem === 'required') return t('songs.form.error.required');
    if (problem === 'tooLong') return t('songs.form.error.tooLong');
    if (field === 'name' && problem === 'duplicate') return t('songs.form.error.nameDuplicate');
    if (field === 'discordChannelId') {
      return t(
        problem === 'duplicate'
          ? 'songs.form.error.discordDuplicate'
          : problem === 'otherServer'
            ? 'discord.link.otherServer'
            : 'discord.link.invalid',
      );
    }
    if (field === 'duration' || field === 'durationSeconds') return t('songs.form.error.duration');
    if (field === 'inRepertoireOn') return t('songs.form.error.inRepertoireOn');
    if (field === 'bpm') return t('songs.form.error.bpm');
    if (field === 'versionOn') return t('songs.form.error.versionOn');
    if (field === 'clipUrl') return t('songs.form.error.clipUrl');
    return t('songs.form.error.invalid');
  };
  const count = Object.keys(errors).length;

  return (
    <>
      {count > 0 && <Message kind="danger">{t('songs.form.errors', { count })}</Message>}
      <Sheet title={t('songs.form.song')}>
        <TextField
          label={t('songs.form.name')}
          hint={t(isNew ? 'songs.form.nameHintImport' : 'songs.form.nameHint')}
          error={message('name')}
          maxLength={80}
          required
          {...typed('name')}
        />
        <TextField
          label={t('songs.form.originalTitle')}
          error={message('originalTitle')}
          maxLength={150}
          required
          {...typed('originalTitle')}
        />
        <TextField
          label={t('songs.form.originalArtist')}
          error={message('originalArtist')}
          maxLength={150}
          required
          {...typed('originalArtist')}
        />
        <TextField
          label={t('songs.form.copyright')}
          hint={t('songs.form.copyrightHint')}
          error={message('copyright')}
          maxLength={200}
          {...typed('copyright')}
        />
        <TextField
          label={t('songs.form.bpm')}
          hint={t('songs.form.bpmHint')}
          error={message('bpm')}
          inputMode="numeric"
          {...typed('bpm')}
        />
        <SelectField
          label={t('songs.form.status')}
          value={draft.status}
          onChange={(status) => onChange({ ...draft, status: status as SongStatus })}
          options={songStatuses.map((status) => ({
            value: status,
            label: t(`songs.status.${status}`),
          }))}
        />
      </Sheet>
      {afterSong}
      <Sheet title={t('songs.form.version')}>
        <TextField
          type="date"
          label={t('songs.form.versionOn')}
          hint={t('songs.form.versionOnHint')}
          error={message('versionOn')}
          {...typed('versionOn')}
        />
        <TextField
          label={t('songs.form.versionNote')}
          error={message('versionNote')}
          maxLength={1000}
          {...typed('versionNote')}
        />
      </Sheet>
      <Sheet title={t('songs.form.setlists.title')}>
        <p className="songs-formNote textCaption">{t('songs.form.setlists.lead')}</p>
        <TextField
          label={t('songs.form.setlists.duration')}
          hint={t('songs.form.setlists.durationHint')}
          error={message('duration') ?? message('durationSeconds')}
          // Not "numeric": the keypad of an iPhone has no colon.
          inputMode="text"
          placeholder="3:52"
          value={draft.duration}
          onChange={(event) =>
            onChange({ ...draft, duration: event.target.value, isDurationTyped: true })
          }
        />
        <ChoiceGroup label={t('songs.form.setlists.mood')} hint={t('songs.form.setlists.moodHint')}>
          <div className="songs-choices" role="radiogroup">
            {songMoods.map((mood) => (
              <ChoiceButton
                key={mood}
                size="small"
                name={moodGroup}
                checked={draft.mood === mood}
                onChange={() => onChange({ ...draft, mood })}
              >
                {t(`songs.mood.${mood}`)}
              </ChoiceButton>
            ))}
          </div>
        </ChoiceGroup>
        <ChoiceGroup
          label={t('songs.form.setlists.positions')}
          hint={t('songs.form.setlists.positionsHint')}
          error={message('positions')}
        >
          {setPositions.map((position) => (
            <ChoiceButton
              key={position}
              size="small"
              multiple
              checked={draft.positions.includes(position)}
              onChange={(event) =>
                onChange({
                  ...draft,
                  positions: toggled(draft.positions, position, event.target.checked, setPositions),
                })
              }
            >
              {t(`songs.position.${position}`)}
            </ChoiceButton>
          ))}
        </ChoiceGroup>
        {(['tiringSectionIds', 'trickySectionIds'] as const).map((field) => (
          <ChoiceGroup
            key={field}
            label={t(`songs.form.setlists.${field}`)}
            hint={t(`songs.form.setlists.${field}Hint`)}
          >
            {sections.map((section) => (
              <FilterChip
                key={section.id}
                pictogram={section.icon}
                pressed={draft[field].includes(section.id)}
                onChange={(on) =>
                  onChange({ ...draft, [field]: toggled(draft[field], section.id, on, sectionIds) })
                }
              >
                {section.name}
              </FilterChip>
            ))}
          </ChoiceGroup>
        ))}
        <TextField
          type="date"
          label={t('songs.form.setlists.inRepertoireOn')}
          hint={t('songs.form.setlists.inRepertoireOnHint')}
          error={message('inRepertoireOn')}
          clear={{
            label: t('songs.form.setlists.inRepertoireOnClear'),
            onClear: () => onChange({ ...draft, inRepertoireOn: '' }),
          }}
          {...typed('inRepertoireOn')}
        />
      </Sheet>
      {files}
      {/* Without a Discord server, nothing of Discord: the card is "Clip"
          (model/songs.md v1.9, "Display"; Figma, Songs, section 18, #49). */}
      <Sheet title={t(hasDiscord ? 'songs.form.clipAndDiscord' : 'songs.form.clip')}>
        <TextField
          type="url"
          label={t('songs.form.clipUrl')}
          placeholder={t('songs.form.clipPlaceholder')}
          hint={t('songs.form.clipHint')}
          error={message('clipUrl')}
          {...typed('clipUrl')}
        />
        {/* Without a server, no channel can be typed (model/songs.md, "Instance settings"). */}
        {hasDiscord && (
          <TextField
            label={t('songs.form.discord')}
            placeholder={t('discord.link.placeholder')}
            hint={t('songs.form.discordHint')}
            error={message('discordChannelId')}
            inputMode="url"
            autoComplete="off"
            {...typed('discordChannelId')}
          />
        )}
      </Sheet>
    </>
  );
}
