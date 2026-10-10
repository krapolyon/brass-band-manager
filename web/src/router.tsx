import { createBrowserRouter } from 'react-router';
import { HomeScreen } from './screens/HomeScreen.tsx';
import { InstallDraftProvider } from './screens/install/InstallDraft.tsx';
import { WelcomeScreen } from './screens/install/WelcomeScreen.tsx';
import { NotFoundScreen } from './screens/NotFoundScreen.tsx';

// Every address of the app and the screen it shows, in one place.
export const router = createBrowserRouter([
  { path: '/', element: <HomeScreen /> },
  {
    // The screens of the install share what has been entered so far.
    path: '/install',
    element: <InstallDraftProvider />,
    children: [{ index: true, element: <WelcomeScreen /> }],
  },
  { path: '*', element: <NotFoundScreen /> },
]);
