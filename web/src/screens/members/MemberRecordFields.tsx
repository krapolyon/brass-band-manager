import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageField } from '../../components/ImageField.tsx';
import { InstrumentRow } from '../../components/InstrumentRow.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { PickerField, SelectField, TextField } from '../../components/TextField.tsx';
import { countryOptions } from './countries.ts';
import { type PreparedPhoto, preparePhoto } from './photo.ts';
import type { RecordDraft, RecordField } from './record.ts';
import './members.css';

/** The photo of a record while its form is open. */
export type PhotoDraft = {
  /** The address of the photo already saved; null when there is none. */
  saved: string | null;
  /** A new photo, prepared for the API. */
  chosen: PreparedPhoto | null;
  /** True when the member took the saved photo away. */
  isRemoved: boolean;
};

export const noPhoto: PhotoDraft = { saved: null, chosen: null, isRemoved: false };

type Props = {
  /**
   * Who the form speaks to: the member themself ("ton identifiant"), an
   * invited member ("on a rempli ce qu'on savait"), or whoever manages
   * another member ("son identifiant"); `invite` is the shorter form that
   * creates an invitation, without the address.
   */
  voice: 'self' | 'invited' | 'other' | 'invite';
  draft: RecordDraft;
  onChange: (changes: Partial<RecordDraft>) => void;
  errors: Partial<Record<RecordField, string>>;
  /** The instruments of the band, flat, in its order. */
  instruments: { id: number; name: string }[];
  photo: PhotoDraft;
  onPhoto: (photo: PhotoDraft) => void;
  /** Why the email cannot be changed here: shown under the field, which is then read-only. */
  emailLocked?: string;
};

const NAME_MAX_LENGTH = 50;

