import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { ApiError, api } from '../../api.ts';
import { useBand } from '../../band.ts';
import { BottomBar } from '../../components/BottomBar.tsx';
import { Button } from '../../components/Button.tsx';
import { FilterChip } from '../../components/FilterChip.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { MemberMention } from '../../components/MemberMention.tsx';
import { Message } from '../../components/Message.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { TextArea } from '../../components/TextArea.tsx';
import { TextField } from '../../components/TextField.tsx';
import { type Gig, useCostumes, useGig } from '../../gigs.ts';
import { instrumentsOf, useMembers, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import { AppLayout } from '../AppLayout.tsx';
import './gigs.css';

/** A slot as the form holds it until the gig is saved. `id` is null for a slot to create. */
type SlotDraft = {
  key: string;
  id: number | null;
  name: string;
  note: string;
  costumeId: number | null;
};

type Draft = {
  name: string;
  startsOn: string;
  endsOn: string;
  meetingTime: string;
  placeName: string;
  placeUrl: string;
  streetAddress: string;
  postalCode: string;
  city: string;
  /** "45.7673, 4.8344", as it is pasted from a map. */
  coordinates: string;
  notes: string;
  /** The link of the channel, or its identifier: the server keeps the identifier. */
  discordChannelId: string;
  organizerIds: number[];
  costumeIds: number[];
  slots: SlotDraft[];
};

type Errors = Partial<Record<string, string>>;

const emptyDraft = (): Draft => ({
  name: '',
  startsOn: '',
  endsOn: '',
  meetingTime: '',
  placeName: '',
  placeUrl: '',
  streetAddress: '',
  postalCode: '',
  city: '',
  coordinates: '',
  notes: '',
  discordChannelId: '',
  organizerIds: [],
  costumeIds: [],
  slots: [{ key: 'first', id: null, name: '', note: '', costumeId: null }],
});

const draftOf = (gig: Gig): Draft => ({
  name: gig.name,
  startsOn: gig.startsOn,
  endsOn: gig.endsOn ?? '',
  meetingTime: gig.meetingTime ?? '',
  placeName: gig.placeName ?? '',
  placeUrl: gig.placeUrl ?? '',
  streetAddress: gig.streetAddress ?? '',
  postalCode: gig.postalCode ?? '',
  city: gig.city ?? '',
  coordinates:
    gig.latitude !== null && gig.longitude !== null ? `${gig.latitude}, ${gig.longitude}` : '',
  notes: gig.notes ?? '',
  discordChannelId: gig.discordChannelId ?? '',
  organizerIds: gig.organizers.map((organiser) => organiser.id),
  costumeIds: gig.costumes.map((costume) => costume.id),
  slots: gig.slots.map((slot) => ({
    key: String(slot.id),
    id: slot.id,
    name: slot.name ?? '',
    note: slot.note ?? '',
    costumeId: slot.costumeId,
  })),
});

/** The fields that show the reason the server refuses them. */
const shownFields = [
  'name',
  'startsOn',
  'endsOn',
  'meetingTime',
  'placeName',
  'placeUrl',
  'streetAddress',
  'postalCode',
  'city',
  'coordinates',
  'notes',
  'discordChannelId',
  'organizerIds',
  'costumeIds',
];

/** "45.7673, 4.8344" as two numbers; null when it is not written that way. */
function coordinatesOf(text: string): { latitude: number; longitude: number } | null {
  const match = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(text);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

// Figma: Gigs / New gig — form (section 9), and the same form for a gig that
// exists ("Modifier le plan", not drawn). Full screen, the tab bar hidden. A
// slot is edited in a panel, the organisers are chosen in another; everything
// is saved together by the button of the form.
export function GigFormScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const queryClient = useQueryClient();
  const gigId = params.id ? Number(params.id) : null;
  const existing = useGig(gigId ?? 0, gigId !== null);
  const me = useMe().data;
  const hasDiscord = useBand().data?.hasDiscord ?? false;
  const members = useMembers().data ?? [];
  const sections = useSections().data;
  const costumes = useCostumes().data ?? [];
  const [draft, setDraft] = useState<Draft | null>(gigId === null ? emptyDraft() : null);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<'failed' | 'slotsFailed' | null>(null);
  const [isSaving, setSaving] = useState(false);
  // A gig just created whose slots could not all be saved: saving again edits it.
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [editedSlot, setEditedSlot] = useState<SlotDraft | null>(null);
  const [isChoosingOrganisers, setChoosingOrganisers] = useState(false);

  // The form of a gig that exists starts from what the gig holds.
  useEffect(() => {
    if (existing.data && draft === null) setDraft(draftOf(existing.data));
  }, [existing.data, draft]);

  const isNew = gigId === null;
  const targetId = gigId ?? createdId;
  const isCreating = targetId === null;
  const canManage = me?.permissions.includes('manageGigs') ?? false;
  // Hiding is a comfort: the API refuses anyway. A plan is created by who
  // manages gigs, and edited by them and by its organisers.
  const isRefused =
    me !== undefined && me !== null && (isNew ? !canManage : existing.data?.canEdit === false);
  const back = isNew ? '/gigs' : `/gigs/${gigId}`;
  const title = t(isNew ? 'gigs.form.newTitle' : 'gigs.form.editTitle');

  if (isRefused) {
    return (
      <AppLayout current="gigs" back={back} width="form" title={t('manage.noRight.title')}>
        <Message>{t('gigs.form.noRight')}</Message>
      </AppLayout>
    );
  }
  if (draft === null) {
    return (
      <AppLayout current="gigs" back={back} width="form" title={title}>
        {existing.isError ? (
          <Message kind="danger">{t('gigs.gig.notFound')}</Message>
        ) : (
          <p role="status" className="gigs-muted">
            {t('gigs.gig.loading')}
          </p>
        )}
      </AppLayout>
    );
  }

  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => {
    setDraft({ ...draft, [key]: value });
    setErrors({ ...errors, [key]: undefined });
  };
  const instruments = instrumentsOf(sections);
  const current = members.filter(
    (member) => member.status === 'ACTIVE' || member.status === 'POWER_MEMBER',
  );
  const instrumentOf = (memberId: number) =>
    instruments.find(
      (one) => one.id === members.find((member) => member.id === memberId)?.instrumentId,
    )?.name;
  // An organiser who left the band stays on a gig already played: named by what the gig holds.
  const nicknameOf = (memberId: number) =>
    members.find((member) => member.id === memberId)?.nickname ??
    existing.data?.organizers.find((organiser) => organiser.id === memberId)?.nickname ??
    '';

  const check = (): Errors => {
    const found: Errors = {};
    if (draft.name.trim() === '') found.name = t('gigs.form.errors.name.required');
    if (draft.startsOn === '') found.startsOn = t('gigs.form.errors.startsOn.required');
    if (draft.endsOn !== '' && draft.startsOn !== '' && draft.endsOn < draft.startsOn) {
      found.endsOn = t('gigs.form.errors.endsOn.invalid');
    }
    if (draft.coordinates.trim() !== '' && coordinatesOf(draft.coordinates) === null) {
      found.coordinates = t('gigs.form.errors.coordinates.invalid');
    }
    if (draft.slots.length > 1 && draft.slots.some((slot) => slot.name.trim() === '')) {
      found.slots = t('gigs.slot.nameFirst');
    }
    return found;
  };

  const save = async () => {
    const found = check();
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    let savedId = targetId;
    const record = (organizerIds: number[]) =>
      api<Gig>(isCreating ? '/api/gigs' : `/api/gigs/${targetId}`, {
        method: isCreating ? 'POST' : 'PUT',
        body: {
          name: draft.name,
          startsOn: draft.startsOn,
          endsOn: draft.endsOn || null,
          meetingTime: draft.meetingTime ? draft.meetingTime.slice(0, 5) : null,
          placeName: draft.placeName || null,
          placeUrl: draft.placeUrl || null,
          streetAddress: draft.streetAddress || null,
          postalCode: draft.postalCode || null,
          city: draft.city || null,
          ...(coordinatesOf(draft.coordinates) ?? { latitude: null, longitude: null }),
          notes: draft.notes || null,
          discordChannelId: draft.discordChannelId.trim() || null,
          organizerIds,
          costumeIds: draft.costumeIds,
        },
      });
    // An organiser who takes themself off the gig may no longer edit it once
    // that is saved: they stay on it until its slots are saved.
    const isLeaving =
      !isCreating && !canManage && me != null && !draft.organizerIds.includes(me.id);
    try {
      const saved = await record(isLeaving ? [...draft.organizerIds, me.id] : draft.organizerIds);
      savedId = saved.id;
      if (isCreating) setCreatedId(saved.id);

      // The slots, once the gig and its costumes are saved: those taken off
      // first, then those kept, then the new ones. A gig is created with one
      // slot, which the first slot of the form becomes.
      try {
        const slots = `/api/gigs/${saved.id}/slots`;
        const kept = draft.slots.map((slot, index) =>
          isCreating && index === 0 ? { ...slot, id: saved.slots[0]?.id ?? null } : slot,
        );
        const keptIds = kept.flatMap((slot) => (slot.id === null ? [] : [slot.id]));
        for (const slot of saved.slots.filter((one) => !keptIds.includes(one.id))) {
          await api(`${slots}/${slot.id}`, { method: 'DELETE' });
        }
        for (const slot of [
          ...kept.filter((one) => one.id !== null),
          ...kept.filter((one) => one.id === null),
        ]) {
          await api(slot.id === null ? slots : `${slots}/${slot.id}`, {
            method: slot.id === null ? 'POST' : 'PUT',
            body: { name: slot.name || null, note: slot.note || null, costumeId: slot.costumeId },
          });
        }
        if (isLeaving) await record(draft.organizerIds);
      } catch {
        // The slots that were saved take their identifier, so that saving
        // again does not add them twice.
        const fresh = await api<Gig>(`/api/gigs/${saved.id}`).catch(() => null);
        setDraft({
          ...draft,
          slots: draft.slots.map((slot, index) => ({
            ...slot,
            id:
              slot.id ??
              (isCreating && index === 0 ? saved.slots[0]?.id : undefined) ??
              fresh?.slots.find((one) => (one.name ?? '') === slot.name.trim())?.id ??
              null,
          })),
        });
        setFailure('slotsFailed');
        return;
      } finally {
        queryClient.invalidateQueries({ queryKey: ['gigs'] });
        queryClient.invalidateQueries({ queryKey: ['gig', saved.id] });
      }
      // A draft is seen by who may edit it only.
      navigate(isLeaving && existing.data?.status === 'DRAFT' ? '/gigs' : `/gigs/${saved.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.error === 'invalidInput') {
        // The reason under each field, as the server gives it.
        const fromServer: Errors = {};
        for (const [field, problem] of Object.entries(error.fields)) {
          const key = field === 'latitude' || field === 'longitude' ? 'coordinates' : field;
          // A field the form does not show has no place for its reason.
          if (!shownFields.includes(key)) {
            setFailure('failed');
            continue;
          }
          fromServer[key] = t(
            `gigs.form.errors.${key}.${problem}` as 'gigs.form.errors.name.required',
            {
              defaultValue: t('gigs.form.failed'),
            },
          );
        }
        setErrors(fromServer);
      } else if (savedId === targetId) {
        setFailure('failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const errorCount = Object.values(errors).filter(Boolean).length;
  const slotDetail = (slot: SlotDraft) =>
    [costumes.find((costume) => costume.id === slot.costumeId)?.name, slot.note.split('\n')[0]]
      .filter(Boolean)
      .join(' · ');
  // A slot that is saved is taken off the form only while another saved one stays.
  const savedSlots = draft.slots.filter((slot) => slot.id !== null).length;
  const canDelete = (slot: SlotDraft) =>
    draft.slots.length > 1 && (slot.id === null || savedSlots > 1);

  return (
    <AppLayout
      current="gigs"
      back={back}
      backLabel={isNew ? t('nav.gigs') : existing.data?.name}
      width="form"
      title={title}
      subtitle={t(isNew ? 'gigs.form.newLead' : 'gigs.form.editLead')}
      onSubmit={save}
      actions={
        <BottomBar
          surface="glass"
          caption={
            errorCount > 0
              ? { kind: 'warning', text: t('gigs.form.toFix', { count: errorCount }) }
              : isCreating
                ? { kind: 'info', text: t('gigs.form.createCaption') }
                : undefined
          }
        >
          <Button type="submit" disabled={isSaving}>
            {t(isCreating ? 'gigs.form.create' : 'gigs.form.save')}
          </Button>
        </BottomBar>
      }
    >
      <div className="gigs-form">
        {errorCount > 0 && (
          <Message kind="danger">
            {t(isCreating ? 'gigs.form.toFixBeforeCreating' : 'gigs.form.toFixBeforeSaving', {
              count: errorCount,
            })}
          </Message>
        )}
        {failure && <Message kind="danger">{t(`gigs.form.${failure}`)}</Message>}

        <Sheet title={t('gigs.form.theGig')}>
          <TextField
            label={t('gigs.form.name')}
            hint={t('gigs.form.nameHint')}
            error={errors.name}
            value={draft.name}
            maxLength={80}
            onChange={(event) => set('name', event.target.value)}
          />
        </Sheet>

        <Sheet title={t('gigs.form.when')}>
          <TextField
            label={t('gigs.form.startsOn')}
            type="date"
            error={errors.startsOn}
            value={draft.startsOn}
            onChange={(event) => set('startsOn', event.target.value)}
          />
          <TextField
            label={t('gigs.form.endsOn')}
            type="date"
            hint={t('gigs.form.endsOnHint')}
            error={errors.endsOn}
            value={draft.endsOn}
            min={draft.startsOn || undefined}
            onChange={(event) => set('endsOn', event.target.value)}
            clear={{ label: t('gigs.form.endsOnClear'), onClear: () => set('endsOn', '') }}
          />
          <TextField
            label={t('gigs.form.meetingTime')}
            type="time"
            hint={t('gigs.form.meetingTimeHint')}
            error={errors.meetingTime}
            value={draft.meetingTime}
            onChange={(event) => set('meetingTime', event.target.value)}
          />
        </Sheet>

        <Sheet title={t('gigs.form.where')}>
          <TextField
            label={t('gigs.form.placeName')}
            error={errors.placeName}
            value={draft.placeName}
            maxLength={80}
            onChange={(event) => set('placeName', event.target.value)}
          />
          <TextField
            label={t('gigs.form.placeUrl')}
            type="url"
            inputMode="url"
            placeholder="https://"
            hint={t('gigs.form.placeUrlHint')}
            error={errors.placeUrl}
            value={draft.placeUrl}
            onChange={(event) => set('placeUrl', event.target.value)}
          />
          <TextArea
            label={t('gigs.form.streetAddress')}
            placeholder={t('gigs.form.streetAddressPlaceholder')}
            autoComplete="off"
            lines={2}
            maxLength={200}
            error={errors.streetAddress}
            value={draft.streetAddress}
            onChange={(event) => set('streetAddress', event.target.value)}
          />
          <div className="gigs-pair">
            <TextField
              label={t('gigs.form.postalCode')}
              autoComplete="off"
              error={errors.postalCode}
              value={draft.postalCode}
              onChange={(event) => set('postalCode', event.target.value)}
            />
            <TextField
              label={t('gigs.form.city')}
              autoComplete="off"
              error={errors.city}
              value={draft.city}
              onChange={(event) => set('city', event.target.value)}
            />
          </div>
          <TextField
            label={t('gigs.form.coordinates')}
            hint={t('gigs.form.coordinatesHint')}
            error={errors.coordinates}
            value={draft.coordinates}
            onChange={(event) => set('coordinates', event.target.value)}
          />
        </Sheet>

        <Sheet title={t('gigs.form.slots')}>
          <p className="gigs-muted textCaption">{t('gigs.form.slotsLead')}</p>
          {errors.slots && <Message kind="danger">{errors.slots}</Message>}
          <div className="gigs-rows">
            {draft.slots.map((slot) => (
              <ListRow
                key={slot.key}
                label={slot.name || t('gigs.form.onlySlot')}
                detail={slotDetail(slot) || undefined}
                trailing={
                  <IconButton
                    icon="More"
                    label={t('gigs.form.editSlot', { slot: slot.name || t('gigs.form.onlySlot') })}
                    aria-haspopup="dialog"
                    onClick={() => setEditedSlot(slot)}
                  />
                }
              />
            ))}
            <ListRow
              add
              label={t('gigs.form.addSlot')}
              onPress={() =>
                setEditedSlot({
                  key: `new-${Date.now()}`,
                  id: null,
                  name: '',
                  note: '',
                  costumeId: null,
                })
              }
            />
          </div>
        </Sheet>

        <Sheet title={t('gigs.form.costumes')}>
          {errors.costumeIds && <Message kind="danger">{errors.costumeIds}</Message>}
          {costumes.length > 0 ? (
            <div className="gigs-chips">
              {costumes.map((costume) => (
                <FilterChip
                  key={costume.id}
                  pressed={draft.costumeIds.includes(costume.id)}
                  onChange={(pressed) => {
                    setErrors({ ...errors, costumeIds: undefined });
                    setDraft({
                      ...draft,
                      costumeIds: pressed
                        ? [...draft.costumeIds, costume.id]
                        : draft.costumeIds.filter((id) => id !== costume.id),
                      // A slot chooses its costume among those of the gig.
                      slots: pressed
                        ? draft.slots
                        : draft.slots.map((slot) =>
                            slot.costumeId === costume.id ? { ...slot, costumeId: null } : slot,
                          ),
                    });
                  }}
                >
                  {costume.name}
                </FilterChip>
              ))}
            </div>
          ) : (
            <p className="gigs-muted textBody">{t('gigs.form.noCostumes')}</p>
          )}
          <p className="gigs-muted textCaption">{t('gigs.form.costumesLead')}</p>
        </Sheet>

        <Sheet title={t('gigs.form.organisers')}>
          {errors.organizerIds && <Message kind="danger">{errors.organizerIds}</Message>}
          {draft.organizerIds.map((memberId) => (
            <div key={memberId} className="gigs-organiser">
              <MemberMention
                nickname={nicknameOf(memberId)}
                detail={instrumentOf(memberId)}
                photoUrl={members.find((member) => member.id === memberId)?.photoUrl ?? null}
              />
              <IconButton
                icon="Close"
                label={t('gigs.form.removeOrganiser', { nickname: nicknameOf(memberId) })}
                onClick={() =>
                  set(
                    'organizerIds',
                    draft.organizerIds.filter((id) => id !== memberId),
                  )
                }
              />
            </div>
          ))}
          <ListRow
            add
            label={t('gigs.form.addOrganiser')}
            onPress={() => setChoosingOrganisers(true)}
          />
        </Sheet>

        <Sheet title={t('gigs.form.notesAndDiscord')}>
          <TextArea
            label={t('gigs.form.notes')}
            hint={t('gigs.form.notesHint')}
            error={errors.notes}
            lines={4}
            value={draft.notes}
            maxLength={4000}
            onChange={(event) => set('notes', event.target.value)}
          />
          {/* Without a server, no channel can be typed (model/gigs.md, entry 1). */}
          {(hasDiscord || draft.discordChannelId !== '') && (
            <TextField
              label={t('gigs.form.discord')}
              placeholder={t('discord.link.placeholder')}
              hint={t('gigs.form.discordHint')}
              error={errors.discordChannelId}
              inputMode="url"
              autoComplete="off"
              value={draft.discordChannelId}
              onChange={(event) => set('discordChannelId', event.target.value)}
            />
          )}
        </Sheet>
      </div>

      <SlotPanel
        slot={editedSlot}
        isNew={editedSlot !== null && !draft.slots.some((slot) => slot.key === editedSlot.key)}
        others={draft.slots.filter((slot) => slot.key !== editedSlot?.key)}
        costumes={costumes.filter((costume) => draft.costumeIds.includes(costume.id))}
        canDelete={editedSlot !== null && canDelete(editedSlot)}
        language={i18n.language}
        onClose={() => setEditedSlot(null)}
        onSave={(saved) => {
          const isKnown = draft.slots.some((slot) => slot.key === saved.key);
          setDraft({
            ...draft,
            slots: isKnown
              ? draft.slots.map((slot) => (slot.key === saved.key ? saved : slot))
              : [...draft.slots, saved],
          });
          setErrors({ ...errors, slots: undefined });
          setEditedSlot(null);
        }}
        onDelete={(key) => {
          setDraft({ ...draft, slots: draft.slots.filter((slot) => slot.key !== key) });
          setEditedSlot(null);
        }}
      />
      <OrganisersPanel
        open={isChoosingOrganisers}
        chosen={draft.organizerIds}
        members={current.map((member) => ({
          id: member.id,
          nickname: member.nickname,
          instrument: instrumentOf(member.id) ?? '',
        }))}
        onClose={() => setChoosingOrganisers(false)}
        onChoose={(ids) => {
          set('organizerIds', ids);
          setChoosingOrganisers(false);
        }}
      />
    </AppLayout>
  );
}

type SlotPanelProps = {
  slot: SlotDraft | null;
  isNew: boolean;
  others: SlotDraft[];
  costumes: { id: number; name: string }[];
  canDelete: boolean;
  language: string;
  onClose: () => void;
  onSave: (slot: SlotDraft) => void;
  onDelete: (key: string) => void;
};

// Figma: Gigs / New gig — a slot. Its name, its note and its costume, one of
// those of the gig. Deleting a slot that members answered for asks first.
function SlotPanel({
  slot,
  isNew,
  others,
  costumes,
  canDelete,
  language,
  onClose,
  onSave,
  onDelete,
}: SlotPanelProps) {
  const { t } = useTranslation();
  const [edited, setEdited] = useState<SlotDraft | null>(slot);
  const [nameError, setNameError] = useState<string>();
  const [isDeleting, setDeleting] = useState(false);

  useEffect(() => {
    setEdited(slot);
    setNameError(undefined);
    setDeleting(false);
  }, [slot]);

  const save = () => {
    if (!edited) return;
    const name = edited.name.trim();
    const same = (other: string) =>
      other.trim().localeCompare(name, language, { sensitivity: 'base' }) === 0;
    if (name === '' && others.length > 0) return setNameError(t('gigs.slot.errors.name.required'));
    if (name !== '' && others.some((other) => same(other.name))) {
      return setNameError(t('gigs.slot.errors.name.duplicate'));
    }
    onSave({ ...edited, name });
  };
  const title = isDeleting
    ? t('gigs.slot.deleteTitle', { slot: slot?.name || t('gigs.form.onlySlot') })
    : slot?.name || t(isNew ? 'gigs.slot.newTitle' : 'gigs.form.onlySlot');

  return (
    <Panel open={slot !== null} onClose={onClose} title={title}>
      {edited && !isDeleting && (
        <div className="gigs-sheet">
          <TextField
            label={t('gigs.slot.name')}
            hint={t('gigs.slot.nameHint')}
            error={nameError}
            value={edited.name}
            maxLength={40}
            onChange={(event) => {
              setEdited({ ...edited, name: event.target.value });
              setNameError(undefined);
            }}
          />
          <TextArea
            label={t('gigs.slot.note')}
            hint={t('gigs.slot.noteHint')}
            lines={2}
            value={edited.note}
            maxLength={1000}
            onChange={(event) => setEdited({ ...edited, note: event.target.value })}
          />
          {costumes.length > 0 && (
            <>
              <p className="textLabel" id="gigs-slot-costume">
                {t('gigs.slot.costume')}
              </p>
              <div className="gigs-rows" role="radiogroup" aria-labelledby="gigs-slot-costume">
                {[{ id: null, name: t('gigs.slot.noCostume') }, ...costumes].map((costume) => (
                  <ListRow
                    key={costume.id ?? 'none'}
                    label={costume.name}
                    group="gigSlotCostume"
                    selected={edited.costumeId === costume.id}
                    onSelect={() => setEdited({ ...edited, costumeId: costume.id })}
                  />
                ))}
              </div>
            </>
          )}
          <Button onClick={save}>{t('gigs.slot.save')}</Button>
          {canDelete && !isNew && (
            <>
              <Button
                kind="quiet"
                icon="Trash"
                onClick={() => (edited.id === null ? onDelete(edited.key) : setDeleting(true))}
              >
                {t('gigs.slot.delete')}
              </Button>
              <p className="gigs-muted textCaption">{t('gigs.slot.deleteNote')}</p>
            </>
          )}
        </div>
      )}
      {edited && isDeleting && (
        <div className="gigs-sheet">
          <p className="textBody">{t('gigs.slot.deleteLead')}</p>
          <Button kind="danger" icon="Trash" onClick={() => onDelete(edited.key)}>
            {t('gigs.slot.delete')}
          </Button>
          <Button kind="quiet" onClick={() => setDeleting(false)}>
            {t('gigs.slot.keep')}
          </Button>
        </div>
      )}
    </Panel>
  );
}

type OrganisersPanelProps = {
  open: boolean;
  chosen: number[];
  members: { id: number; nickname: string; instrument: string }[];
  onClose: () => void;
  onChoose: (ids: number[]) => void;
};

/** A text as the search compares it: lowercase, without accents. */
const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Figma: Gigs / New gig — organisers. The current members, by nickname, each
// with a checkbox; the search narrows them by nickname or instrument.
function OrganisersPanel({ open, chosen, members, onClose, onChoose }: OrganisersPanelProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [ticked, setTicked] = useState<number[]>(chosen);

  useEffect(() => {
    if (open) {
      setTicked(chosen);
      setSearch('');
    }
  }, [open, chosen]);

  const words = plain(search.trim());
  const shown = members.filter(
    (member) => words === '' || plain(`${member.nickname} ${member.instrument}`).includes(words),
  );
  // Those already chosen who are no longer current members stay chosen.
  const kept = ticked.filter((id) => !members.some((member) => member.id === id));
  const count = ticked.length;

  return (
    <Panel open={open} onClose={onClose} title={t('gigs.organisers.title')}>
      <div className="gigs-sheet">
        <TextField
          label={t('gigs.organisers.search')}
          type="search"
          placeholder={t('gigs.organisers.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="gigs-rows">
          {shown.map((member) => (
            <ListRow
              key={member.id}
              label={member.nickname}
              detail={member.instrument || undefined}
              checked={ticked.includes(member.id)}
              onCheck={(checked) =>
                setTicked(
                  checked ? [...ticked, member.id] : ticked.filter((id) => id !== member.id),
                )
              }
            />
          ))}
          {shown.length === 0 && (
            <p className="gigs-muted textBody">{t('gigs.organisers.nobody')}</p>
          )}
        </div>
        <Button onClick={() => onChoose([...kept, ...ticked.filter((id) => !kept.includes(id))])}>
          {t('gigs.organisers.validate', { count })}
        </Button>
      </div>
    </Panel>
  );
}
