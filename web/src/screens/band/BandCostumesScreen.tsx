import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../api.ts';
import { Button } from '../../components/Button.tsx';
import { GigPicture } from '../../components/GigPicture.tsx';
import { Icon } from '../../components/Icon.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { ImageField } from '../../components/ImageField.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { SortableList, useSortableRow } from '../../components/Sortable.tsx';
import { TextField } from '../../components/TextField.tsx';
import { type Costume, useCostumes } from '../../gigs.ts';
import { AppLayout } from '../AppLayout.tsx';
import { AdminsOnlyScreen, useCanManageBand } from './BandSettingsScreen.tsx';
import { prepareCostumePicture } from './costumePicture.ts';
import './band.css';

// Figma: Band settings / Costumes, and the panel of a costume (section 4).
// What the band wears at a gig: a name and a picture. A costume is saved at
// once, from its panel, and the API answers with the whole list. A costume a
// gig has, even a gig already played, cannot be deleted: the button stays,
// disabled, with the number that explains it.
export function BandCostumesScreen() {
  const { t } = useTranslation();
  const canManage = useCanManageBand();
  const costumes = useCostumes();
  const [opened, setOpened] = useState<Costume | 'new' | null>(null);
  const queryClient = useQueryClient();
  const [said, setSaid] = useState('');
  const [failed, setFailed] = useState(false);

  // Dropped at its new place: shown there at once, saved, and put back if that fails.
  const place = async (costume: Costume, to: number) => {
    const before = costumes.data ?? [];
    const list = before.filter((one) => one.id !== costume.id);
    list.splice(to, 0, costume);
    queryClient.setQueryData(['costumes'], list);
    setFailed(false);
    try {
      queryClient.setQueryData(
        ['costumes'],
        await api<Costume[]>(`/api/costumes/${costume.id}`, {
          method: 'PUT',
          body: { name: costume.name, position: to + 1 },
        }),
      );
      setSaid(t('band.costumes.moved', { name: costume.name, position: to + 1 }));
    } catch {
      queryClient.setQueryData(['costumes'], before);
      setFailed(true);
    }
  };

  if (canManage === null) return null;
  if (!canManage) return <AdminsOnlyScreen />;

  return (
    <AppLayout
      current="settings"
      back="/band"
      backLabel={t('band.title')}
      width="form"
      title={t('band.costumes.title')}
      subtitle={t('band.costumes.lead')}
    >
      {costumes.isError && <Message kind="danger">{t('errors.unreachable')}</Message>}
      {costumes.isPending && (
        <p role="status" className="band-muted">
          {t('band.costumes.loading')}
        </p>
      )}
      {costumes.data && (
        <>
          <SortableList
            by="row"
            ids={costumes.data.map((costume) => String(costume.id))}
            onMove={(from, to) => place(costumes.data[from] as Costume, to)}
          >
            <ul className="band-costumes">
              {costumes.data.map((costume) => (
                <CostumeLine key={costume.id} costume={costume} onEdit={() => setOpened(costume)} />
              ))}
              <li>
                <ListRow add label={t('band.costumes.add')} onPress={() => setOpened('new')} />
              </li>
            </ul>
          </SortableList>
          {failed && <Message kind="danger">{t('band.costumes.failed')}</Message>}
          {costumes.data.length > 1 && (
            <p className="band-muted textCaption">{t('band.costumes.orderHint')}</p>
          )}
          <p className="visuallyHidden" role="status">
            {said}
          </p>
        </>
      )}

      <CostumePanel costume={opened} onClose={() => setOpened(null)} onCreated={setOpened} />
    </AppLayout>
  );
}

/** A costume of the list, dragged by its whole row: no handle is drawn. */
function CostumeLine({ costume, onEdit }: { costume: Costume; onEdit: () => void }) {
  const { t } = useTranslation();
  const sortable = useSortableRow(String(costume.id));

  return (
    <li className="band-costume" {...sortable.row} {...sortable.handle} ref={sortable.row.ref}>
      <span className="band-costumePicture">
        {costume.pictureUrl ? (
          <GigPicture status="PROPOSED" costumePictures={[costume.pictureUrl]} />
        ) : (
          <Icon name="Image" />
        )}
      </span>
      <span className="band-costumeTexts">
        <span className="textBodyStrong">{costume.name}</span>
        <span className="band-muted textCaption">
          {t('band.costumes.gigs', { count: costume.gigCount })}
        </span>
      </span>
      <IconButton
        icon="Pencil"
        label={t('band.costumes.edit', { name: costume.name })}
        aria-haspopup="dialog"
        onClick={onEdit}
      />
    </li>
  );
}

type PanelProps = {
  costume: Costume | 'new' | null;
  onClose: () => void;
  /** The costume is saved and its picture is not: the panel goes on with it. */
  onCreated: (costume: Costume) => void;
};

