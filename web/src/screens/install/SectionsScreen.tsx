import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { InstrumentRow } from '../../components/InstrumentRow.tsx';
import { Panel } from '../../components/Panel.tsx';
import { SectionCard } from '../../components/SectionCard.tsx';
import { SelectField, TextField } from '../../components/TextField.tsx';
import { FlowLayout } from '../FlowLayout.tsx';
import type { DraftInstrument, DraftSection } from './InstallDraft.tsx';
import { useInstallDraft } from './InstallDraft.tsx';
import { StepNav } from './StepNav.tsx';
import { countInstruments, keptSections, nameKey, nextId, useSections } from './sections.ts';

const NAME_MAX_LENGTH = 50;

// The panel that is open, if any. `key` makes each opening start from a fresh form.
type Opened =
  | { kind: 'instrument'; key: number; sectionId: number; instrument: DraftInstrument | null }
  | { kind: 'section'; key: number; section: DraftSection | null };

// Figma: Install / Sections, and its states: default, sticky bar, nothing
// chosen, edit an instrument, add an instrument, edit a section, long names.
export function SectionsScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { draft } = useInstallDraft();
  const [sections, setSections] = useSections();
  const [opened, setOpened] = useState<Opened | null>(null);
  const [isOpen, setOpen] = useState(false);

  const open = (panel: Opened) => {
    setOpened(panel);
    setOpen(true);
  };
  const close = () => setOpen(false);
  // A panel gives the focus back to the control that opened it. When a change
  // makes that control disappear, the form says where the focus goes instead.
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const change = (next: DraftSection[], focus?: string) => {
    setSections(next);
    setFocusTarget(focus ?? null);
    close();
  };
  useEffect(() => {
    if (!focusTarget) return;
    document.querySelector<HTMLElement>(focusTarget)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);
  if (draft.installKey === '') {
    return <Navigate to="/install" replace />;
  }

  const key = (opened?.key ?? 0) + 1;

  const kept = keptSections(sections);
  const instrumentCount = countInstruments(kept);

  const toggle = (instrumentId: number, isTicked: boolean) =>
    setSections(
      sections.map((section) => ({
        ...section,
        instruments: section.instruments.map((instrument) =>
          instrument.id === instrumentId ? { ...instrument, isTicked } : instrument,
        ),
      })),
    );

  const panelTitle =
    opened?.kind === 'section'
      ? opened.section
        ? t('install.sections.section.title')
        : t('install.sections.section.titleNew')
      : opened?.instrument
        ? t('install.sections.instrument.title')
        : t('install.sections.instrument.titleNew');

  return (
    <>
      <FlowLayout
        nav={<StepNav step={2} back="/install/band" />}
        title={t('install.sections.title')}
        lead={t('install.sections.lead')}
        width="cards"
        onSubmit={() => navigate('/install/member')}
        actions={
          <BottomBar
            surface="glass"
            caption={
              instrumentCount === 0
                ? { kind: 'warning', text: t('install.sections.nothingChosen') }
                : {
                    kind: 'info',
                    text: t('install.sections.summary', {
                      sections: t('install.sections.sectionCount', { count: kept.length }),
                      instruments: t('install.sections.instrumentCount', {
                        count: instrumentCount,
                      }),
                    }),
                  }
            }
          >
            <Button type="submit" disabled={instrumentCount === 0}>
              {t('install.continue')}
            </Button>
          </BottomBar>
        }
      >
        <div className="FlowLayout-columns">
          {sections.map((section) => (
            <SectionCard
              key={section.id}
              id={`section-${section.id}`}
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
                  choice={instrument.isTicked ? 'ticked' : 'unticked'}
                  onToggle={(isTicked) => toggle(instrument.id, isTicked)}
                  moreLabel={t('install.sections.instrument.edit', { name: instrument.name })}
                  onMore={() =>
                    open({ kind: 'instrument', key, sectionId: section.id, instrument })
                  }
                />
              ))}
            </SectionCard>
          ))}
        </div>
        <div className="FlowLayout-start">
          <Button
            kind="secondary"
            icon="Plus"
            onClick={() => open({ kind: 'section', key, section: null })}
          >
            {t('install.sections.section.add')}
          </Button>
        </div>
      </FlowLayout>

      <Panel open={isOpen} onClose={close} title={panelTitle}>
        {opened?.kind === 'instrument' && (
          <InstrumentForm key={opened.key} opened={opened} sections={sections} onChange={change} />
        )}
        {opened?.kind === 'section' && (
          <SectionForm key={opened.key} opened={opened} sections={sections} onChange={change} />
        )}
      </Panel>
    </>
  );
}

type FormProps<Kind extends Opened['kind']> = {
  opened: Extract<Opened, { kind: Kind }>;
  sections: DraftSection[];
  /** Called with the sections as they are once the form is confirmed, and, when the control that
   *  opened the panel is gone, a CSS selector of the control that takes the focus. */
  onChange: (sections: DraftSection[], focus?: string) => void;
};

