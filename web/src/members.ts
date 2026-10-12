import { useQuery } from '@tanstack/react-query';
import { api } from './api.ts';
import type { MemberRecord } from './screens/members/record.ts';

// The members, sections and instruments of the band, as the API answers them
// (api/src/Members/Members.php, api/src/Sections/Sections.php).

export type MemberStatus = 'INVITED' | 'ACTIVE' | 'POWER_MEMBER' | 'LEFT';

export type Member = MemberRecord & {
  id: number;
  status: MemberStatus;
  photoUrl: string | null;
  roles: string[];
  /** For who manages members only: whether a password link is waiting, and until when (UTC). */
  hasPendingPasswordLink?: boolean;
  passwordLinkExpiresAt?: string | null;
};

export type Instrument = {
  id: number;
  name: string;
  position: number;
  /** The current members who play it. */
  memberCount: number;
  /** Invited and former members whose record holds it; told to those who manage sections only. */
  otherMemberCount?: number;
};
export type Section = {
  id: number;
  name: string;
  position: number;
  /** The key of a pictogram; null for the generic one. */
  icon: string | null;
  instruments: Instrument[];
};

/** The members the signed-in member may see, by nickname. */
export function useMembers() {
  return useQuery({ queryKey: ['members'], queryFn: () => api<Member[]>('/api/members') });
}

export function useSections() {
  return useQuery({ queryKey: ['sections'], queryFn: () => api<Section[]>('/api/sections') });
}

export type InstrumentInfo = {
  id: number;
  name: string;
  sectionId: number;
  sectionName: string;
  icon: string | null;
};

/** The instruments of the band, flat, in its order, each with its section. */
export function instrumentsOf(sections: Section[] | undefined): InstrumentInfo[] {
  return (sections ?? []).flatMap((section) =>
    section.instruments.map((instrument) => ({
      id: instrument.id,
      name: instrument.name,
      sectionId: section.id,
      sectionName: section.name,
      icon: section.icon,
    })),
  );
}
