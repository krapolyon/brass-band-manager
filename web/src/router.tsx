import { createBrowserRouter } from 'react-router';
import { ForgotPasswordScreen } from './screens/access/ForgotPasswordScreen.tsx';
import { MembersOnly, VisitorsOnly } from './screens/access/Guards.tsx';
import { PasswordLinkScreen } from './screens/access/PasswordLinkScreen.tsx';
import { SignInScreen } from './screens/access/SignInScreen.tsx';
import { BandAppearanceScreen } from './screens/band/BandAppearanceScreen.tsx';
import { BandSectionsScreen } from './screens/band/BandSectionsScreen.tsx';
import { BandSettingsScreen } from './screens/band/BandSettingsScreen.tsx';
import { BandSpellingsScreen } from './screens/band/BandSpellingsScreen.tsx';
import { ComingSoonScreen } from './screens/ComingSoonScreen.tsx';
import { BandScreen } from './screens/install/BandScreen.tsx';
import { DoneScreen } from './screens/install/DoneScreen.tsx';
import { InstallDraftProvider } from './screens/install/InstallDraft.tsx';
import { MemberScreen } from './screens/install/MemberScreen.tsx';
import { SectionsScreen } from './screens/install/SectionsScreen.tsx';
import { WelcomeScreen } from './screens/install/WelcomeScreen.tsx';
import { DirectoryScreen } from './screens/members/DirectoryScreen.tsx';
import { InviteScreen } from './screens/members/InviteScreen.tsx';
import { ManageListScreen } from './screens/members/ManageListScreen.tsx';
import { ManageMemberScreen } from './screens/members/ManageMemberScreen.tsx';
import { NotFoundScreen } from './screens/NotFoundScreen.tsx';
import { AccessibilityScreen } from './screens/settings/AccessibilityScreen.tsx';
import { AppearanceScreen } from './screens/settings/AppearanceScreen.tsx';
import { PasswordScreen } from './screens/settings/PasswordScreen.tsx';
import { ProfileScreen } from './screens/settings/ProfileScreen.tsx';
import { SettingsScreen } from './screens/settings/SettingsScreen.tsx';
import { ImportScreen } from './screens/songs/ImportScreen.tsx';
import { ManageSongsScreen } from './screens/songs/ManageSongsScreen.tsx';
import { SongEditScreen } from './screens/songs/SongEditScreen.tsx';
import { SongsScreen } from './screens/songs/SongsScreen.tsx';

// Every address of the app and the screen it shows, in one place.
export const router = createBrowserRouter([
  {
    // The app itself: for signed-in members.
    element: <MembersOnly />,
    children: [
      { path: '/', element: <ComingSoonScreen tab="home" /> },
      { path: '/songs', element: <SongsScreen /> },
      { path: '/songs/new', element: <ImportScreen /> },
      { path: '/songs/manage', element: <ManageSongsScreen /> },
      { path: '/songs/:id', element: <SongsScreen /> },
      { path: '/songs/:id/edit', element: <SongEditScreen /> },
      { path: '/gigs', element: <ComingSoonScreen tab="gigs" /> },
      { path: '/members', element: <DirectoryScreen /> },
      { path: '/members/manage', element: <ManageListScreen /> },
      { path: '/members/manage/invite', element: <InviteScreen /> },
      { path: '/members/manage/:id', element: <ManageMemberScreen /> },
      { path: '/band', element: <BandSettingsScreen /> },
      { path: '/band/appearance', element: <BandAppearanceScreen /> },
      { path: '/band/sections', element: <BandSectionsScreen /> },
      { path: '/band/spellings', element: <BandSpellingsScreen /> },
      { path: '/settings', element: <SettingsScreen /> },
      { path: '/settings/profile', element: <ProfileScreen /> },
      { path: '/settings/password', element: <PasswordScreen /> },
      { path: '/settings/appearance', element: <AppearanceScreen /> },
      { path: '/settings/accessibility', element: <AccessibilityScreen /> },
    ],
  },
  {
    // What is shown before sign-in.
    element: <VisitorsOnly />,
    children: [
      { path: '/sign-in', element: <SignInScreen /> },
      { path: '/forgot-password', element: <ForgotPasswordScreen /> },
    ],
  },
  // What a password link opens: the link wins over a session already open
  // on the device, which may be someone else's.
  { path: '/password', element: <PasswordLinkScreen /> },
  { path: '/invitation', element: <PasswordLinkScreen /> },
  {
    // The screens of the install share what has been entered so far.
    path: '/install',
    element: <InstallDraftProvider />,
    children: [
      { index: true, element: <WelcomeScreen /> },
      { path: 'band', element: <BandScreen /> },
      { path: 'sections', element: <SectionsScreen /> },
      { path: 'member', element: <MemberScreen /> },
      { path: 'done', element: <DoneScreen /> },
    ],
  },
  { path: '*', element: <NotFoundScreen /> },
]);
