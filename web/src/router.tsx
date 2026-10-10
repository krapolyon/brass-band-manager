import { createBrowserRouter } from 'react-router';
import { HomeScreen } from './screens/HomeScreen.tsx';
import { NotFoundScreen } from './screens/NotFoundScreen.tsx';

// Every address of the app and the screen it shows, in one place.
export const router = createBrowserRouter([
  { path: '/', element: <HomeScreen /> },
  { path: '*', element: <NotFoundScreen /> },
]);
