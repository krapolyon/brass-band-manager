import type { IconName } from './Icon.tsx';

// The five entries of the navigation, the same in the TabBar of a phone and
// in the SideNav of a desktop.
export const navEntries = [
  { key: 'home', to: '/', icon: 'Home' },
  { key: 'songs', to: '/songs', icon: 'Music' },
  { key: 'gigs', to: '/gigs', icon: 'Calendar' },
  { key: 'members', to: '/members', icon: 'Users' },
  { key: 'settings', to: '/settings', icon: 'Settings' },
] as const satisfies readonly { key: string; to: string; icon: IconName }[];

export type NavKey = (typeof navEntries)[number]['key'];
