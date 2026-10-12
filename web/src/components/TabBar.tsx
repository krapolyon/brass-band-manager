import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Icon } from './Icon.tsx';
import { type NavKey, navEntries } from './nav.ts';
import './TabBar.css';

type Props = { current: NavKey };

// Figma: TabBar. The navigation of the app on a phone and a tablet: it floats
// above the content. The current tab is told by its filled pill and by its
// colour, and to screen readers by aria-current. From a text size of 160 %
// the labels no longer fit: only the icons show (TabBar.css), and each entry
// keeps its name for screen readers.
export function TabBar({ current }: Props) {
  const { t } = useTranslation();

  return (
    <nav className="TabBar" aria-label={t('nav.label')}>
      {navEntries.map((entry) => (
        <Link
          key={entry.key}
          to={entry.to}
          aria-current={entry.key === current ? 'page' : undefined}
        >
          <Icon name={entry.icon} />
          <span className="textMicro">{t(`nav.${entry.key}`)}</span>
        </Link>
      ))}
    </nav>
  );
}
