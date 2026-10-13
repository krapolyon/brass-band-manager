import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { Button } from '../../components/Button.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { Message } from '../../components/Message.tsx';
import { NavRow } from '../../components/NavRow.tsx';
import { Panel } from '../../components/Panel.tsx';
import { type Gig, type GigStatus, nearestSlot, nextStatuses, sectionNames } from '../../gigs.ts';
import { useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import { inSentence } from './format.ts';

type Step = 'status' | 'force' | 'delete';
type Props = {
  gig: Gig;
  open: boolean;
  onClose: () => void;
  /** The step it opens on: "delete" from the button that deletes a draft. */
  start?: 'status' | 'delete';
};

// Figma: Gigs / Status (section 6). What who may edit a gig does with it:
// change its status, from the statuses the model allows after the current one
// (the API decides); open its form; delete it while it is a draft. Forcing
// "Validé" while a section has no yes asks first, and so does deleting.
export function ManagePanel({ gig, open, onClose, start = 'status' }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const sections = useSections().data;
  const [chosen, setChosen] = useState<GigStatus>(gig.status);
  const [step, setStep] = useState<Step>(start);

  // Each opening starts from the status the gig has.
  useEffect(() => {
    if (open) {
      setChosen(gig.status);
      setStep(start);
    }
  }, [open, gig.status, start]);

  const save = useMutation({
    mutationFn: (status: GigStatus) =>
      api<Gig>(`/api/gigs/${gig.id}/status`, { method: 'PUT', body: { status } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['gig', gig.id], saved);
      queryClient.invalidateQueries({ queryKey: ['gigs'] });
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/gigs/${gig.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gigs'] });
      queryClient.removeQueries({ queryKey: ['gig', gig.id] });
      onClose();
      navigate('/gigs');
    },
  });

  const canDelete = gig.status === 'DRAFT' && (me?.permissions.includes('manageGigs') ?? false);
  const missing = sectionNames(sections, nearestSlot(gig.slots)?.missingSectionIds ?? []);
  const statuses = [gig.status, ...nextStatuses[gig.status]];
  const submit = () => {
    if (chosen === gig.status) return onClose();
    if (chosen === 'CONFIRMED' && !gig.isPlayable) return setStep('force');
    save.mutate(chosen);
  };
  const hasAnswers = remove.error instanceof ApiError && remove.error.error === 'gigHasAnswers';

  const title =
    step === 'force'
      ? t('gigs.statusPanel.forceTitle', { sections: inSentence(missing, i18n.language) })
      : step === 'delete'
        ? t('gigs.statusPanel.deleteTitle')
        : t('gigs.statusPanel.title');

  return (
    <Panel open={open} onClose={onClose} title={title}>
      {step === 'status' && (
        <div className="gigs-sheet">
          <NavRow icon="Pencil" label={t('gigs.gig.edit')} to={`/gigs/${gig.id}/edit`} />
          <p className="gigs-muted textBody">{t('gigs.statusPanel.lead')}</p>
          <div className="gigs-rows" role="radiogroup" aria-label={t('gigs.statusPanel.title')}>
            {statuses.map((status) => (
              <ListRow
                key={status}
                label={t(`gigs.status.${status}`)}
                detail={t(`gigs.statusPanel.detail.${status}`)}
                group="gigStatus"
                selected={chosen === status}
                onSelect={() => setChosen(status)}
              />
            ))}
          </div>
          {save.isError && <Message kind="danger">{t('gigs.statusPanel.failed')}</Message>}
          <Button disabled={save.isPending} onClick={submit}>
            {t('gigs.statusPanel.save')}
          </Button>
          {canDelete && (
            <Button kind="danger" icon="Trash" onClick={() => setStep('delete')}>
              {t('gigs.statusPanel.delete')}
            </Button>
          )}
        </div>
      )}
      {step === 'force' && (
        <div className="gigs-sheet">
          <p className="textBody">{t('gigs.statusPanel.forceLead')}</p>
          <Message kind="warning">
            {t('gigs.statusPanel.forceMissing', { sections: missing.join(', ') })}
          </Message>
          {save.isError && <Message kind="danger">{t('gigs.statusPanel.failed')}</Message>}
          <Button icon="Check" disabled={save.isPending} onClick={() => save.mutate('CONFIRMED')}>
            {t('gigs.statusPanel.force')}
          </Button>
          <Button kind="quiet" onClick={() => setStep('status')}>
            {t('gigs.statusPanel.keep', { status: t(`gigs.status.${gig.status}`) })}
          </Button>
        </div>
      )}
      {step === 'delete' && (
        <div className="gigs-sheet">
          <p className="textBody">{t('gigs.statusPanel.deleteLead')}</p>
          {remove.isError && (
            <Message kind="danger">
              {t(hasAnswers ? 'gigs.statusPanel.hasAnswers' : 'gigs.statusPanel.failed')}
            </Message>
          )}
          <Button
            kind="danger"
            icon="Trash"
            disabled={remove.isPending || hasAnswers}
            onClick={() => remove.mutate()}
          >
            {t('gigs.statusPanel.delete')}
          </Button>
          <Button kind="quiet" onClick={() => setStep('status')}>
            {t('gigs.statusPanel.keepDraft')}
          </Button>
        </div>
      )}
    </Panel>
  );
}
