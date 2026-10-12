import { useTranslation } from 'react-i18next';
import { Navigate, Outlet } from 'react-router';
import { useBand } from '../../band.ts';
import { HOME, useMe } from '../../session.ts';

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

  if (me.isPending || band.isPending) return <Waiting isError={false} />;
  if (band.data === null) return <Navigate to="/install" replace />;
  if (me.isError || band.isError) return <Waiting isError />;
  if (me.data === null) return <Navigate to="/sign-in" replace />;

  return <Outlet />;
}

// Around the screens shown before sign-in: a member already signed in on this
// device has nothing to do there.
export function VisitorsOnly() {
  const me = useMe();
  const band = useBand();

  if (me.isPending || band.isPending) return <Waiting isError={false} />;
  if (band.data === null) return <Navigate to="/install" replace />;
  if (me.data) return <Navigate to={HOME} replace />;

  return <Outlet />;
}
