import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { Chip } from '../../components/Chip.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { Message } from '../../components/Message.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { FlowLayout } from '../FlowLayout.tsx';
import { useInstallDraft } from './InstallDraft.tsx';

// Figma: Install / Done. Shown once, right after the install: the first
// member is signed in. Opened in any other way, it has nothing to show.
export function DoneScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { summary } = useInstallDraft().draft;

  if (!summary) {
    return <Navigate to="/" replace />;
  }

  return (
    <FlowLayout
      nav={
        <Chip kind="success" icon="Check">
          {t('install.done.chip')}
        </Chip>
      }
      title={t('install.done.title')}
      lead={t('install.done.lead')}
      actions={
        <BottomBar>
          {/* Inviting belongs to the members feature, which is not built yet:
              for now both buttons lead to the home address. */}
          <Button onClick={() => navigate('/')}>{t('install.done.invite')}</Button>
          <Button kind="quiet" onClick={() => navigate('/')}>
            {t('install.done.home')}
          </Button>
        </BottomBar>
      }
    >
      <Sheet>
        <ListRow label={summary.bandName} detail={t('install.done.bandDetail')} />
        <ListRow
          label={t('install.done.sections', {
            sections: t('install.sections.sectionCount', { count: summary.sectionCount }),
            instruments: t('install.sections.instrumentCount', { count: summary.instrumentCount }),
          })}
          detail={t('install.done.sectionsDetail')}
        />
        <ListRow
          label={summary.nickname}
          detail={t('install.done.memberDetail', { instrument: summary.instrument })}
        />
      </Sheet>
      <Message>{t('install.done.note')}</Message>
    </FlowLayout>
  );
}
