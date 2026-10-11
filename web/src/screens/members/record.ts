import { useTranslation } from 'react-i18next';
import { phoneForDisplay, toInternational } from './phone.ts';

// The record of a member as a form holds it, and as the API receives it
// (api/src/Members/MemberInput.php). The same form serves an invited member,
// a member who edits their profile and whoever manages members.

/** What the API holds and answers. */
export type MemberRecord = {
  nickname: string;
  firstName: string;
  lastName: string;
  email: string;
  instrumentId: number;
  mobilePhone: string | null;
  streetAddress: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string | null;
  addressInstructions: string | null;
};

/** What the form holds: every field as it is typed. */
export type RecordDraft = {
  nickname: string;
  firstName: string;
  lastName: string;
  email: string;
  instrumentId: number | null;
  /** As the member reads and types it: "06 12 34 56 78". */
  mobilePhone: string;
  streetAddress: string;
  postalCode: string;
  city: string;
  countryCode: string;
  addressInstructions: string;
};

export type RecordField = keyof RecordDraft;

export const emptyDraft: RecordDraft = {
  nickname: '',
  firstName: '',
  lastName: '',
  email: '',
  instrumentId: null,
  mobilePhone: '',
  streetAddress: '',
  postalCode: '',
  city: '',
  countryCode: '',
  addressInstructions: '',
};

/** The country a phone number typed without a prefix belongs to. */
const phoneCountry = (draft: { countryCode: string | null }, bandCountry: string) =>
  draft.countryCode || bandCountry;

export function draftOf(member: MemberRecord, bandCountry: string): RecordDraft {
  return {
    nickname: member.nickname,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    instrumentId: member.instrumentId,
    mobilePhone: phoneForDisplay(member.mobilePhone, phoneCountry(member, bandCountry)),
    streetAddress: member.streetAddress ?? '',
    postalCode: member.postalCode ?? '',
    city: member.city ?? '',
    countryCode: member.countryCode ?? '',
    addressInstructions: member.addressInstructions ?? '',
  };
}

/** What is sent to the API. Call it once the draft has no error. */
export function recordOf(draft: RecordDraft, bandCountry: string): MemberRecord {
  const text = (value: string) => (value.trim() === '' ? null : value.trim());
  return {
    nickname: draft.nickname.trim(),
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    email: draft.email.trim(),
    instrumentId: draft.instrumentId ?? 0,
    mobilePhone: toInternational(draft.mobilePhone, phoneCountry(draft, bandCountry)) || null,
    streetAddress: text(draft.streetAddress),
    postalCode: text(draft.postalCode),
    city: text(draft.city),
    countryCode: text(draft.countryCode),
    addressInstructions: text(draft.addressInstructions),
  };
}

/**
 * What is wrong with a draft, in the words of each field: what the form can
 * tell by itself, then what the API refused ({ nickname: "duplicate" }).
 */
export function useRecordErrors() {
  const { t } = useTranslation();

  return (
    draft: RecordDraft,
    bandCountry: string,
    refused: Record<string, string> = {},
  ): Partial<Record<RecordField, string>> => {
    const errors: Partial<Record<RecordField, string>> = {};
    for (const name of ['nickname', 'firstName', 'lastName'] as const) {
      if (draft[name].trim() === '') errors[name] = t(`member.errors.${name}.missing`);
      else if (refused[name] === 'duplicate') errors[name] = t('member.errors.nickname.duplicate');
      else if (refused[name]) errors[name] = t(`member.errors.${name}.invalid`);
    }
    if (draft.instrumentId === null || refused.instrumentId) {
      errors.instrumentId = t('member.errors.instrument.missing');
    }
    if (draft.email.trim() === '') errors.email = t('member.errors.email.missing');
    else if (refused.email === 'duplicate') errors.email = t('member.errors.email.duplicate');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()) || refused.email) {
      errors.email = t('member.errors.email.invalid');
    }
    if (
      toInternational(draft.mobilePhone, phoneCountry(draft, bandCountry)) === null ||
      refused.mobilePhone
    ) {
      errors.mobilePhone = t('member.errors.mobilePhone.invalid');
    }
    for (const name of ['streetAddress', 'postalCode', 'city', 'addressInstructions'] as const) {
      if (refused[name]) errors[name] = t('member.errors.tooLong');
    }
    return errors;
  };
}
