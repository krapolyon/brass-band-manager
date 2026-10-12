import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { instrumentsOf, useSections } from '../members.ts';
import { useMe } from '../session.ts';
import { BandMention } from './BandMention.tsx';
import { Halo } from './Halo.tsx';
import { Icon } from './Icon.tsx';
import { MemberMention } from './MemberMention.tsx';
import { type NavKey, navEntries } from './nav.ts';
import './SideNav.css';

type Props = { current: NavKey };

// Figma: SideNav. The navigation of the app on a desktop: a floating glass
// menu, 16 px from the edges of the window and as tall as it. The band at
// the top, the five entries, the signed-in member at the foot. The halo
// lights the top of the menu only.
export function SideNav({ current }: Props) {
  const { t } = useTranslation();
  const me = useMe().data;
  const instrument = instrumentsOf(useSections().data).find(
    (other) => other.id === me?.instrumentId,
  );

  return (
    <nav className="SideNav" aria-label={t('nav.label')}>
      <Halo />
      <div className="SideNav-glass" />
      <div className="SideNav-top">
        <BandMention />
        <div className="SideNav-entries">
          {navEntries.map((entry) => (
            <Link
              key={entry.key}
              className="textBodyLarge"
              to={entry.to}
              aria-current={entry.key === current ? 'page' : undefined}
            >
              <Icon name={entry.icon} />
              {t(`nav.${entry.key}`)}
            </Link>
          ))}
        </div>
      </div>
      {me && (
        <MemberMention nickname={me.nickname} detail={instrument?.name} photoUrl={me.photoUrl} />
      )}
    </nav>
  );
}