// The fields of the record of a member, on their sheets, as Figma draws them
// on "Onboarding — 1 your details", "Settings — profile", "Manage — member"
// and "Manage — invite". Layout only: every field is a component of the
// design system.
export function MemberRecordFields({
  voice,
  draft,
  onChange,
  errors,
  instruments,
  photo,
  onPhoto,
  emailLocked,
}: Props) {
  const { t, i18n } = useTranslation();
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [isPhotoUnreadable, setPhotoUnreadable] = useState(false);
  const instrument = instruments.find((other) => other.id === draft.instrumentId);
  const isAbout = voice === 'other' || voice === 'invite';

  const choosePhoto = async (file: File | null) => {
    setPhotoUnreadable(false);
    if (file === null) {
      onPhoto({ ...photo, chosen: null, isRemoved: true });
      return;
    }
    try {
      const chosen = await preparePhoto(file);
      onPhoto({ ...photo, chosen, isRemoved: false });
    } catch {
      // Not an image the browser reads: the photo in place stays.
      setPhotoUnreadable(true);
    }
  };

  const contact = (
    <>
      <TextField
        label={t('member.email.label')}
        hint={emailLocked ?? t(`member.email.hint.${voice}`)}
        readOnly={emailLocked !== undefined}
        error={errors.email}
        type="email"
        name="email"
        autoComplete={isAbout ? 'off' : 'email'}
        autoCapitalize="none"
        spellCheck={false}
        value={draft.email}
        onChange={(event) => onChange({ email: event.target.value })}
      />
      <TextField
        label={t('member.mobilePhone.label')}
        hint={voice === 'invited' || voice === 'invite' ? t('member.optional') : undefined}
        error={errors.mobilePhone}
        type="tel"
        name="mobilePhone"
        autoComplete={isAbout ? 'off' : 'tel'}
        value={draft.mobilePhone}
        onChange={(event) => onChange({ mobilePhone: event.target.value })}
      />
    </>
  );

  const address = (
    <>
      <TextField
        label={t('member.streetAddress.label')}
        placeholder={t('member.streetAddress.placeholder')}
        error={errors.streetAddress}
        name="streetAddress"
        autoComplete={isAbout ? 'off' : 'street-address'}
        value={draft.streetAddress}
        onChange={(event) => onChange({ streetAddress: event.target.value })}
      />
      <div className="members-pair">
        <TextField
          label={t('member.postalCode.label')}
          error={errors.postalCode}
          name="postalCode"
          autoComplete={isAbout ? 'off' : 'postal-code'}
          value={draft.postalCode}
          onChange={(event) => onChange({ postalCode: event.target.value })}
        />
        <TextField
          label={t('member.city.label')}
          error={errors.city}
          name="city"
          autoComplete={isAbout ? 'off' : 'address-level2'}
          value={draft.city}
          onChange={(event) => onChange({ city: event.target.value })}
        />
      </div>
      <SelectField
        label={t('member.countryCode.label')}
        value={draft.countryCode}
        onChange={(countryCode) => onChange({ countryCode })}
        options={[
          { value: '', label: t('member.countryCode.none') },
          ...countryOptions(i18n.language),
        ]}
      />
      <TextField
        label={t('member.addressInstructions.label')}
        placeholder={t('member.addressInstructions.placeholder')}
        error={errors.addressInstructions}
        name="addressInstructions"
        autoComplete="off"
        value={draft.addressInstructions}
        onChange={(event) => onChange({ addressInstructions: event.target.value })}
      />
    </>
  );

  return (
    <>
      <Sheet title={t('member.inTheBand')}>
        <ImageField
          label={t('member.photo.label')}
          hint={t(`member.photo.hint.${voice}`)}
          error={isPhotoUnreadable ? t('member.photo.unreadable') : undefined}
          accept="image/jpeg,image/png,image/webp"
          // The photo is shown as it will be kept: cropped to a square.
          value={null}
          current={photo.isRemoved ? null : (photo.chosen?.preview ?? photo.saved)}
          onChange={choosePhoto}
        />
        <TextField
          label={t('member.nickname.label')}
          hint={t('member.nickname.hint')}
          error={errors.nickname}
          name="nickname"
          autoComplete={isAbout ? 'off' : 'nickname'}
          maxLength={NAME_MAX_LENGTH}
          value={draft.nickname}
          onChange={(event) => onChange({ nickname: event.target.value })}
        />
        <div className="FlowLayout-pair">
          <TextField
            label={t('member.firstName.label')}
            error={errors.firstName}
            name="firstName"
            autoComplete={isAbout ? 'off' : 'given-name'}
            maxLength={NAME_MAX_LENGTH}
            value={draft.firstName}
            onChange={(event) => onChange({ firstName: event.target.value })}
          />
          <TextField
            label={t('member.lastName.label')}
            error={errors.lastName}
            name="lastName"
            autoComplete={isAbout ? 'off' : 'family-name'}
            maxLength={NAME_MAX_LENGTH}
            value={draft.lastName}
            onChange={(event) => onChange({ lastName: event.target.value })}
          />
        </div>
        <PickerField
          label={t('member.instrument.label')}
          error={errors.instrumentId}
          value={instrument?.name ?? ''}
          placeholder={t('member.instrument.placeholder')}
          onPick={() => setPickerOpen(true)}
        />
      </Sheet>

      {voice === 'self' || voice === 'invited' ? (
        <>
          <Sheet title={t('member.toReachYou')}>{contact}</Sheet>
          <Sheet title={t('member.home.title')}>
            {voice === 'invited' && (
              <p className="members-note textCaption">{t('member.home.hint')}</p>
            )}
            {address}
          </Sheet>
        </>
      ) : (
        <Sheet title={t('member.contact')}>
          {contact}
          {voice === 'other' && address}
        </Sheet>
      )}

      <Panel
        open={isPickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('member.instrument.label')}
      >
        {instruments.map((other) => (
          <InstrumentRow
            key={other.id}
            name={other.name}
            choice={other.id === draft.instrumentId ? 'current' : 'none'}
            onPress={() => {
              onChange({ instrumentId: other.id });
              setPickerOpen(false);
            }}
          />
        ))}
      </Panel>
    </>
  );
}
