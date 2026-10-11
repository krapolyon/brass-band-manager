import { createBrowserRouter } from 'react-router';
import { ForgotPasswordScreen } from './screens/access/ForgotPasswordScreen.tsx';
import { MembersOnly, VisitorsOnly } from './screens/access/Guards.tsx';
import { PasswordLinkScreen } from './screens/access/PasswordLinkScreen.tsx';
import { SignInScreen } from './screens/access/SignInScreen.tsx';
import { ComingSoonScreen } from './screens/ComingSoonScreen.tsx';
import { BandScreen } from './screens/install/BandScreen.tsx';
import { DoneScreen } from './screens/install/DoneScreen.tsx';
import { InstallDraftProvider } from './screens/install/InstallDraft.tsx';
import { MemberScreen } from './screens/install/MemberScreen.tsx';
import { SectionsScreen } from './screens/install/SectionsScreen.tsx';
import { WelcomeScreen } from './screens/install/WelcomeScreen.tsx';
import { DirectoryScreen } from './screens/members/DirectoryScreen.tsx';
import { NotFoundScreen } from './screens/NotFoundScreen.tsx';

// Every address of the app and the screen it shows, in one place.
export const router = createBrowserRouter([
  {
    // The app itself: for signed-in members.
    element: <MembersOnly />,
    children: [
      { path: '/', element: <ComingSoonScreen tab="home" /> },
      { path: '/songs', element: <ComingSoonScreen tab="songs" /> },
      { path: '/gigs', element: <ComingSoonScreen tab="gigs" /> },
      { path: '/members', element: <DirectoryScreen /> },
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
