import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useBand } from '../../band.ts';
import { afterSignIn, INSTALL_GUIDE } from '../../installGuide.ts';
import { isDatabaseBehind } from '../../migrations.ts';
import { useMe } from '../../session.ts';
import { AskNotifications } from '../settings/AskNotifications.tsx';
import { PlayerProvider } from '../songs/Player.tsx';

// Where an admin applies the migrations.
const MIGRATIONS = '/band/migrations';

// While the app does not know yet who is in front of it, or when the server
// does not answer. No loading screen is designed: this says it in words.
function Waiting({ isError }: { isError: boolean }) {
  const { t } = useTranslation();
  const state = isError ? 'unreachable' : 'loading';

  return (
    <main>
      <p role="status" data-state={state}>
        {t(`shell.${state}`)}
      </p>
    </main>
  );
}

// Around the screens of the app: they are for signed-in members. Anyone else
// goes to the sign-in screen, or to the install on an instance that has no
// band yet.
export function MembersOnly() {
  const me = useMe();
  const band = useBand();
  const { pathname } = useLocation();
  // Asking again who is signed in, after "databaseBehind", puts the query
  // back to pending (it has no data): the screen of the migrations stays in
  // place meanwhile, with what it says, instead of a loading text that would
  // remove it and ask again when it comes back.
  const wasBehind = useRef(false);
  if (isDatabaseBehind(me.error)) wasBehind.current = true;
  else if (me.isSuccess) wasBehind.current = false;
  const isBehind = isDatabaseBehind(me.error) || (wasBehind.current && me.isFetching);

  if ((me.isPending && !isBehind) || band.isPending) return <Waiting isError={false} />;
  if (band.data === null) return <Navigate to="/install" replace />;
  // A new version whose migrations wait: nothing works but the screen that
  // applies them, which tells a member who is not an admin to come back later.
  if (isBehind && pathname !== MIGRATIONS) return <Navigate to={MIGRATIONS} replace />;
  if (!isBehind && (me.isError || band.isError)) return <Waiting isError />;
  // Not "nobody": after a sign-in on a database behind, the query still
  // holds the null of before beside its error.
  if (!isBehind && me.data === null) return <Navigate to="/sign-in" replace />;

  // The recording that plays goes on from a screen to another, and stops
  // with the session. One frame whether the database is behind or not, so
  // that the screen of the migrations stays as it is, with what it says, once
  // they are applied.
  return (
    <PlayerProvider>
      <Outlet />
      {/* Asked once on a device that was never asked; not over the install
          guide, which comes first on a phone. */}
      {!isBehind && pathname !== INSTALL_GUIDE && <AskNotifications />}
    </PlayerProvider>
  );
}

// Around the screens shown before sign-in: a member already signed in on this
// device has nothing to do there. This is also where signing in leads on, as
// soon as the session is known: home, or the install guide the first time on
// a phone.
export function VisitorsOnly() {
  const me = useMe();
  const band = useBand();

  if (me.isPending || band.isPending) return <Waiting isError={false} />;
  if (band.data === null) return <Navigate to="/install" replace />;
  if (me.data) return <Navigate to={afterSignIn()} replace />;
  // Signed in, on a database behind the code (see MembersOnly).
  if (isDatabaseBehind(me.error)) return <Navigate to={MIGRATIONS} replace />;

  return <Outlet />;
}
