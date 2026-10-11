import { api } from '../../api.ts';
import type { Member } from '../../members.ts';
import type { PhotoDraft } from './MemberRecordFields.tsx';
import { type RecordDraft, recordOf } from './record.ts';

/**
 * Saves the record of a member, then their photo when it changed. The API
 * checks who may: the member themself, or whoever manages members.
 */
export async function saveMember(
  memberId: number,
  draft: RecordDraft,
  photo: PhotoDraft,
  bandCountry: string,
): Promise<Member> {
  let member = await api<Member>(`/api/members/${memberId}`, {
    method: 'PUT',
    body: recordOf(draft, bandCountry),
  });
  if (photo.chosen) {
    member = await api<Member>(`/api/members/${memberId}/photo`, {
      method: 'PUT',
      body: { image: photo.chosen.image },
    });
  } else if (photo.isRemoved && photo.saved) {
    member = await api<Member>(`/api/members/${memberId}/photo`, { method: 'DELETE' });
  }
  return member;
}
