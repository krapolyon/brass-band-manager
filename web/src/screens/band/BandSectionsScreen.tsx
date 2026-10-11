import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../api.ts';
import { Button } from '../../components/Button.tsx';
import { InstrumentRow } from '../../components/InstrumentRow.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { pictogramNames } from '../../components/Pictogram.tsx';
import { PictogramChoice } from '../../components/PictogramChoice.tsx';
import { SectionCard } from '../../components/SectionCard.tsx';
import { SelectField, TextField } from '../../components/TextField.tsx';
import { type Instrument, type Section, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import { AdminsOnlyScreen } from './BandSettingsScreen.tsx';
import './band.css';

const NAME_MAX_LENGTH = 50;

type Opened =
  | { kind: 'section'; key: number; section: Section | null }
  | { kind: 'instrument'; key: number; sectionId: number; instrument: Instrument | null };

// Figma: Band settings / Sections, and its sheets. The sections and the
// instruments of the band, as at install; here each change is saved at once,
// from its sheet (model/members.md, entry 2).
export function BandSectionsScreen() {
  const { t } = useTranslation();
  // The permission the API asks for on these routes.
  const me = useMe().data;
  const canManage = me ? me.permissions.includes('manageSections') : null;
  const sections = useSections();
  const [opened, setOpened] = useState<Opened | null>(null);
  const [isOpen, setOpen] = useState(false);
  const [key, setKey] = useState(0);

  if (canManage === null) return null;
  if (!canManage) return <AdminsOnlyScreen />;

  // A form starts empty each time its panel opens.
  const open = (next: Opened) => {
    setKey(key + 1);
    setOpened(next);
    setOpen(true);
  };
  const close = () => setOpen(false);
  const all = sections.data ?? [];

  const panelTitle =
    opened?.kind === 'section'
      ? t(opened.section ? 'install.sections.section.title' : 'install.sections.section.titleNew')
      : t(
          opened?.instrument
            ? 'install.sections.instrument.title'
            : 'install.sections.instrument.titleNew',
        );

  return (
    <>
      <AppLayout
        current="settings"
        back="/band"
        backLabel={t('band.title')}
        title={t('band.sections.title')}
        subtitle={t('band.sections.lead')}
      >
        {sections.isError && <Message kind="danger">{t('errors.unreachable')}</Message>}
        <div className="band-sections">
          {all.map((section) => (
            <SectionCard
              key={section.id}
              name={section.name}
              editLabel={t('install.sections.section.edit', { name: section.name })}
              onEdit={() => open({ kind: 'section', key, section })}
              addLabel={t('install.sections.instrument.add')}
              onAdd={() =>
                open({ kind: 'instrument', key, sectionId: section.id, instrument: null })
              }
            >
              {section.instruments.map((instrument) => (
                <InstrumentRow
                  key={instrument.id}
                  name={instrument.name}
                  choice="listed"
                  detail={t('band.sections.players', { count: instrument.memberCount })}
                  moreLabel={t('install.sections.instrument.edit', { name: instrument.name })}
                  onMore={() =>
                    open({ kind: 'instrument', key, sectionId: section.id, instrument })
                  }
                />
              ))}
            </SectionCard>
          ))}
        </div>
        <div className="band-start">
          <Button
            kind="secondary"
            icon="Plus"
            onClick={() => open({ kind: 'section', key, section: null })}
          >
            {t('install.sections.section.add')}
          </Button>
        </div>
      </AppLayout>

      <Panel open={isOpen} onClose={close} title={panelTitle}>
        {opened?.kind === 'instrument' && (
          <InstrumentForm key={opened.key} opened={opened} sections={all} onDone={close} />
        )}
        {opened?.kind === 'section' && (
          <SectionForm key={opened.key} opened={opened} sections={all} onDone={close} />
        )}
      </Panel>
    </>
  );
}

type FormProps<Kind extends Opened['kind']> = {
  opened: Extract<Opened, { kind: Kind }>;
  sections: Section[];
  /** Called once the change is saved: the panel closes. */
  onDone: () => void;
};

// Every change answers with the whole list, since moving or deleting one row
// renumbers the others: the screen shows that answer.
function useChange(onDone: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: 'POST' | 'PUT' | 'DELETE';
      body?: unknown;
    }) => api<Section[]>(path, { method, body }),
    onSuccess: (sections) => {
      queryClient.setQueryData(['sections'], sections);
      // The directory shows the pictogram and the section of each member.
      queryClient.invalidateQueries({ queryKey: ['members'] });
      onDone();
    },
  });
}

