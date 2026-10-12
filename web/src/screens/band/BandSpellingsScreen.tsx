import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { Button } from '../../components/Button.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { TextField } from '../../components/TextField.tsx';
import { useMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import './band.css';

// An instrument with its known spellings, as GET /api/instrumentAliases
// answers it (api/src/Songs/InstrumentAliases.php).
type InstrumentSpellings = {
  id: number;
  name: string;
  /** From A to Z. The name of the instrument is always one, and is not listed. */
  aliases: { id: number; alias: string }[];
};

// model/songs.md, field `instrumentAlias.alias`. The server judges the
// spelling once cleaned; this only stops the typing.
const ALIAS_MAX_LENGTH = 25;
const QUERY_KEY = ['instrumentAliases'];

// Figma: Band settings / Known spellings, and the sheet of an instrument. The
// words the import and the MIDI player read in a name to find its instrument
// (model/songs.md, entry 2, "Managing the aliases"). For whoever manages
// songs: the API asks for the same permission.
export function BandSpellingsScreen() {
  const { t } = useTranslation();
  const me = useMe().data;
  const canManage = me ? me.permissions.includes('manageSongs') : null;
  const instruments = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api<InstrumentSpellings[]>('/api/instrumentAliases'),
    enabled: canManage === true,
  });
  const [openedId, setOpenedId] = useState<number | null>(null);
  const [isOpen, setOpen] = useState(false);
  const [key, setKey] = useState(0);

  if (canManage === null) return null;
  // The API refuses them anyway; no sentence of this screen is theirs.
  if (!canManage) return <Navigate to="/settings" replace />;

  const all = instruments.data ?? [];
  // Read from the list each time: the sheet shows what the server last answered.
  const opened = all.find((instrument) => instrument.id === openedId);

  return (
    <>
      <AppLayout
        current="settings"
        back="/band"
        backLabel={t('band.title')}
        width="form"
        title={t('band.spellings.title')}
        subtitle={t('band.spellings.lead')}
      >
        {instruments.isError && <Message kind="danger">{t('errors.unreachable')}</Message>}
        {all.length > 0 && (
          <Sheet>
            <div>
              {all.map((instrument) => (
                <ListRow
                  key={instrument.id}
                  label={instrument.name}
                  detail={instrument.aliases.map(({ alias }) => alias).join(', ')}
                  trailing={
                    <IconButton
                      icon="Pencil"
                      label={t('band.spellings.edit', { name: instrument.name })}
                      aria-haspopup="dialog"
                      onClick={() => {
                        // The sheet starts closed on its field each time it opens.
                        setKey(key + 1);
                        setOpenedId(instrument.id);
                        setOpen(true);
                      }}
                    />
                  }
                />
              ))}
            </div>
          </Sheet>
        )}
      </AppLayout>

      <Panel open={isOpen} onClose={() => setOpen(false)} title={opened?.name ?? ''}>
        {opened && <Spellings key={key} instrument={opened} instruments={all} />}
      </Panel>
    </>
  );
}

// Each change answers with the instrument as it now is: the list shows that answer.
function useKeep() {
  const queryClient = useQueryClient();

  return (changed: InstrumentSpellings) =>
    queryClient.setQueryData<InstrumentSpellings[]>(QUERY_KEY, (list) =>
      list?.map((instrument) => (instrument.id === changed.id ? changed : instrument)),
    );
}

// Figma: the sheet of an instrument. Each spelling with its deletion, then
// the line that adds one: a spelling is not edited, it is deleted and added
// again. Every change is saved at once.
function Spellings({
  instrument,
  instruments,
}: {
  instrument: InstrumentSpellings;
  instruments: InstrumentSpellings[];
}) {
  const { t } = useTranslation();
  const keep = useKeep();
  const [isAdding, setAdding] = useState(false);
  const [alias, setAlias] = useState('');
  const content = useRef<HTMLDivElement>(null);
  // After a deletion, the place in the list of the spelling that went.
  const deletedAt = useRef<number | null>(null);

  const focusAdding = () =>
    content.current?.querySelector<HTMLElement>('input, button[data-add]')?.focus();

  const add = useMutation({
    mutationFn: (typed: string) =>
      api<InstrumentSpellings>(`/api/instruments/${instrument.id}/aliases`, {
        method: 'POST',
        body: { alias: typed },
      }),
    onSuccess: (changed) => {
      keep(changed);
      // Ready for the next one, the focus back in the field.
      setAlias('');
      focusAdding();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) =>
      api<InstrumentSpellings>(`/api/instrumentAliases/${id}`, { method: 'DELETE' }),
    onSuccess: keep,
    onError: () => {
      deletedAt.current = null;
    },
  });

  // The field takes the focus when it appears.
  useEffect(() => {
    if (isAdding) content.current?.querySelector('input')?.focus();
  }, [isAdding]);

  // The button of a deleted spelling is gone with its row: the focus goes to
  // the spelling that took its place, to the last one, or to the line that adds.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the list of spellings changes
  useEffect(() => {
    if (deletedAt.current === null) return;
    const buttons = content.current?.querySelectorAll<HTMLElement>('[data-delete]') ?? [];
    const next = buttons[Math.min(deletedAt.current, buttons.length - 1)];
    deletedAt.current = null;
    if (next) next.focus();
    else focusAdding();
  }, [instrument.aliases]);

  const refused = add.error instanceof ApiError ? add.error.fields : {};
  const takenBy = instruments.find(
    (other) => String(other.id) === refused.takenByInstrumentId,
  )?.name;
  const problem =
    refused.alias === 'aliasTaken' && takenBy
      ? t('band.spellings.taken', { alias: (add.variables ?? '').trim(), instrument: takenBy })
      : refused.alias === 'required' || refused.alias === 'tooShort' || refused.alias === 'tooLong'
        ? t(`band.spellings.${refused.alias}`)
        : undefined;

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (alias.trim() === '' || add.isPending) return;
    add.mutate(alias);
  };

  return (
    <div className="band-spellings" ref={content}>
      <p className="band-muted textCaption">{t('band.spellings.note')}</p>
      {((add.isError && !problem) || remove.isError) && (
        <Message kind="danger">{t('errors.unreachable')}</Message>
      )}
      {instrument.aliases.map(({ id, alias: spelling }, index) => (
        <ListRow
          key={id}
          label={spelling}
          trailing={
            <IconButton
              icon="Trash"
              label={t('band.spellings.delete', { alias: spelling })}
              data-delete
              onClick={() => {
                if (remove.isPending) return;
                deletedAt.current = index;
                remove.mutate(id);
              }}
            />
          }
        />
      ))}
      {isAdding ? (
        <form className="band-spellings" onSubmit={send} noValidate>
          <TextField
            label={t('band.spellings.label')}
            error={problem}
            name="alias"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={ALIAS_MAX_LENGTH}
            value={alias}
            onChange={(event) => {
              setAlias(event.target.value);
              // What was refused is no longer what is typed.
              if (add.isError) add.reset();
            }}
          />
          <Button type="submit" disabled={alias.trim() === '' || add.isPending || add.isError}>
            {t('band.spellings.confirm')}
          </Button>
        </form>
      ) : (
        <ListRow add label={t('band.spellings.add')} onPress={() => setAdding(true)} />
      )}
    </div>
  );
}
