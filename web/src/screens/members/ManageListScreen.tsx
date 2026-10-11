import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { Chip } from '../../components/Chip.tsx';
import { MemberRow } from '../../components/MemberRow.tsx';
import { MemberTable } from '../../components/MemberTable.tsx';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { SwitchRow } from '../../components/SwitchRow.tsx';
import { instrumentsOf, type Member, useMembers, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import { type CreatedLink, LinkPanel, takeHandedOver } from './LinkPanel.tsx';
import { displayStatus, rolesInWords } from './manage.ts';
import './members.css';

const filters = ['all', 'powerMembers', 'invited'] as const;
type Filter = (typeof filters)[number];

// Figma: Members / Manage — list, and its table on a desktop. Every member
// the band has or had, for those who manage them: the current members and
// the invited ones, the former ones behind a switch.
export function ManageListScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const me = useMe().data;
  const members = useMembers();
  const instruments = instrumentsOf(useSections().data);
  const [filter, setFilter] = useState<Filter>('all');
  const [withFormer, setWithFormer] = useState(false);
  // The link of an invitation that was just created, handed over by the invite screen.
  const [link, setLink] = useState<CreatedLink | null>(takeHandedOver);

  if (me && !me.permissions.includes('manageMembers')) return <NoRightScreen />;

  const all = members.data ?? [];
  const count = (status: Member['status']) =>
    all.filter((member) => member.status === status).length;
  const shown = all
    .filter((member) => {
      if (member.status === 'LEFT') return withFormer && filter === 'all';
      if (filter === 'powerMembers') return member.status === 'POWER_MEMBER';
      if (filter === 'invited') return member.status === 'INVITED';
      return true;
    })
    .sort((a, b) => a.nickname.localeCompare(b.nickname, i18n.language));

  const instrumentOf = (member: Member) =>
    instruments.find((other) => other.id === member.instrumentId);
  const chip = (member: Member) => {
    const status = displayStatus(member);
    if (status === 'INVITED') {
      return (
        <Chip kind="warning" icon="Send">
          {t('member.status.INVITED')}
        </Chip>
      );
    }
    if (status === 'EXPIRED') {
      return (
        <Chip kind="danger" icon="Alert">
          {t('manage.status.expiredShort')}
        </Chip>
      );
    }
    if (status === 'LEFT') return <Chip>{t('member.status.LEFT')}</Chip>;
    return undefined;
  };

  const subtitle = members.isSuccess
    ? [
        t('manage.count.members', { count: count('ACTIVE') + count('POWER_MEMBER') }) +
          (count('POWER_MEMBER') > 0
            ? t('manage.count.powerMembers', { count: count('POWER_MEMBER') })
            : '') +
          '.',
        [
          count('INVITED') > 0 && t('manage.count.invited', { count: count('INVITED') }),
          withFormer && count('LEFT') > 0 && t('manage.count.former', { count: count('LEFT') }),
        ]
          .filter(Boolean)
          .join(', '),
      ]
        .filter(Boolean)
        .join(' ')
        .replace(/([^.])$/, '$1.')
    : undefined;

  const invite = () => navigate('/members/manage/invite');

  return (
    <>
      <AppLayout
        current="members"
        back="/members"
        backLabel={t('nav.members')}
        title={t('settings.manageMembers')}
        subtitle={subtitle}
        action={
          <span className="members-desktopOnly">
            <Button size="small" icon="UserPlus" onClick={invite}>
              {t('manage.invite.open')}
            </Button>
          </span>
        }
        actions={
          <div className="members-belowDesktop">
            <BottomBar>
              <Button onClick={invite}>{t('manage.invite.open')}</Button>
            </BottomBar>
          </div>
        }
      >
        {members.isError && <Message kind="danger">{t('errors.unreachable')}</Message>}
        <div className="members-controls">
          {/* One choice among three: a group of radio buttons to a screen reader. */}
          <div className="members-filters" role="radiogroup" aria-label={t('manage.filter.label')}>
            {filters.map((value) => (
              <Button
                key={value}
                // Figma draws this choice with Buttons: no component holds one choice among chips yet.
                role="radio"
                aria-checked={filter === value}
                tabIndex={filter === value ? 0 : -1}
                onKeyDown={(event) => {
                  // As in a group of radio buttons: the arrows move the choice.
                  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
                    event.key
                  ];
                  if (!step) return;
                  event.preventDefault();
                  const at = filters.indexOf(value) + step + filters.length;
                  setFilter(filters[at % filters.length] ?? value);
                  const group = event.currentTarget.parentElement;
                  requestAnimationFrame(() =>
                    group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(),
                  );
                }}
                kind={filter === value ? 'primary' : 'secondary'}
                size="small"
                onClick={() => setFilter(value)}
              >
                {t(`manage.filter.${value}`)}
              </Button>
            ))}
          </div>
          <div className="members-former">
            <SwitchRow
              label={t('manage.showFormer')}
              checked={withFormer}
              onChange={setWithFormer}
            />
          </div>
        </div>

        {members.isSuccess && shown.length === 0 ? (
          <Message>
            <strong>{t(`manage.empty.${filter}.title`)}</strong> {t(`manage.empty.${filter}.text`)}
          </Message>
        ) : (
          <>
            <div className="members-belowDesktop">
              <Sheet>
                <ul className="members-rows">
                  {shown.map((member) => (
                    <li key={member.id}>
                      <MemberRow
                        nickname={member.nickname}
                        detail={`${member.firstName} ${member.lastName} · ${instrumentOf(member)?.name ?? ''}`}
                        photoUrl={member.photoUrl}
                        to={`/members/manage/${member.id}`}
                        powerMemberLabel={
                          member.status === 'POWER_MEMBER'
                            ? t('member.status.POWER_MEMBER')
                            : undefined
                        }
                        roleLabel={member.roles.length > 0 ? rolesInWords(member, t) : undefined}
                        status={chip(member)}
                        muted={member.status === 'LEFT'}
                      />
                    </li>
                  ))}
                </ul>
              </Sheet>
            </div>
            <div className="members-desktopOnly">
              <Sheet>
                <MemberTable
                  caption={t('settings.manageMembers')}
                  columns={[
                    t('manage.table.member'),
                    t('member.instrument.label'),
                    t('manage.table.status'),
                    t('manage.table.roles'),
                  ]}
                  rows={shown.map((member) => {
                    const status = displayStatus(member);
                    return {
                      id: member.id,
                      nickname: member.nickname,
                      name: `${member.firstName} ${member.lastName}`,
                      photoUrl: member.photoUrl,
                      instrument: instrumentOf(member)?.name ?? '',
                      sectionIcon: instrumentOf(member)?.icon ?? null,
                      status:
                        status === 'ACTIVE' ? (
                          t('member.status.ACTIVE')
                        ) : status === 'POWER_MEMBER' ? (
                          <Chip kind="accent" icon="Biceps">
                            {t('member.status.POWER_MEMBER')}
                          </Chip>
                        ) : status === 'EXPIRED' ? (
                          <Chip kind="danger" icon="Alert">
                            {t('member.status.EXPIRED')}
                          </Chip>
                        ) : (
                          chip(member)
                        ),
                      roles: rolesInWords(member, t),
                      to: `/members/manage/${member.id}`,
                      openVerb: t('manage.table.open'),
                      muted: member.status === 'LEFT',
                    };
                  })}
                />
              </Sheet>
            </div>
          </>
        )}
      </AppLayout>
      <LinkPanel link={link} onClose={() => setLink(null)} />
    </>
  );
}

// Figma: Members / Manage — no right. The address opened by a member who
// does not manage members. The API refuses them anyway; this says it kindly.
export function NoRightScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <AppLayout
      current="members"
      back="/members"
      width="form"
      title={t('manage.noRight.title')}
      subtitle={t('manage.noRight.text')}
      actions={
        <BottomBar>
          <Button onClick={() => navigate('/members')}>{t('manage.noRight.back')}</Button>
        </BottomBar>
      }
    >
      {null}
    </AppLayout>
  );
}