/** What a refused change says under the name; null when the name is not the problem. */
function nameProblem(name: string, error: unknown): 'missing' | 'taken' | null {
  if (name.trim() === '') return 'missing';
  if (error instanceof ApiError && error.fields.name === 'duplicate') return 'taken';
  if (error instanceof ApiError && error.fields.name) return 'missing';
  return null;
}

// Figma: the sheet of an instrument, and of a new one.
function InstrumentForm({ opened, sections, onDone }: FormProps<'instrument'>) {
  const { t } = useTranslation();
  const { instrument } = opened;
  const change = useChange(onDone);
  const [name, setName] = useState(instrument?.name ?? '');
  const [sectionId, setSectionId] = useState(opened.sectionId);
  const [wasSent, setSent] = useState(false);
  const noteId = useId();
  const players = instrument?.memberCount ?? 0;
  const problem = wasSent ? nameProblem(name, change.error) : null;

  const save = (event: FormEvent) => {
    event.preventDefault();
    setSent(true);
    if (name.trim() === '' || change.isPending) return;
    change.mutate({
      path: instrument ? `/api/instruments/${instrument.id}` : '/api/instruments',
      method: instrument ? 'PUT' : 'POST',
      body: { name, sectionId },
    });
  };

  return (
    <form className="FlowLayout-panelForm" onSubmit={save} noValidate>
      {change.isError && !problem && <Message kind="danger">{t('errors.unreachable')}</Message>}
      <TextField
        label={t('install.sections.name.label')}
        hint={instrument ? undefined : t('install.sections.name.hint')}
        error={problem ? t(`install.sections.name.${problem}`) : undefined}
        name="instrumentName"
        autoComplete="off"
        maxLength={NAME_MAX_LENGTH}
        data-autofocus
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <SelectField
        label={t('install.sections.instrument.section')}
        hint={players > 0 ? t('band.sections.moveNote', { count: players }) : undefined}
        value={String(sectionId)}
        onChange={(value) => setSectionId(Number(value))}
        options={sections.map((section) => ({ value: String(section.id), label: section.name }))}
      />
      <div className="FlowLayout-panelActions">
        <Button type="submit" disabled={change.isPending}>
          {instrument ? t('install.sections.save') : t('install.sections.instrument.confirmNew')}
        </Button>
        {instrument && (
          <>
            {/* An action that cannot be done stays visible, with its reason and the numbers. */}
            <Button
              kind="danger"
              icon="Trash"
              disabled={players > 0 || change.isPending}
              aria-describedby={players > 0 ? noteId : undefined}
              onClick={() =>
                change.mutate({ path: `/api/instruments/${instrument.id}`, method: 'DELETE' })
              }
            >
              {t('install.sections.instrument.remove')}
            </Button>
            {players > 0 && (
              <p className="textCaption" id={noteId}>
                {t('band.sections.instrumentInUse', { count: players })}
              </p>
            )}
          </>
        )}
      </div>
    </form>
  );
}

