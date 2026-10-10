import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import i18n from './i18n.ts';
import { router } from './router.tsx';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/text.css';
import './styles/base.css';

// Starting point of the front. See docs/architecture.md, "The front".

document.documentElement.lang = i18n.language;
document.title = i18n.t('app.name');

// Keeps what the API answered, and asks again when the app comes back to the
// foreground: this is how screens stay fresh without real time.
//
// A request that fails is tried once more, half a second later, before the
// screen says that the server does not answer: enough for a network that
// hiccups, without leaving the member in front of a screen that says nothing.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, retryDelay: 500 } },
});

const root = document.getElementById('root');
if (!root) {
  throw new Error('index.html has no #root element');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