function CostumePanel({ costume, onClose, onCreated }: PanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const existing = costume === 'new' || costume === null ? null : costume;
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [removesPicture, setRemovesPicture] = useState(false);
  const [nameError, setNameError] = useState<string>();
  const [failure, setFailure] = useState<'failed' | 'pictureFailed' | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [isDeleting, setDeleting] = useState(false);
  const keepsPanel = useRef(false);

  // Each opening starts from what the costume holds.
  const costumeId = costume === 'new' || costume === null ? costume : costume.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a costume that is only renamed or just created keeps what the panel holds
  useEffect(() => {
    if (keepsPanel.current) {
      keepsPanel.current = false;
      return;
    }
    setName(costume === 'new' || costume === null ? '' : costume.name);
    setFile(null);
    setRemovesPicture(false);
    setNameError(undefined);
    setFailure(null);
    setDeleting(false);
  }, [costumeId]);

  const keep = (list: Costume[]) => queryClient.setQueryData(['costumes'], list);

  const save = async () => {
    if (name.trim() === '') return setNameError(t('band.costumes.errors.name.required'));
    setSaving(true);
    setFailure(null);
    try {
      const list = await api<Costume[]>(
        existing ? `/api/costumes/${existing.id}` : '/api/costumes',
        {
          method: existing ? 'PUT' : 'POST',
          body: { name },
        },
      );
      keep(list);
      // The costume just created is the one that bears this name.
      const same = (other: string) =>
        other.localeCompare(name.trim(), undefined, { sensitivity: 'base' }) === 0;
      const id = existing?.id ?? list.find((one) => same(one.name))?.id;
      try {
        if (file && id !== undefined) {
          const image = await prepareCostumePicture(file);
          keep(
            await api<Costume[]>(`/api/costumes/${id}/picture`, { method: 'PUT', body: { image } }),
          );
        } else if (removesPicture && id !== undefined) {
          keep(await api<Costume[]>(`/api/costumes/${id}/picture`, { method: 'DELETE' }));
        }
      } catch {
        // The costume exists now: saving again changes it, and does not add it twice.
        const created = existing ? undefined : list.find((one) => one.id === id);
        if (created) {
          keepsPanel.current = true;
          onCreated(created);
        }
        return setFailure('pictureFailed');
      }
      // The gigs show the costume by its name and its picture.
      queryClient.invalidateQueries({ queryKey: ['gig'] });
      onClose();
    } catch (error) {
      const problem = error instanceof ApiError ? error.fields.name : undefined;
      if (problem === 'required' || problem === 'duplicate' || problem === 'tooLong') {
        setNameError(t(`band.costumes.errors.name.${problem}`));
      } else {
        setFailure('failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setSaving(true);
    try {
      keep(await api<Costume[]>(`/api/costumes/${existing.id}`, { method: 'DELETE' }));
      onClose();
    } catch {
      setFailure('failed');
    } finally {
      setSaving(false);
    }
  };

  // Moved at once, one place at a time: the order is the one of the choices of a gig.
  const all = useCostumes().data ?? [];
  const rank = existing ? all.findIndex((one) => one.id === existing.id) : -1;
  const move = async (by: 1 | -1) => {
    if (!existing) return;
    setSaving(true);
    setFailure(null);
    try {
      keepsPanel.current = true;
      keep(
        await api<Costume[]>(`/api/costumes/${existing.id}`, {
          method: 'PUT',
          body: { name: existing.name, position: rank + 1 + by },
        }),
      );
    } catch {
      setFailure('failed');
    } finally {
      keepsPanel.current = false;
      setSaving(false);
    }
  };

  const inUse = (existing?.gigCount ?? 0) > 0;
  const title = isDeleting
    ? t('band.costumes.deleteTitle', { name: existing?.name ?? '' })
    : (existing?.name ?? t('band.costumes.newTitle'));

  return (
    <Panel open={costume !== null} onClose={onClose} title={title}>
      {!isDeleting ? (
        <div className="band-panel">
          <ImageField
            label={t('band.costumes.picture')}
            hint={t('band.costumes.pictureHint')}
            accept="image/jpeg,image/png,image/webp"
            value={file}
            current={removesPicture ? null : (existing?.pictureUrl ?? null)}
            onChange={(chosen) => {
              setFile(chosen);
              setRemovesPicture(chosen === null);
            }}
          />
          <TextField
            label={t('band.costumes.name')}
            hint={t('band.costumes.nameHint')}
            error={nameError}
            value={name}
            maxLength={40}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(undefined);
            }}
          />
          {failure && <Message kind="danger">{t(`band.costumes.${failure}`)}</Message>}
          <Button disabled={isSaving} onClick={save}>
            {t('band.costumes.save')}
          </Button>
          {existing && all.length > 1 && (
            // biome-ignore lint/a11y/useSemanticElements: a fieldset cannot be laid out as this group is
            <div className="band-order" role="group" aria-label={t('band.costumes.order')}>
              <Button
                kind="secondary"
                size="small"
                icon="ArrowUp"
                disabled={isSaving || rank <= 0}
                onClick={() => move(-1)}
              >
                {t('install.sections.section.moveUp')}
              </Button>
              <Button
                kind="secondary"
                size="small"
                icon="ArrowDown"
                disabled={isSaving || rank === all.length - 1}
                onClick={() => move(1)}
              >
                {t('install.sections.section.moveDown')}
              </Button>
              <span className="band-muted textCaption" aria-live="polite">
                {t('install.sections.section.position', {
                  rank: t('install.sections.section.rank', { count: rank + 1, ordinal: true }),
                  total: all.length,
                })}
              </span>
            </div>
          )}
          {existing && (
            <>
              <Button kind="danger" icon="Trash" disabled={inUse} onClick={() => setDeleting(true)}>
                {t('band.costumes.delete')}
              </Button>
              {inUse && (
                <p className="band-muted textCaption">
                  {t('band.costumes.inUse', { count: existing.gigCount })}
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="band-panel">
          <p className="textBody">{t('band.costumes.deleteLead')}</p>
          {failure && <Message kind="danger">{t('band.costumes.failed')}</Message>}
          <Button kind="danger" icon="Trash" disabled={isSaving} onClick={remove}>
            {t('band.costumes.delete')}
          </Button>
          <Button kind="quiet" onClick={() => setDeleting(false)}>
            {t('band.costumes.keep')}
          </Button>
        </div>
      )}
    </Panel>
  );
}