// Figma: the content of "Instrument" and of "Nouvel instrument".
function InstrumentForm({ opened, sections, onChange }: FormProps<'instrument'>) {
  const { t } = useTranslation();
  const { instrument } = opened;
  const [name, setName] = useState(instrument?.name ?? '');
  const [sectionId, setSectionId] = useState(opened.sectionId);
  const [wasSent, setSent] = useState(false);

  const isTaken = sections.some((section) =>
    section.instruments.some(
      (other) => other.id !== instrument?.id && nameKey(other.name) === nameKey(name),
    ),
  );
  const problem = name.trim() === '' ? 'missing' : isTaken ? 'taken' : null;

  // The sections without this instrument: where it is put back, or not.
  const without = sections.map((section) => ({
    ...section,
    instruments: section.instruments.filter((other) => other.id !== instrument?.id),
  }));

  const save = (event: FormEvent) => {
    event.preventDefault();
    setSent(true);
    if (problem) return;

    // An instrument that stays in its section keeps its place; one that
    // moves, or a new one, goes to the end of its section. A new one is ticked.
    const saved = {
      id: instrument?.id ?? nextId(sections),
      name: name.trim(),
      isTicked: instrument?.isTicked ?? true,
    };
    if (instrument && sectionId === opened.sectionId) {
      onChange(
        sections.map((section) => ({
          ...section,
          instruments: section.instruments.map((other) => (other.id === saved.id ? saved : other)),
        })),
      );
    } else {
      onChange(
        without.map((section) =>
          section.id === sectionId
            ? { ...section, instruments: [...section.instruments, saved] }
            : section,
        ),
        // The row has moved or is new: its own button, the last of its section.
        `#section-${sectionId} .SectionCard-instruments .ListRow:last-child .IconButton`,
      );
    }
  };

  return (
    <form className="FlowLayout-panelForm" onSubmit={save} noValidate>
      <TextField
        label={t('install.sections.name.label')}
        hint={instrument ? undefined : t('install.sections.name.hint')}
        error={wasSent && problem ? t(`install.sections.name.${problem}`) : undefined}
        name="instrumentName"
        autoComplete="off"
        maxLength={NAME_MAX_LENGTH}
        data-autofocus
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <SelectField
        label={t('install.sections.instrument.section')}
        value={String(sectionId)}
        onChange={(value) => setSectionId(Number(value))}
        options={sections.map((section) => ({ value: String(section.id), label: section.name }))}
      />
      <div className="FlowLayout-panelActions">
        <Button type="submit">
          {instrument ? t('install.sections.save') : t('install.sections.instrument.confirmNew')}
        </Button>
        {instrument && (
          <Button
            kind="danger"
            icon="Trash"
            onClick={() => onChange(without, `#section-${opened.sectionId} > button.ListRow`)}
          >
            {t('install.sections.instrument.remove')}
          </Button>
        )}
      </div>
    </form>
  );
}

// Figma: the content of "Pupitre". The same form adds a section: it then has
// no place to change yet and nothing to delete.
function SectionForm({ opened, sections, onChange }: FormProps<'section'>) {
  const { t } = useTranslation();
  const { section } = opened;
  const [name, setName] = useState(section?.name ?? '');
  const [position, setPosition] = useState(sections.findIndex((other) => other.id === section?.id));
  const [wasSent, setSent] = useState(false);

  const isTaken = sections.some(
    (other) => other.id !== section?.id && nameKey(other.name) === nameKey(name),
  );
  const problem = name.trim() === '' ? 'missing' : isTaken ? 'taken' : null;
  const others = sections.filter((other) => other.id !== section?.id);
  const hasInstruments = (section?.instruments.length ?? 0) > 0;

  const save = (event: FormEvent) => {
    event.preventDefault();
    setSent(true);
    if (problem) return;

    if (section) {
      const moved = [...others];
      moved.splice(position, 0, { ...section, name: name.trim() });
      onChange(moved);
    } else {
      onChange([
        ...sections,
        { id: nextId(sections), name: name.trim(), icon: null, instruments: [] },
      ]);
    }
  };

  return (
    <form className="FlowLayout-panelForm" onSubmit={save} noValidate>
      <TextField
        label={t('install.sections.name.label')}
        hint={t('install.sections.name.hint')}
        error={wasSent && problem ? t(`install.sections.name.${problem}`) : undefined}
        name="sectionName"
        autoComplete="off"
        maxLength={NAME_MAX_LENGTH}
        data-autofocus
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      {section && (
        // biome-ignore lint/a11y/useSemanticElements: a fieldset cannot be laid out as this group is
        <div className="FlowLayout-order" role="group" aria-labelledby="sectionOrder">
          <span className="textLabel" id="sectionOrder">
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
        <Button type="submit">{t('install.sections.save')}</Button>
        {section && (
          <>
            <Button
              kind="danger"
              icon="Trash"
              disabled={hasInstruments}
              aria-describedby={hasInstruments ? 'sectionDeleteNote' : undefined}
              onClick={() => onChange(others, '.FlowLayout-start button')}
            >
              {t('install.sections.section.delete')}
            </Button>
            {hasInstruments && (
              <p className="textCaption" id="sectionDeleteNote">
                {t('install.sections.section.deleteNote')}
              </p>
            )}
          </>
        )}
      </div>
    </form>
  );
}
