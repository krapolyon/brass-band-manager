import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { useBand } from '../../band.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import type { IconName } from '../../components/Icon.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { Message } from '../../components/Message.tsx';
import { NavRow } from '../../components/NavRow.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { instrumentsOf, type Member, useMembers, useSections } from '../../members.ts';
import { type Me, useMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import { focusFirstFieldError } from '../settings/ProfileScreen.tsx';
import { type CreatedLink, LinkPanel } from './LinkPanel.tsx';
import { NoRightScreen } from './ManageListScreen.tsx';
import { MemberRecordFields, type PhotoDraft } from './MemberRecordFields.tsx';
import { covers, displayStatus, type RoleName, roles } from './manage.ts';
import { draftOf, useRecordErrors } from './record.ts';
import { saveMember } from './save.ts';

const statusIcon: Record<ReturnType<typeof displayStatus>, IconName> = {
  ACTIVE: 'Check',
  POWER_MEMBER: 'Biceps',
  INVITED: 'Send',
  EXPIRED: 'Send',
  LEFT: 'UserX',
};

// Figma: Members / Manage — member, in each status: active or power member
// (status, actions, roles, record), last admin, invited, former member; and
// the confirmation before marking someone as gone.
export function ManageMemberScreen() {
  const { t } = useTranslation();
  const id = Number(useParams().id);
  const me = useMe().data;
  const members = useMembers();
  const member = (members.data ?? []).find((other) => other.id === id);
  // A link that was just created. Kept here, above the record: bringing a
  // member back changes their status, and the record below starts again.
  const [link, setLink] = useState<CreatedLink | null>(null);

  if (!me) return null;
  if (!me.permissions.includes('manageMembers')) return <NoRightScreen />;
  if (!member) {
    return (
      <AppLayout
        current="members"
        back="/members/manage"
        backLabel={t('settings.manageMembers')}
        width="form"
        title={t('settings.manageMembers')}
      >
        {members.isError && <Message kind="danger">{t('errors.unreachable')}</Message>}
        {members.isSuccess && <Message kind="warning">{t('manage.member.notFound')}</Message>}
      </AppLayout>
    );
  }
  // The form starts from the record as it is when the screen opens, and
  // starts again when the status changes.
  return (
    <>
      <Record
        key={`${member.id}-${member.status}`}
        me={me}
        member={member}
        all={members.data ?? []}
        onLink={setLink}
      />
      <LinkPanel link={link} onClose={() => setLink(null)} />
    </>
  );
}

type RecordProps = { me: Me; member: Member; all: Member[]; onLink: (link: CreatedLink) => void };

function Record({ me, member, all, onLink: setLink }: RecordProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const band = useBand().data;
  const bandCountry = band?.defaultCountryCode ?? '';
  // With a mail server an invitation is sent again by email (#50).
  const byEmail = band?.canSendEmail ?? false;
  const recordErrors = useRecordErrors();
  const instruments = instrumentsOf(useSections().data);
  const instrument = instruments.find((other) => other.id === member.instrumentId);

  const [draft, setDraft] = useState(() => draftOf(member, bandCountry));
  const [photo, setPhoto] = useState<PhotoDraft>({
    saved: member.photoUrl,
    chosen: null,
    isRemoved: false,
  });
  const [held, setHeld] = useState<string[]>(member.roles);
  const [wasSent, setSent] = useState(false);
  const [isLeaving, setLeaving] = useState(false);

  const status = displayStatus(member);
  const isCurrent = member.status === 'ACTIVE' || member.status === 'POWER_MEMBER';
  const canManageRoles = me.permissions.includes('manageRoles');
  const mayAct = covers(me, member);
  // The last current admin can neither lose that role nor leave.
  const admins = all.filter(
    (other) =>
      (other.status === 'ACTIVE' || other.status === 'POWER_MEMBER') &&
      other.roles.includes('ADMIN'),
  );
  const isLastAdmin = isCurrent && member.roles.includes('ADMIN') && admins.length === 1;
  const reserved = mayAct ? undefined : t('manage.member.reserved');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['members'] });
  const mine = () =>
    member.id === me.id ? queryClient.invalidateQueries({ queryKey: ['me'] }) : undefined;

  const changeStatus = useMutation({
    mutationFn: (next: Member['status']) =>
      api<Member & { passwordLinkToken?: string; invitationEmailed?: boolean }>(
        `/api/members/${member.id}/status`,
        { method: 'PUT', body: { status: next } },
      ),
    onSuccess: async (answer) => {
      setLeaving(false);
      // Bringing a member back creates their invitation: its link is shown now, or never.
      if (answer.passwordLinkToken) {
        setLink({
          token: answer.passwordLinkToken,
          nickname: member.nickname,
          isInvitation: true,
          sentTo: answer.invitationEmailed ? answer.email : undefined,
        });
      }
      await refresh();
    },
    onError: () => setLeaving(false),
  });
  const createLink = useMutation({
    mutationFn: () =>
      api<{ passwordLinkToken: string }>(`/api/members/${member.id}/passwordLink`, {
        method: 'POST',
      }),
    onSuccess: async (answer) => {
      setLink({
        token: answer.passwordLinkToken,
        nickname: member.nickname,
        isInvitation: member.status === 'INVITED',
      });
      await refresh();
    },
  });
  // "Renvoyer l'invitation": a new link by email, the former one stops (#50).
  const resend = useMutation({
    mutationFn: () => api<Member>(`/api/members/${member.id}/invitation`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const cancelInvitation = useMutation({
    mutationFn: () => api(`/api/members/${member.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await refresh();
      navigate('/members/manage');
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      // The roles first: a change of roles that is refused (the last admin)
      // then saves nothing at all.
      const changed =
        held.length !== member.roles.length || held.some((role) => !member.roles.includes(role));
      if (canManageRoles && changed) {
        await api(`/api/members/${member.id}/roles`, { method: 'PUT', body: { roles: held } });
      }
      await saveMember(member.id, draft, photo, bandCountry);
    },
    onSuccess: () => navigate('/members/manage'),
    // Whatever happened, the list is asked again: a save can stop halfway.
    onSettled: () => Promise.all([refresh(), mine()]),
    onError: focusFirstFieldError,
  });

  const failure = [changeStatus, createLink, resend, cancelInvitation, save]
    .map((mutation) => mutation.error)
    .find(Boolean);
  const refused = save.error instanceof ApiError ? save.error.fields : {};
  const errors = wasSent ? recordErrors(draft, bandCountry, refused) : {};
  const errorCount = Object.keys(errors).length;
  const failureKey =
    !failure || errorCount > 0
      ? null
      : failure instanceof ApiError && failure.error === 'lastAdmin'
        ? 'manage.member.lastAdminRefused'
        : failure instanceof ApiError && failure.error === 'emailedRecently'
          ? 'manage.member.emailedRecently'
          : failure instanceof ApiError && failure.status === 403
            ? 'manage.member.reserved'
            : 'errors.unreachable';
  const isBusy =
    changeStatus.isPending ||
    createLink.isPending ||
    resend.isPending ||
    cancelInvitation.isPending ||
    save.isPending;

  const dayOf = (instant: string | null | undefined) =>
    instant
      ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(
          new Date(instant),
        )
      : '';
  const until = dayOf(member.passwordLinkExpiresAt);
  const sentOn = dayOf(member.passwordLinkEmailedAt);

  return (
    <>
      <AppLayout
        current="members"
        back="/members/manage"
        backLabel={t('settings.manageMembers')}
        width="form"
        title={member.nickname}
        subtitle={`${member.firstName} ${member.lastName} · ${instrument?.name ?? ''}`}
        onSubmit={
          isCurrent
            ? () => {
                if (isBusy) return;
                setSent(true);
                if (Object.keys(recordErrors(draft, bandCountry)).length > 0) {
                  focusFirstFieldError();
                } else {
                  save.mutate();
                }
              }
            : undefined
        }
        actions={
          isCurrent && (
            <BottomBar>
              <Button type="submit" disabled={isBusy}>
                {t('settings.save')}
              </Button>
            </BottomBar>
          )
        }
      >
        {isLastAdmin && (
          <Message kind="warning">
            {t('manage.member.lastAdmin', { nickname: member.nickname })}
          </Message>
        )}
        {failureKey && <Message kind="danger">{t(failureKey)}</Message>}
        {errorCount > 0 && (
          <Message kind="danger">{t('member.errors.beforeSaving', { count: errorCount })}</Message>
        )}

        <Sheet title={t('manage.table.status')}>
          {/* Said when it changes: "Renvoyer l'invitation" has no other answer. */}
          <div aria-live="polite">
            <NavRow
              icon={statusIcon[status]}
              label={t(`member.status.${status}`)}
              detail={
                status === 'INVITED' && sentOn !== ''
                  ? t('manage.status.INVITED_SENT', { sent: sentOn, date: until })
                  : t(`manage.status.${status}`, { date: until })
              }
            />
          </div>
        </Sheet>

        <Sheet title={t('manage.actions.title')}>
          <div className="members-rows">
            {isCurrent && (
              <>
                {member.status === 'ACTIVE' ? (
                  <NavRow
                    icon="Biceps"
                    label={t('manage.actions.toPowerMember')}
                    detail={reserved ?? t('manage.actions.toPowerMemberDetail')}
                    onClick={() => changeStatus.mutate('POWER_MEMBER')}
                    disabled={isBusy || !mayAct}
                  />
                ) : (
                  <NavRow
                    icon="Check"
                    label={t('manage.actions.toActive')}
                    detail={reserved ?? t('manage.actions.toActiveDetail')}
                    onClick={() => changeStatus.mutate('ACTIVE')}
                    disabled={isBusy || !mayAct}
                  />
                )}
                <NavRow
                  icon="Link"
                  label={t('manage.actions.passwordLink')}
                  detail={reserved ?? t('manage.actions.passwordLinkDetail')}
                  onClick={() => createLink.mutate()}
                  disabled={isBusy || !mayAct}
                  opensPanel
                />
                <NavRow
                  icon="UserX"
                  tone={isLastAdmin || !mayAct ? 'default' : 'danger'}
                  label={t('manage.actions.leave')}
                  detail={
                    reserved ??
                    (isLastAdmin
                      ? t('manage.actions.leaveLastAdmin')
                      : t('manage.actions.leaveDetail'))
                  }
                  onClick={() => setLeaving(true)}
                  disabled={isBusy || isLastAdmin || !mayAct}
                  opensPanel
                />
              </>
            )}
            {member.status === 'INVITED' && (
              <>
                {byEmail ? (
                  <NavRow
                    icon="Link"
                    label={t('manage.actions.resend')}
                    detail={reserved ?? t('manage.actions.resendDetail', { email: member.email })}
                    onClick={() => resend.mutate()}
                    disabled={isBusy || !mayAct}
                  />
                ) : (
                  <NavRow
                    icon="Link"
                    label={t('manage.actions.newLink')}
                    detail={reserved ?? t('manage.actions.newLinkDetail')}
                    onClick={() => createLink.mutate()}
                    disabled={isBusy || !mayAct}
                    opensPanel
                  />
                )}
                <NavRow
                  icon="Trash"
                  tone={mayAct ? 'danger' : 'default'}
                  label={t('manage.actions.cancelInvitation')}
                  detail={reserved ?? t('manage.actions.cancelInvitationDetail')}
                  onClick={() => cancelInvitation.mutate()}
                  disabled={isBusy || !mayAct}
                />
              </>
            )}
            {member.status === 'LEFT' && (
              <NavRow
                icon="Undo"
                label={t('manage.actions.bringBack', { nickname: member.nickname })}
                detail={t('manage.actions.bringBackDetail')}
                onClick={() => changeStatus.mutate('INVITED')}
                disabled={isBusy}
                opensPanel
              />
            )}
          </div>
        </Sheet>

        {isCurrent && (canManageRoles || member.roles.length > 0) && (
          <Sheet title={t('manage.table.roles')}>
            <div className="members-rows">
              {roles
                .filter((role) => canManageRoles || member.roles.includes(role))
                .map((role) => (
                  <RoleRow
                    key={role}
                    role={role}
                    // Only an admin changes roles; who manages members reads them.
                    locked={
                      canManageRoles && role === 'ADMIN' && isLastAdmin
                        ? t('manage.member.lastAdminRole')
                        : undefined
                    }
                    onCheck={
                      canManageRoles && !(role === 'ADMIN' && isLastAdmin)
                        ? (checked) =>
                            setHeld(
                              checked ? [...held, role] : held.filter((other) => other !== role),
                            )
                        : undefined
                    }
                    checked={held.includes(role)}
                  />
                ))}
            </div>
          </Sheet>
        )}

        {isCurrent && (
          <MemberRecordFields
            voice="other"
            emailLocked={mayAct ? undefined : t('manage.member.emailReserved')}
            draft={draft}
            onChange={(changes) => setDraft({ ...draft, ...changes })}
            errors={errors}
            instruments={instruments}
            photo={photo}
            onPhoto={setPhoto}
          />
        )}
      </AppLayout>

      <Panel
        open={isLeaving}
        onClose={() => setLeaving(false)}
        title={t('manage.leave.title', { nickname: member.nickname })}
      >
        <div className="members-sheet">
          <p className="textBodyLarge">{t('manage.leave.text')}</p>
          <Button kind="danger" onClick={() => changeStatus.mutate('LEFT')} disabled={isBusy}>
            {t('manage.actions.leave')}
          </Button>
          <Button kind="secondary" onClick={() => setLeaving(false)}>
            {t('settings.confirmSignOut.cancel')}
          </Button>
        </div>
      </Panel>
    </>
  );
}

type RoleRowProps = {
  role: RoleName;
  checked: boolean;
  /** Left out: the role is read, not changed. */
  onCheck?: (checked: boolean) => void;
  /** Why this role cannot be changed, in place of what it allows. */
  locked?: string;
};

function RoleRow({ role, checked, onCheck, locked }: RoleRowProps) {
  const { t } = useTranslation();

  return (
    <ListRow
      label={t(`manage.roles.${role}.label`)}
      detail={locked ?? t(`manage.roles.${role}.detail`)}
      checked={onCheck ? checked : undefined}
      onCheck={onCheck}
    />
  );
}
