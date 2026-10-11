import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { useBand } from '../../band.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { Message } from '../../components/Message.tsx';
import { instrumentsOf, type Member, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import { focusFirstFieldError } from '../settings/ProfileScreen.tsx';
import type { CreatedLink } from './LinkPanel.tsx';
import { NoRightScreen } from './ManageListScreen.tsx';
import { MemberRecordFields, noPhoto, type PhotoDraft } from './MemberRecordFields.tsx';
import { emptyDraft, recordOf, useRecordErrors } from './record.ts';

// Figma: Members / Manage — invite. Whoever manages members fills in what
// they know; the invited person checks and completes the rest when they
// arrive. Creating the invitation creates its link, shown once on the list.
export function InviteScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const bandCountry = useBand().data?.defaultCountryCode ?? '';
  const recordErrors = useRecordErrors();
  const instruments = instrumentsOf(useSections().data);
  const [draft, setDraft] = useState(emptyDraft);
  const [photo, setPhoto] = useState<PhotoDraft>(noPhoto);
  const [wasSent, setSent] = useState(false);

  const invite = useMutation({
    mutationFn: async () => {
      const created = await api<Member & { passwordLinkToken: string }>('/api/members', {
        method: 'POST',
        body: recordOf(draft, bandCountry),
      });
      if (photo.chosen) {
        // The invitation exists: a photo that fails to save can be given again from the record.
        await api(`/api/members/${created.id}/photo`, {
          method: 'PUT',
          body: { image: photo.chosen.image },
        }).catch(() => undefined);
      }
      return created;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      const link: CreatedLink = {
        token: created.passwordLinkToken,
        nickname: created.nickname,
        isInvitation: true,
      };
      navigate('/members/manage', { state: { link } });
    },
    onError: focusFirstFieldError,
  });

  if (me && !me.permissions.includes('manageMembers')) return <NoRightScreen />;

  const refused = invite.error instanceof ApiError ? invite.error.fields : {};
  const errors = wasSent ? recordErrors(draft, bandCountry, refused) : {};
  const errorCount = Object.keys(errors).length;
  // The caption above the button says why it would not go through yet.
  const missing =
    draft.nickname.trim() === ''
      ? 'nickname'
      : draft.firstName.trim() === ''
        ? 'firstName'
        : draft.lastName.trim() === ''
          ? 'lastName'
          : draft.instrumentId === null
            ? 'instrument'
            : draft.email.trim() === ''
              ? 'email'
              : null;

  return (
    <AppLayout
      current="members"
      back="/members/manage"
      backLabel={t('settings.manageMembers')}
      width="form"
      title={t('manage.invite.open')}
      subtitle={t('manage.invite.lead')}
      onSubmit={() => {
        if (invite.isPending) return;
        setSent(true);
        if (Object.keys(recordErrors(draft, bandCountry)).length > 0) {
          focusFirstFieldError();
        } else {
          invite.mutate();
        }
      }}
      actions={
        <BottomBar
          caption={
            missing ? { kind: 'warning', text: t(`member.errors.${missing}.missing`) } : undefined
          }
        >
          <Button type="submit" disabled={invite.isPending}>
            {t('manage.invite.submit')}
          </Button>
        </BottomBar>
      }
    >
      {errorCount > 0 && (
        <Message kind="danger">{t('member.errors.beforeSaving', { count: errorCount })}</Message>
      )}
      {invite.isError && errorCount === 0 && (
        <Message kind="danger">{t('errors.unreachable')}</Message>
      )}
      <MemberRecordFields
        voice="invite"
        draft={draft}
        onChange={(changes) => setDraft({ ...draft, ...changes })}
        errors={errors}
        instruments={instruments}
        photo={photo}
        onPhoto={setPhoto}
      />
    </AppLayout>
  );
}
