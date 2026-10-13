import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { SelectField, TextField } from '../../components/TextField.tsx';
import { type Song, type SongRecord, type SongStatus, songStatuses } from '../../songs.ts';

// The record of a song as its form holds it: every field is a text, as it is
// typed. Used by the second step of the import and by the edit screen.
export type SongDraft = {
  name: string;
  originalTitle: string;
  originalArtist: string;
  bpm: string;
  status: SongStatus;
  versionOn: string;
  versionNote: string;
  clipUrl: string;
  discordChannelId: string;
};

export function draftOf(song?: Song): SongDraft {
  return {
    name: song?.name ?? '',
    originalTitle: song?.originalTitle ?? '',
    originalArtist: song?.originalArtist ?? '',
    bpm: song?.bpm?.toString() ?? '',
    status: song?.status ?? 'PROPOSED',
    versionOn: song?.versionOn ?? '',
    versionNote: song?.versionNote ?? '',
    clipUrl: song?.clipUrl ?? '',
    discordChannelId: song?.discordChannelId ?? '',
  };
}

/** What the API receives: the whole record, an empty field as null. */
export function recordOf(draft: SongDraft): SongRecord {
  const orNull = (text: string) => (text.trim() === '' ? null : text.trim());
  return {
    name: draft.name,
    originalTitle: draft.originalTitle,
    originalArtist: draft.originalArtist,
    status: draft.status,
    // Not a whole number: sent as it is, and refused by the API with the others.
    bpm: orNull(draft.bpm) === null ? null : Number(draft.bpm),
    versionOn: orNull(draft.versionOn),
    versionNote: orNull(draft.versionNote),
    clipUrl: orNull(draft.clipUrl),
    discordChannelId: orNull(draft.discordChannelId),
  };
}

/** Field => what is wrong with it, in the words of the API (required, tooLong, invalid, duplicate). */
export type SongErrors = Partial<Record<keyof SongDraft, string>>;

/** What the form can tell before sending. The API checks everything again. */
export function checkDraft(draft: SongDraft): SongErrors {
  const errors: SongErrors = {};
  for (const field of ['name', 'originalTitle', 'originalArtist'] as const) {
    if (draft[field].trim() === '') errors[field] = 'required';
  }
  if (draft.bpm.trim() !== '' && !/^\d+$/.test(draft.bpm.trim())) errors.bpm = 'invalid';
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

// Figma: Songs / Edit and Songs / Import — step 2: the three cards of the
// record of a song.
export function SongFormFields({ draft, onChange, errors, isNew, files, afterSong }: Props) {
  const { t } = useTranslation();
  const set = (field: keyof SongDraft) => (value: string) => onChange({ ...draft, [field]: value });
  const typed = (field: keyof SongDraft) => ({
    value: draft[field],
    onChange: (event: { target: { value: string } }) => set(field)(event.target.value),
  });

  // The message of a field: its own when the fault is particular to it.
  const message = (field: keyof SongDraft): string | undefined => {
    const problem = errors[field];
    if (!problem) return undefined;
    if (problem === 'required') return t('songs.form.error.required');
    if (problem === 'tooLong') return t('songs.form.error.tooLong');
    if (field === 'name' && problem === 'duplicate') return t('songs.form.error.nameDuplicate');
    if (field === 'discordChannelId') {
      return t(
        problem === 'duplicate' ? 'songs.form.error.discordDuplicate' : 'songs.form.error.discord',
      );
    }
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
      {files}
      <Sheet title={t('songs.form.clipAndDiscord')}>
        <TextField
          type="url"
          label={t('songs.form.clipUrl')}
          placeholder={t('songs.form.clipPlaceholder')}
          hint={t('songs.form.clipHint')}
          error={message('clipUrl')}
          {...typed('clipUrl')}
        />
        <TextField
          label={t('songs.form.discord')}
          placeholder={t('songs.form.discordPlaceholder')}
          hint={t('songs.form.discordHint')}
          error={message('discordChannelId')}
          inputMode="numeric"
          {...typed('discordChannelId')}
        />
      </Sheet>
    </>
  );
}
