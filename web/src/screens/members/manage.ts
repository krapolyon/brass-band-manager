import type { TFunction } from 'i18next';
import type { Member } from '../../members.ts';
import type { Me } from '../../session.ts';

// What the screens that manage members share.

/** The roles an admin can give today. Those of later features are not offered before their feature exists. */
export const roles = ['ADMIN', 'MEMBER_MANAGER', 'SONG_MANAGER', 'GIG_MANAGER'] as const;
export type RoleName = (typeof roles)[number];

/** What a member looks like to who manages members: their status, or "expired" for an invitation whose link no longer works. */
export function displayStatus(member: Member): Member['status'] | 'EXPIRED' {
  return member.status === 'INVITED' && !member.hasPendingPasswordLink ? 'EXPIRED' : member.status;
}

/** The roles of a member in words: "Admin, Gère les plans". */
export function rolesInWords(member: Member, t: TFunction): string {
  return roles
    .filter((role) => member.roles.includes(role))
    .map((role) => t(`manage.roles.${role}.label`))
    .join(', ');
}

/**
 * Whether the signed-in member may act on the access of another one: their
 * email, their password link, their status (model/members.md, "Nobody acts on
 * the access of someone who may do more than them"). The API decides; this
 * only tells the screen what to offer.
 */
export function covers(me: Me, member: Member): boolean {
  return (
    member.id === me.id ||
    me.roles.includes('ADMIN') ||
    member.roles.every((role) => me.roles.includes(role))
  );
}

/** The address a password link is sent as: its secret after the #, which no server ever receives. */
export function linkAddress(token: string, isInvitation: boolean): string {
  return `${window.location.origin}/${isInvitation ? 'invitation' : 'password'}#${token}`;
}
