import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { useBand } from '../../band.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { Icon } from '../../components/Icon.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { PickerField } from '../../components/TextField.tsx';
import { instrumentsOf, useMembers, useSections } from '../../members.ts';
import { type Me, useMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import { MemberRecordFields, type PhotoDraft } from '../members/MemberRecordFields.tsx';
import { draftOf, useRecordErrors } from '../members/record.ts';
import { saveMember } from '../members/save.ts';

// After a form was refused: puts the focus on its first faulty field. Two
// frames later: the first one may come before the screen has drawn the error.
export function focusFirstFieldError() {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('.TextField[data-error="true"] :is(input, select, button)')
        ?.focus();
    }),
  );
}

// Figma: Members / Settings — profile. What the other members see of the
// signed-in member. It changes what others see: it keeps a save button.
export function ProfileScreen() {
  const me = useMe().data;
  // The form starts from the record as it is when the screen opens.
  return me ? <ProfileForm me={me} /> : null;
}

function ProfileForm({ me }: { me: Me }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bandCountry = useBand().data?.defaultCountryCode ?? '';
  const recordErrors = useRecordErrors();
  const instruments = instrumentsOf(useSections().data);
  const [draft, setDraft] = useState(() => draftOf(me, bandCountry));
  const [photo, setPhoto] = useState<PhotoDraft>({
    saved: me.photoUrl,
    chosen: null,
    isRemoved: false,
  });
  const [wasSent, setSent] = useState(false);
  // "Peut répondre pour moi" (1.1.0): set by the member alone, through its own address.
  const [proxyId, setProxyId] = useState(me.proxyMemberId);
  const [isProxyPickerOpen, setProxyPickerOpen] = useState(false);
  const others = (useMembers().data ?? []).filter(
    (member) =>
      member.id !== me.id && (member.status === 'ACTIVE' || member.status === 'POWER_MEMBER'),
  );
  const proxy = others.find((member) => member.id === proxyId);

  const save = useMutation({
    mutationFn: async () => {
      await saveMember(me.id, draft, photo, bandCountry);
      if (proxyId !== me.proxyMemberId) {
        await api('/api/me/proxy', { method: 'PUT', body: { proxyMemberId: proxyId } });
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['members'] }),
      ]);
      navigate('/settings');
    },
    onError: focusFirstFieldError,
  });

  const refused = save.error instanceof ApiError ? save.error.fields : {};
  const errors = wasSent ? recordErrors(draft, bandCountry, refused) : {};
  const errorCount = Object.keys(errors).length;

  return (
    <AppLayout
      current="settings"
      back="/settings"
      backLabel={t('nav.settings')}
      width="form"
      title={t('settings.profile.title')}
      subtitle={t('settings.profile.lead')}
      onSubmit={() => {
        if (save.isPending) return;
        setSent(true);
        if (Object.keys(recordErrors(draft, bandCountry)).length > 0) {
          focusFirstFieldError();
        } else {
          save.mutate();
        }
      }}
      actions={
        <BottomBar>
          <Button type="submit" disabled={save.isPending}>
            {t('settings.save')}
          </Button>
        </BottomBar>
      }
    >
      {errorCount > 0 && (
        <Message kind="danger">{t('member.errors.beforeSaving', { count: errorCount })}</Message>
      )}
      {save.isError && errorCount === 0 && (
        <Message kind="danger">{t('errors.unreachable')}</Message>
      )}
      <MemberRecordFields
        voice="self"
        draft={draft}
        onChange={(changes) => setDraft({ ...draft, ...changes })}
        errors={errors}
        instruments={instruments}
        photo={photo}
        onPhoto={setPhoto}
        afterInTheBand={
          // Figma: Members, section 18 (1.1.0). Not on the record a member manager edits.
          <Sheet title={t('member.form.presences')}>
            <PickerField
              label={t('member.form.proxy')}
              hint={t('member.form.proxyHint')}
              error={refused.proxyMemberId ? t('member.errors.proxy.invalid') : undefined}
              value={proxy?.nickname ?? t('member.form.proxyNone')}
              onPick={() => setProxyPickerOpen(true)}
            />
          </Sheet>
        }
      />
      <Panel
        open={isProxyPickerOpen}
        onClose={() => setProxyPickerOpen(false)}
        title={t('member.form.proxy')}
      >
        {[{ id: null, nickname: t('member.form.proxyNone') }, ...others].map((member) => {
          const isCurrent = member.id === (proxy?.id ?? null);
          return (
            <ListRow
              key={member.id ?? 'none'}
              label={member.nickname}
              current={isCurrent}
              trailing={
                isCurrent ? (
                  <span className="ListRow-mark">
                    <Icon name="Check" />
                  </span>
                ) : undefined
              }
              onPress={() => {
                setProxyId(member.id);
                setProxyPickerOpen(false);
              }}
            />
          );
        })}
      </Panel>
    </AppLayout>
  );
}
