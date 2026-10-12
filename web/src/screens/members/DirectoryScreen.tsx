import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useBand } from '../../band.ts';
import { Button } from '../../components/Button.tsx';
import { Chip } from '../../components/Chip.tsx';
import { FilterChip } from '../../components/FilterChip.tsx';
import { MemberCard } from '../../components/MemberCard.tsx';
import { MemberHeader } from '../../components/MemberHeader.tsx';
import { Message } from '../../components/Message.tsx';
import { NavRow } from '../../components/NavRow.tsx';
import { Panel } from '../../components/Panel.tsx';
import { QuickAction } from '../../components/QuickAction.tsx';
import { instrumentsOf, type Member, useMembers, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import { countryName } from './countries.ts';
import { phoneForDisplay } from './phone.ts';
import './members.css';

// The address of a place in the maps app of the device. Nothing is sent to
// anyone before the member presses the button.
function mapsAddress(place: string): string {
  const query = encodeURIComponent(place);
  if (/iPhone|iPad|Macintosh/.test(navigator.userAgent))
    return `https://maps.apple.com/?q=${query}`;
  if (/Android/.test(navigator.userAgent)) return `geo:0,0?q=${query}`;
  return `https://www.openstreetmap.org/search?query=${query}`;
}

// Figma: Members / Directory, and the member sheet opened from a card. The
// directory of the band: active members by default, in alphabetical order of
// the nickname. Two filters, both off when the screen opens
// (model/members.md, "Display").
export function DirectoryScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const me = useMe().data;
  const members = useMembers();
  const sections = useSections();
  const [isMySection, setMySection] = useState(false);
  const [withPowerMembers, setPowerMembers] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const instruments = instrumentsOf(sections.data);
  const instrumentOf = (member: { instrumentId: number }) =>
    instruments.find((instrument) => instrument.id === member.instrumentId);
  const mySection = me ? instrumentOf(me) : undefined;

  // Who manages members also receives the invited members and those who
  // left: they never appear in the directory.
  const shown = (members.data ?? [])
    .filter(
      (member) =>
        member.status === 'ACTIVE' || (withPowerMembers && member.status === 'POWER_MEMBER'),
    )
    .filter((member) => !isMySection || instrumentOf(member)?.sectionId === mySection?.sectionId)
    .sort((a, b) => a.nickname.localeCompare(b.nickname, i18n.language));
  const open = (members.data ?? []).find((member) => member.id === openId);

  // "Touche une tête" with a finger, "Clique sur une tête" with a mouse.
  const hasPointer = window.matchMedia('(pointer: fine)').matches;
  const subtitle = members.isSuccess
    ? isMySection
      ? t('directory.mySection', { count: shown.length, section: mySection?.sectionName ?? '' })
      : withPowerMembers
        ? t('directory.withPowerMembers', { count: shown.length })
        : t(hasPointer ? 'directory.allWithPointer' : 'directory.all', { count: shown.length })
    : undefined;

  return (
    <>
      <AppLayout
        current="members"
        title={t('nav.members')}
        subtitle={subtitle}
        action={
          me?.permissions.includes('manageMembers') && (
            <Button
              kind="secondary"
              size="small"
              icon="Pencil"
              onClick={() => navigate('/members/manage')}
            >
              {t('directory.manage')}
            </Button>
          )
        }
        toolbar={
          <>
            <FilterChip pressed={isMySection} onChange={setMySection}>
              {t('directory.filterMySection')}
            </FilterChip>
            <FilterChip pressed={withPowerMembers} onChange={setPowerMembers}>
              {t('directory.filterPowerMembers')}
            </FilterChip>
          </>
        }
      >
        {(members.isError || sections.isError) && (
          <Message kind="danger">{t('errors.unreachable')}</Message>
        )}
        {members.isPending && <p role="status">{t('shell.loading')}</p>}
        <ul className="members-grid">
          {shown.map((member) => (
            <li key={member.id}>
              <MemberCard
                nickname={member.nickname}
                instrument={instrumentOf(member)?.name ?? ''}
                sectionIcon={instrumentOf(member)?.icon ?? null}
                photoUrl={member.photoUrl}
                powerMemberLabel={
                  member.status === 'POWER_MEMBER' ? t('member.status.POWER_MEMBER') : undefined
                }
                onPress={() => setOpenId(member.id)}
              />
            </li>
          ))}
        </ul>
      </AppLayout>

      <Panel open={open !== undefined} onClose={() => setOpenId(null)} title={open?.nickname ?? ''}>
        {open && (
          <MemberSheet
            member={open}
            instrument={instrumentOf(open)?.name ?? ''}
            sectionIcon={instrumentOf(open)?.icon ?? null}
          />
        )}
      </Panel>
    </>
  );
}

type SheetProps = { member: Member; instrument: string; sectionIcon: string | null };

// Figma: Members / Directory — member sheet. What a member gave to be
// reached: a line that is missing is not shown, and an action that cannot be
// done is not offered. (The Discord action is drawn, and waits for the
// Discord feature.)
function MemberSheet({ member, instrument, sectionIcon }: SheetProps) {
  const { t, i18n } = useTranslation();
  const bandCountry = useBand().data?.defaultCountryCode ?? '';
  const phone = phoneForDisplay(member.mobilePhone, bandCountry);

  const cityLine = [member.postalCode, member.city].filter(Boolean).join(' ');
  const country =
    member.countryCode && member.countryCode !== bandCountry
      ? countryName(member.countryCode, i18n.language)
      : '';
  const address = [member.streetAddress, cityLine, country].filter(Boolean).join(', ');

  return (
    <div className="members-sheet">
      <MemberHeader
        nickname={member.nickname}
        title={`${member.firstName} ${member.lastName}`}
        instrument={instrument}
        sectionIcon={sectionIcon}
        photoUrl={member.photoUrl}
        status={
          member.status === 'POWER_MEMBER' && (
            <Chip kind="accent" icon="Biceps">
              {t('member.status.POWER_MEMBER')}
            </Chip>
          )
        }
      />
      <div className="members-actions">
        {member.mobilePhone && (
          <QuickAction
            icon="Phone"
            label={t('directory.call')}
            href={`tel:${member.mobilePhone}`}
          />
        )}
        <QuickAction
          icon="Mail"
          label={t('directory.write')}
          href={`mailto:${encodeURIComponent(member.email).replace('%40', '@')}`}
        />
      </div>
      <div>
        {member.mobilePhone && <NavRow icon="Phone" label={phone} />}
        <NavRow icon="Mail" label={member.email} />
        {address && (
          <NavRow
            icon="MapPin"
            label={address}
            detail={member.addressInstructions ?? undefined}
            trailing={
              <a
                className="Button textButton"
                data-kind="secondary"
                data-size="small"
                href={mapsAddress(address)}
              >
                {t('directory.goThere')}
              </a>
            }
          />
        )}
      </div>
    </div>
  );
}
