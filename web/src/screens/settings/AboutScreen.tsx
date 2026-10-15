import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ChangelogEntry, changeKinds, lineIn, useBuild, useChangelog } from '../../about.ts';
import { Chip } from '../../components/Chip.tsx';
import type { IconName } from '../../components/Icon.tsx';
import { Message } from '../../components/Message.tsx';
import { NavRow } from '../../components/NavRow.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { AppLayout } from '../AppLayout.tsx';
import './settings.css';

// How each kind of change is headed (Figma: Members, section 5, "Settings —
// about"): a Chip that carries a word and an icon, never a colour alone.
const KIND: Record<string, { kind: 'info' | 'neutral' | 'success'; icon: IconName }> = {
  added: { kind: 'info', icon: 'Plus' },
  changed: { kind: 'neutral', icon: 'Pencil' },
  fixed: { kind: 'success', icon: 'Check' },
};

/** "15 octobre 2026", from a day written 2026-10-15 or an instant. */
function dayText(value: string, language: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(date);
}

/** The changes of a version, grouped by kind, in the language of the member. */
function Changes({
  entry,
  lineOf,
  headingLevel,
}: {
  entry: ChangelogEntry;
  lineOf: (version: string, text: string) => string;
  /** 2 on the screen, under its title; 3 in the panel, under its own. */
  headingLevel: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const { t } = useTranslation();

  return (
    <div className="settings-changes">
      {changeKinds.map((kind) => {
        const lines = entry.changes.filter((change) => change.kind === kind);
        if (lines.length === 0) return null;
        const look = KIND[kind] ?? KIND.changed;
        return (
          <section key={kind} className="settings-changeGroup">
            <Heading>
              <Chip kind={look?.kind} icon={look?.icon}>
                {t(`settings.about.kinds.${kind}`)}
              </Chip>
            </Heading>
            <ul>
              {lines.map((change) => (
                <li key={change.text} className="textBody">
                  {lineOf(entry.version, change.text)}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// Figma: Members / Settings — about. The version of the app and the day it
// was published, the changes of that version, and the earlier versions
// folded: one row each, which opens that version in a panel (a BottomSheet,
// a Dialog on a desktop). Every member sees it, whatever their roles.
export function AboutScreen() {
  const { t, i18n } = useTranslation();
  const build = useBuild();
  const changelog = useChangelog();
  const [opened, setOpened] = useState<ChangelogEntry | null>(null);

  const language = i18n.language;
  const entries = changelog.data?.en ?? [];
  const version = build.data?.version;
  const at = entries.findIndex((entry) => entry.version === version);
  const current = at >= 0 ? entries[at] : undefined;
  // A version the changelog does not know yet: every entry is an earlier one.
  const earlier = at >= 0 ? entries.slice(at + 1) : entries;
  const lineOf = (of: string, text: string) =>
    changelog.data ? lineIn(changelog.data, of, text, language) : text;

  return (
    <AppLayout
      current="settings"
      back="/settings"
      backLabel={t('nav.settings')}
      width="form"
      title={t('settings.about.title')}
      subtitle={t('settings.about.lead')}
    >
      {(build.isError || changelog.isError) && (
        <Message kind="danger">{t('errors.unreachable')}</Message>
      )}
      {build.data && (
        <Sheet>
          <NavRow
            icon="Info"
            label={t('settings.about.version', { version: build.data.version })}
            detail={t('settings.about.published', {
              date: dayText(build.data.builtAt, language),
            })}
          />
        </Sheet>
      )}
      {current && current.changes.length > 0 && (
        <Sheet>
          <Changes entry={current} lineOf={lineOf} headingLevel={2} />
        </Sheet>
      )}
      {earlier.length > 0 && (
        <Sheet title={t('settings.about.earlier')}>
          <div className="settings-rows">
            {earlier.map((entry) => (
              <NavRow
                key={entry.version}
                label={entry.version}
                detail={dayText(entry.date, language)}
                chevron
                opensPanel
                onClick={() => setOpened(entry)}
              />
            ))}
          </div>
        </Sheet>
      )}

      <Panel
        open={opened !== null}
        onClose={() => setOpened(null)}
        title={opened ? t('settings.about.version', { version: opened.version }) : ''}
      >
        {opened && (
          <div className="settings-confirm">
            <p className="settings-note textBody">
              {t('settings.about.published', { date: dayText(opened.date, language) })}
            </p>
            <Changes entry={opened} lineOf={lineOf} headingLevel={3} />
          </div>
        )}
      </Panel>
    </AppLayout>
  );
}
