import { createBrowserRouter } from 'react-router';
import { HomeScreen } from './screens/HomeScreen.tsx';
import { BandScreen } from './screens/install/BandScreen.tsx';
import { DoneScreen } from './screens/install/DoneScreen.tsx';
import { InstallDraftProvider } from './screens/install/InstallDraft.tsx';
import { MemberScreen } from './screens/install/MemberScreen.tsx';
import { SectionsScreen } from './screens/install/SectionsScreen.tsx';
import { WelcomeScreen } from './screens/install/WelcomeScreen.tsx';
import { NotFoundScreen } from './screens/NotFoundScreen.tsx';

// Every address of the app and the screen it shows, in one place.
export const router = createBrowserRouter([
  { path: '/', element: <HomeScreen /> },
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