// Figma: the sheet of a section, and of a new one: its name, its pictogram,
// its place in the lists, and its deletion when it is empty.
function SectionForm({ opened, sections, onDone }: FormProps<'section'>) {
  const { t } = useTranslation();
  const { section } = opened;
  const change = useChange(onDone);
  const [name, setName] = useState(section?.name ?? '');
  const [icon, setIcon] = useState(section?.icon ?? null);
  const [position, setPosition] = useState(sections.findIndex((other) => other.id === section?.id));
  const [wasSent, setSent] = useState(false);
  const noteId = useId();
  const orderId = useId();
  const pictograms = useId();
  const problem = wasSent ? nameProblem(name, change.error) : null;
  const instrumentCount = section?.instruments.length ?? 0;
  const players = (section?.instruments ?? []).reduce(
    (count, instrument) => count + instrument.memberCount,
    0,
  );

  const save = (event: FormEvent) => {
    event.preventDefault();
    setSent(true);
    if (name.trim() === '' || change.isPending) return;
    change.mutate(
      section
        ? {
            path: `/api/sections/${section.id}`,
            method: 'PUT',
            body: { name, icon, position: position + 1 },
          }
        : { path: '/api/sections', method: 'POST', body: { name, icon } },
    );
  };

  return (
    <form className="FlowLayout-panelForm" onSubmit={save} noValidate>
      {change.isError && !problem && <Message kind="danger">{t('errors.unreachable')}</Message>}
      <TextField
        label={t('install.sections.name.label')}
        hint={t('install.sections.name.hint')}
        error={problem ? t(`install.sections.name.${problem}`) : undefined}
        name="sectionName"
        autoComplete="off"
        maxLength={NAME_MAX_LENGTH}
        data-autofocus
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="band-field" role="radiogroup" aria-labelledby={`${pictograms}-label`}>
        <span className="textLabel" id={`${pictograms}-label`}>
          {t('band.sections.pictogram.label')}
        </span>
        <div className="band-pictograms">
          {/* The generic pictogram comes last, as in Figma. */}
          {[...pictogramNames, null].map((other) => (
            <PictogramChoice
              key={other ?? 'none'}
              icon={other}
              label={t(`band.sections.pictogram.${other ?? 'none'}`)}
              name={pictograms}
              checked={icon === other}
              onChange={() => setIcon(other)}
            />
          ))}
        </div>
        <span className="band-muted textCaption">{t('band.sections.pictogram.hint')}</span>
      </div>
      {section && (
        // biome-ignore lint/a11y/useSemanticElements: a fieldset cannot be laid out as this group is
        <div className="FlowLayout-order" role="group" aria-labelledby={orderId}>
          <span className="textLabel" id={orderId}>
            {t('install.sections.section.order')}
          </span>
          <div>
            <Button
              kind="secondary"
              size="small"
              icon="ArrowUp"
              disabled={position === 0}
              onClick={() => setPosition(position - 1)}
            >
              {t('install.sections.section.moveUp')}
            </Button>
            <Button
              kind="secondary"
              size="small"
              icon="ArrowDown"
              disabled={position === sections.length - 1}
              onClick={() => setPosition(position + 1)}
            >
              {t('install.sections.section.moveDown')}
            </Button>
            <span className="textCaption" aria-live="polite">
              {t('install.sections.section.position', {
                rank: t('install.sections.section.rank', { count: position + 1, ordinal: true }),
                total: sections.length,
              })}
            </span>
          </div>
        </div>
      )}
      <div className="FlowLayout-panelActions">
        <Button type="submit" disabled={change.isPending}>
          {t('install.sections.save')}
        </Button>
        {section && (
          <>
            <Button
              kind="danger"
              icon="Trash"
              disabled={instrumentCount > 0 || change.isPending}
              aria-describedby={instrumentCount > 0 ? noteId : undefined}
              onClick={() =>
                change.mutate({ path: `/api/sections/${section.id}`, method: 'DELETE' })
              }
            >
              {t('install.sections.section.delete')}
            </Button>
            {instrumentCount > 0 && (
              <p className="textCaption" id={noteId}>
                {t('band.sections.sectionNotEmpty', {
                  name: section.name,
                  instruments: t('install.sections.instrumentCount', { count: instrumentCount }),
                  players: t('band.sections.playerCount', { count: players }),
                })}
              </p>
            )}
          </>
        )}
      </div>
    </form>
  );
}
