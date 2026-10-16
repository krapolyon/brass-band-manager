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
import {
  type Gig,
  type GigStatus,
  gigStatuses,
  nearestSlot,
  nextStatuses,
  sectionNames,
} from '../../gigs.ts';
import { useMembers, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import { attendanceOf } from './attendance.ts';
import { inSentence } from './format.ts';

type Step = 'menu' | 'status' | 'force' | 'delete';
type Props = {
  gig: Gig;
  open: boolean;
  onClose: () => void;
  /** The step it opens on: the menu from the more button, "status" or "delete" from a button of the gig. */
  start?: 'menu' | 'status' | 'delete';
};

// Figma: Gigs / Gig — the more menu (section 16) and Gigs / Status (sections
// 6 and 16). What who may edit a gig does with it: open its form, change its
// status, delete it while it is a draft nobody answered. The five statuses
// stay listed; one the model does not allow after the current one (the API
// decides) cannot be chosen, and says why. Forcing "Validé" while a section
// has no yes asks first, and so does deleting.
/** What a row of the status panel says, seen from the status the gig has. */
function detailKey(current: GigStatus, status: GigStatus) {
  if (current === 'CONFIRMED' && status === 'CONFIRMED')
    return 'gigs.statusPanel.detailFromConfirmed.CONFIRMED';
  if (current === 'CONFIRMED' && status === 'PROPOSED')
    return 'gigs.statusPanel.detailFromConfirmed.PROPOSED';
  return `gigs.statusPanel.detail.${status}` as const;
}

export function ManagePanel({ gig, open, onClose, start = 'menu' }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const sections = useSections().data;
  const members = useMembers().data;
  const [chosen, setChosen] = useState<GigStatus>(gig.status);
  const [step, setStep] = useState<Step>(start);

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

  const resetSave = save.reset;
  const resetRemove = remove.reset;
  // Each opening starts from the status the gig has.
  useEffect(() => {
    if (open) {
      setChosen(gig.status);
      setStep(start);
      // What failed the last time is not said again.
      resetSave();
      resetRemove();
    }
  }, [open, gig.status, start, resetSave, resetRemove]);

  const mayDelete = me?.permissions.includes('manageGigs') ?? false;
  const canDelete = gig.status === 'DRAFT' && gig.slots.every((slot) => slot.answers.length === 0);
  const nearest = nearestSlot(gig.slots);
  const missing = sectionNames(sections, nearest?.missingSectionIds ?? []);
  // "Riton a dit non, Jibé n’a pas répondu": the members of the sections without a yes.
  const absent = nearest
    ? attendanceOf(nearest, members ?? [], sections ?? [], i18n.language, false)
        .sections.filter(({ section }) => nearest.missingSectionIds.includes(section.id))
        .flatMap(({ attendees }) => attendees)
        .map(({ nickname, answer }) => t(`gigs.statusPanel.said.${answer ?? 'NONE'}`, { nickname }))
        .join(', ')
    : '';
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
        : step === 'menu'
          ? gig.name
          : t('gigs.statusPanel.title');

  return (
    <Panel open={open} onClose={onClose} title={title}>
      {step === 'menu' && (
        <div className="gigs-menu">
          <NavRow icon="Pencil" label={t('gigs.gig.edit')} to={`/gigs/${gig.id}/edit`} />
          <NavRow
            icon="CalendarTick"
            label={t('gigs.gig.changeStatus')}
            chevron
            onClick={() => setStep('status')}
          />
          {mayDelete && (
            <NavRow
              icon="Trash"
              tone="danger"
              label={t('gigs.gig.delete')}
              detail={t('gigs.gig.deleteDetail')}
              disabled={!canDelete}
              onClick={() => setStep('delete')}
            />
          )}
        </div>
      )}
      {step === 'status' && (
        <div className="gigs-sheet">
          <p className="gigs-muted textBody">{t('gigs.statusPanel.lead')}</p>
          <div className="gigs-rows" role="radiogroup" aria-label={t('gigs.statusPanel.title')}>
            {gigStatuses.map((status) => {
              const isAllowed = status === gig.status || nextStatuses[gig.status].includes(status);
              return (
                <ListRow
                  key={status}
                  label={t(`gigs.status.${status}`)}
                  detail={
                    isAllowed
                      ? t(detailKey(gig.status, status))
                      : t('gigs.statusPanel.notAllowed', {
                          status: t(`gigs.status.${gig.status}`),
                        })
                  }
                  group="gigStatus"
                  selected={chosen === status}
                  disabled={!isAllowed}
                  onSelect={() => setChosen(status)}
                />
              );
            })}
          </div>
          {/* Figma: Gigs, section 6, "a confirmed gig put back to Accepté, still playable". */}
          {gig.status === 'CONFIRMED' && chosen === 'ACCEPTED' && gig.isPlayable && (
            <Message kind="warning">{t('gigs.statusPanel.confirmedAgain')}</Message>
          )}
          {save.isError && <Message kind="danger">{t('gigs.statusPanel.failed')}</Message>}
          <Button disabled={save.isPending} onClick={submit}>
            {t('gigs.statusPanel.save')}
          </Button>
        </div>
      )}
      {step === 'force' && (
        <div className="gigs-sheet">
          <p className="textBody">
            {t('gigs.statusPanel.forceLead', { sections: inSentence(missing, i18n.language) })}
          </p>
          <Message kind="warning">
            {t('gigs.statusPanel.forceMissing', { sections: missing.join(', ') })}
            {absent && ` ${absent}.`}
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
          <Button kind="quiet" onClick={onClose}>
            {t('gigs.statusPanel.keepDraft')}
          </Button>
        </div>
      )}
    </Panel>
  );
}
