import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../../api.ts';
import { Button } from '../../components/Button.tsx';
import { DiscordChannelCard } from '../../components/DiscordChannelCard.tsx';
import { DiscordMessageCard } from '../../components/DiscordMessageCard.tsx';
import { Icon, type IconName } from '../../components/Icon.tsx';
import { IconButton } from '../../components/IconButton.tsx';
import { LevelScale } from '../../components/LevelScale.tsx';
import { ListRow } from '../../components/ListRow.tsx';
import { Message } from '../../components/Message.tsx';
import { ModeBar, type SongMode } from '../../components/ModeBar.tsx';
import { NavRow } from '../../components/NavRow.tsx';
import { Panel } from '../../components/Panel.tsx';
import { Sheet } from '../../components/Sheet.tsx';
import { SongHeader } from '../../components/SongHeader.tsx';
import { SongPartRow } from '../../components/SongPartRow.tsx';
import { Waveform } from '../../components/Waveform.tsx';
import { instrumentsOf, type Section, useSections } from '../../members.ts';
import { useMe } from '../../session.ts';
import {
  downloadAddress,
  type LevelAverage,
  type Song,
  type SongStatus,
  songStatuses,
  useSong,
  useSongDiscord,
} from '../../songs.ts';
import { keep, kept, useIsTablet } from './device.ts';
import { saveOutline } from './files.ts';
import { average, duration as clock, day } from './format.ts';
import { LiveView } from './LiveView.tsx';
import { MidiView } from './MidiView.tsx';
import { PdfView } from './PdfView.tsx';
import { usePlayer } from './Player.tsx';
import './songs.css';

// Every mode is built: none is shown as unavailable.
const NOT_BUILT: SongMode[] = [];

type Props = {
  songId: number;
  /** Where the way back leads; none in the pane of a desktop, where the list stays beside. */
  back?: string;
  /** The level of the heading of the song: 2 in the pane, under the title of the page. */
  headingLevel?: 1 | 2;
};

// Figma: Songs / Song, in its modes. The cover at the top with the mode bar,
// the content of the mode, then what the band says of the song and what the
// member says of it. The same on a phone (the whole screen), on a tablet,
// and in the pane beside the list on a desktop.
export function SongView({ songId, back, headingLevel = 1 }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe().data;
  const song = useSong(songId);
  const sections = useSections().data;
  const instruments = instrumentsOf(sections);
  const isTablet = useIsTablet();
  const [search, setSearch] = useSearchParams();
  const [panel, setPanel] = useState<'more' | 'parts' | 'status' | null>(null);
  const [shownPartOf, setShownPartOf] = useState<number | null>(null);
  const [isFullScreen, setFullScreen] = useState(false);

  // The mode asked by the address (the mini-player opens the MP3 mode), or
  // the last one used on this device.
  const asked = search.get('mode') as SongMode | null;
  const [mode, setMode] = useState<SongMode>(() => {
    const first = asked ?? kept('songs.mode', 'mp3');
    return NOT_BUILT.includes(first) || first === 'live' ? 'mp3' : first;
  });
  useEffect(() => {
    if (asked && !NOT_BUILT.includes(asked)) setMode(asked);
  }, [asked]);
  // The Live mode takes the whole screen: leaving it comes back to the mode before.
  const beforeLive = useRef<SongMode>('mp3');
  const changeMode = (next: SongMode) => {
    if (next === 'live' && mode !== 'live') beforeLive.current = mode;
    setMode(next);
    // The Live mode is entered on purpose each time: never the mode a song opens in.
    if (next !== 'live') keep('songs.mode', next);
    if (asked) setSearch({}, { replace: true });
  };

  const canManage = me?.permissions.includes('manageSongs') ?? false;
  const refresh = (saved: Song) => {
    queryClient.setQueryData(['songs', songId], saved);
    void queryClient.invalidateQueries({ queryKey: ['songs'], exact: true });
  };
  const changeStatus = useMutation({
    mutationFn: (status: SongStatus) =>
      api<Song>(`/api/songs/${songId}/status`, { method: 'PUT', body: { status } }),
    onSuccess: refresh,
  });

  if (song.isPending) {
    return (
      <div className="songs-view" aria-busy="true">
        <p role="status" className="visuallyHidden">
          {t('songs.list.loading')}
        </p>
        <div className="songs-skeleton" data-shape="header" />
        <div className="songs-skeleton" data-shape="card" />
        <div className="songs-skeleton" data-shape="card" />
      </div>
    );
  }
  if (song.isError) {
    const isGone =
      song.error instanceof Error && 'status' in song.error && song.error.status === 404;
    return (
      <div className="songs-view">
        <Sheet title={isGone ? t('songs.song.notFoundTitle') : undefined}>
          {isGone ? (
            <p className="songs-muted">{t('songs.song.notFound')}</p>
          ) : (
            <Message kind="danger">{t('errors.unreachable')}</Message>
          )}
          {back && (
            <Button kind="secondary" onClick={() => navigate(back)}>
              {t('songs.song.backToList')}
            </Button>
          )}
        </Sheet>
      </div>
    );
  }

  const data = song.data;
  const edit = () => navigate(`/songs/${songId}/edit`);
  const ownInstrument = instruments.find((instrument) => instrument.id === me?.instrumentId);
  const ownPart = data.parts.find((part) => part.instrumentId === me?.instrumentId);
  // The part of the member's instrument first, with no word saying so.
  const shownPart =
    data.parts.find((part) => part.instrumentId === shownPartOf) ?? ownPart ?? data.parts[0];
  const shownInstrument = instruments.find(
    (instrument) => instrument.id === shownPart?.instrumentId,
  );

  if (mode === 'live' && data.musicXml) {
    return (
      <LiveView
        song={data}
        onClose={() => {
          changeMode(beforeLive.current);
          // The focus goes back to where the member came from: the mode bar.
          window.requestAnimationFrame(() =>
            document.querySelector<HTMLElement>('.ModeBar [aria-current="true"]')?.focus(),
          );
        }}
      />
    );
  }

  return (
    <div className="songs-view">
      <SongHeader
        song={data}
        size={isTablet ? 'compact' : 'large'}
        headingLevel={headingLevel}
        back={back ? { to: back, label: t('common.back') } : undefined}
        more={{ label: t('songs.song.more'), onPress: () => setPanel('more') }}
        modeBar={
          <ModeBar
            current={mode}
            onChange={changeMode}
            label={t('songs.modes.label')}
            unavailable={NOT_BUILT}
            labels={{
              mp3: t('songs.modes.mp3'),
              midi: t('songs.modes.midi'),
              pdf: t('songs.modes.pdf'),
              clip: t('songs.modes.clip'),
              live: t('songs.modes.live'),
            }}
          />
        }
      >
        <div className="songs-content">
          {mode === 'mp3' &&
            (data.audio ? (
              <AudioCard song={data} />
            ) : (
              <NothingYet
                icon="AudioLines"
                title={t('songs.song.noAudioTitle')}
                text={t(canManage ? 'songs.song.noAudioManager' : 'songs.song.noAudioMember')}
                action={canManage ? { label: t('songs.song.addAudio'), onPress: edit } : undefined}
              />
            ))}

          {mode === 'midi' &&
            (data.midi ? (
              <MidiView song={data} />
            ) : (
              <NothingYet
                icon="Piano"
                title={t('songs.song.noMidiTitle')}
                text={t(canManage ? 'songs.song.noMidiManager' : 'songs.song.noMidiMember')}
                action={canManage ? { label: t('songs.song.addMidi'), onPress: edit } : undefined}
              />
            ))}

          {mode === 'live' && !data.musicXml && (
            <NothingYet
              icon="BookOpen"
              title={t('songs.song.noScoreTitle')}
              text={t(canManage ? 'songs.song.noScoreManager' : 'songs.song.noScoreMember')}
              action={canManage ? { label: t('songs.song.addMidi'), onPress: edit } : undefined}
            />
          )}

          {mode === 'pdf' &&
            (shownPart ? (
              <>
                <div className="songs-partBar">
                  <button
                    type="button"
                    className="songs-partPicker textBodyStrong"
                    aria-haspopup="dialog"
                    aria-label={t('songs.song.choosePart')}
                    onClick={() => setPanel('parts')}
                  >
                    <span>{shownInstrument?.name ?? ''}</span>
                    <Icon name="ChevronDown" size={20} />
                  </button>
                  <IconButton
                    kind="control"
                    icon="Maximize"
                    label={t('songs.song.fullScreen')}
                    onClick={() => setFullScreen(true)}
                  />
                </div>
                <PdfView
                  url={shownPart.url}
                  isFullScreen={isFullScreen}
                  onLeaveFullScreen={() => setFullScreen(false)}
                />
              </>
            ) : (
              <NothingYet
                icon="FileText"
                title={t('songs.song.noPartsTitle')}
                text={t(canManage ? 'songs.song.noPartsManager' : 'songs.song.noPartsMember')}
                action={canManage ? { label: t('songs.song.addParts'), onPress: edit } : undefined}
              />
            ))}

          {mode === 'clip' &&
            (data.clipUrl ? (
              <Clip song={data} />
            ) : (
              <NothingYet
                icon="Clip"
                title={t('songs.song.noClipTitle')}
                text={t(canManage ? 'songs.song.noClipManager' : 'songs.song.noClipMember')}
                action={canManage ? { label: t('songs.song.addClip'), onPress: edit } : undefined}
              />
            ))}

          <div className="songs-cards">
            <Sheet title={t('songs.song.about')}>
              {(data.versionOn || data.versionNote) && (
                <div className="songs-version">
                  {data.versionOn && (
                    <p className="songs-versionDate textBodyStrong">
                      {t('songs.song.version', { date: day(data.versionOn, i18n.language) })}
                    </p>
                  )}
                  {data.versionNote && <p className="songs-versionNote">{data.versionNote}</p>}
                </div>
              )}
              <dl className="songs-facts">
                <div>
                  <dt>{t('songs.song.originalTitle')}</dt>
                  <dd className="textBodyStrong">{data.originalTitle}</dd>
                </div>
                {/* Missing tempo: the line is not shown (model/songs.md, "Display"). */}
                {data.bpm !== null && (
                  <div>
                    <dt>{t('songs.song.tempo')}</dt>
                    <dd className="textBodyStrong">
                      {t('songs.song.tempoValue', { bpm: data.bpm })}
                    </dd>
                  </div>
                )}
                <div className="songs-phoneOnly">
                  <dt>{t('songs.song.status')}</dt>
                  <dd className="textBodyStrong">{t(`songs.status.${data.status}`)}</dd>
                </div>
                <SetlistFacts song={data} sections={sections ?? []} />
              </dl>
            </Sheet>

            <Levels song={data} onSaved={refresh} />
          </div>
          {data.discordUrl && <DiscordCard song={data} url={data.discordUrl} />}
        </div>
      </SongHeader>

      <Panel open={panel === 'more'} onClose={() => setPanel(null)} title={data.name}>
        <div className="songs-panel">
          {(ownPart || data.audio || data.museScore || data.midi) && (
            <section className="songs-panelGroup">
              <h3 className="textLabel songs-muted">{t('songs.song.download')}</h3>
              {ownPart && (
                <NavRow
                  icon="Download"
                  label={t('songs.song.ownPart')}
                  detail={t('songs.song.ownPartDetail', { instrument: ownInstrument?.name ?? '' })}
                  href={downloadAddress(ownPart)}
                  chevron={false}
                />
              )}
              {data.audio && (
                <NavRow
                  icon="Download"
                  label={t('songs.song.audio')}
                  detail={data.audio.format}
                  href={downloadAddress(data.audio)}
                  chevron={false}
                />
              )}
              {data.museScore && (
                <NavRow
                  icon="Download"
                  label={t('songs.song.museScore')}
                  detail={t('songs.song.museScoreDetail')}
                  href={downloadAddress(data.museScore)}
                  chevron={false}
                />
              )}
              {data.midi && (
                <NavRow
                  icon="Download"
                  label={t('songs.song.midi')}
                  href={downloadAddress(data.midi)}
                  chevron={false}
                />
              )}
            </section>
          )}
          {canManage && (
            <section className="songs-panelGroup">
              <h3 className="textLabel songs-muted">{t('songs.song.manage')}</h3>
              <NavRow icon="Pencil" label={t('songs.song.edit')} to={`/songs/${songId}/edit`} />
              <NavRow
                icon="Flag"
                label={t('songs.song.changeStatus')}
                detail={t(`songs.status.${data.status}`)}
                onClick={() => setPanel('status')}
                opensPanel
              />
            </section>
          )}
        </div>
      </Panel>

      <Panel open={panel === 'parts'} onClose={() => setPanel(null)} title={t('songs.song.parts')}>
        <ul className="songs-rows">
          {instruments.map((instrument) => {
            const part = data.parts.find((other) => other.instrumentId === instrument.id);
            const isShown = part !== undefined && part === shownPart;
            return (
              <li key={instrument.id}>
                <SongPartRow
                  name={instrument.name}
                  state={!part ? 'missing' : isShown ? 'shown' : 'available'}
                  detail={
                    !part
                      ? t('songs.song.partMissing')
                      : isShown
                        ? t('songs.song.partShown')
                        : undefined
                  }
                  onPress={
                    part
                      ? () => {
                          setShownPartOf(instrument.id);
                          setPanel(null);
                        }
                      : undefined
                  }
                />
              </li>
            );
          })}
        </ul>
      </Panel>

      <StatusPanel
        open={panel === 'status'}
        onClose={() => setPanel(null)}
        status={data.status}
        onChange={changeStatus.mutate}
        hasFailed={changeStatus.isError}
      />
    </div>
  );
}

type StatusPanelProps = {
  open: boolean;
  onClose: () => void;
  status: SongStatus;
  onChange: (status: SongStatus) => void;
  hasFailed?: boolean;
};

// Figma: Songs / Change status. One status among five: it changes at once,
// for everyone.
export function StatusPanel({ open, onClose, status, onChange, hasFailed }: StatusPanelProps) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState(status);
  useEffect(() => setChosen(status), [status]);

  // With a keyboard, the arrows go through the statuses one by one: the
  // choice is saved once it has stopped moving, not at each step, which
  // would show every status in between to the whole band.
  useEffect(() => {
    if (chosen === status) return;
    const waiting = window.setTimeout(() => onChange(chosen), 600);
    return () => window.clearTimeout(waiting);
  }, [chosen, status, onChange]);

  return (
    <Panel open={open} onClose={onClose} title={t('songs.song.statusTitle')}>
      <div className="songs-panel">
        {hasFailed && <Message kind="danger">{t('errors.unreachable')}</Message>}
        {/* One status among five: a group of radios (Figma: ListRow, Leading=Selected / Unselected). */}
        <div className="songs-statuses" role="radiogroup" aria-label={t('songs.song.statusTitle')}>
          {songStatuses.map((value) => (
            <ListRow
              key={value}
              group="songStatus"
              label={t(`songs.status.${value}`)}
              detail={t(`songs.statusHint.${value}`)}
              selected={value === chosen}
              onSelect={() => setChosen(value)}
            />
          ))}
        </div>
        <p className="songs-muted textCaption">{t('songs.song.statusNote')}</p>
      </div>
    </Panel>
  );
}

type NothingYetProps = {
  icon: IconName;
  title: string;
  text: string;
  action?: { label: string; onPress: () => void };
};

// Figma: Songs / Song — a mode with nothing yet. A message, and a way to add
// what is missing for whoever manages songs.
function NothingYet({ icon, title, text, action }: NothingYetProps) {
  return (
    <div className="songs-nothing">
      <Icon name={icon} size={32} />
      <h2 className="textHeading">{title}</h2>
      <p className="songs-muted">{text}</p>
      {action && (
        <Button kind="secondary" icon="Upload" onClick={action.onPress}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

// The recordings whose outline this page is computing: once each.
const computing = new Set<string>();

/**
 * A recording without its outline, or with one of an older kind (#29), gets
 * it from the browser of whoever manages songs, the first time they open its
 * MP3 mode (model/songs.md, "The waveform of a recording"). Until then the
 * waveform is a plain line of bars.
 */
function useOutline(song: Song) {
  const me = useMe().data;
  const queryClient = useQueryClient();
  const canManage = me?.permissions.includes('manageSongs') ?? false;
  const url = song.audio?.url ?? '';
  const isMissing = song.audio !== null && song.audio.peaks === null;
  useEffect(() => {
    if (!canManage || !isMissing || url === '' || computing.has(url)) return;
    computing.add(url);
    (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('The recording could not be read');
      const saved = await saveOutline(song.id, await response.blob(), url);
      if (saved) queryClient.setQueryData(['songs', song.id], saved);
    })().catch(() => {
      // Tried again the next time the page is opened.
      computing.delete(url);
    });
  }, [canManage, isMissing, url, song.id, queryClient]);
}

// Figma: Songs / Song — MP3. The recording of the band: its outline, which
// the member touches or drags, and back and forward ten seconds.
function AudioCard({ song }: { song: Song }) {
  const { t } = useTranslation();
  const player = usePlayer();
  useOutline(song);
  const audio = song.audio;
  if (!audio) return null;

  const isLoaded = player.song?.id === song.id && player.song.url === audio.url;
  const isPlaying = isLoaded && player.isPlaying;
  const position = isLoaded ? player.position : 0;
  const length = isLoaded ? player.duration : 0;
  const play = () =>
    player.play({ id: song.id, name: song.name, coverUrl: song.coverUrl, url: audio.url });

  return (
    <section className="songs-audio" aria-label={t('songs.player.caption')}>
      <p className="songs-audioCaption textCaption">{t('songs.player.caption')}</p>
      {isLoaded && player.hasFailed && (
        <div className="songs-audioError">
          <Message kind="danger">{t('songs.player.error')}</Message>
          <Button kind="secondary" size="small" onClick={play}>
            {t('songs.player.retry')}
          </Button>
        </div>
      )}
      <Waveform
        peaks={audio.peaks}
        duration={length}
        position={position}
        onSeek={(seconds) => (isLoaded ? player.seek(seconds) : undefined)}
        label={t('songs.player.waveform')}
        valueText={t('songs.player.position', {
          position: clock(position),
          duration: clock(length),
        })}
      />
      <div className="songs-audioTimes textCaption">
        <span>{clock(position)}</span>
        <span>{clock(length)}</span>
      </div>
      <div className="songs-audioControls">
        <button
          type="button"
          className="songs-audioSkip textCaption"
          aria-label={t('songs.player.back10')}
          disabled={!isLoaded}
          onClick={() => player.seek(position - 10)}
        >
          <Icon name="RotateCcw" />
          <span aria-hidden="true">{t('songs.player.tenSeconds')}</span>
        </button>
        <button
          type="button"
          className="songs-audioPlay"
          aria-label={t(isPlaying ? 'songs.player.pause' : 'songs.player.play')}
          onClick={() => (isPlaying ? player.pause() : play())}
        >
          <Icon name={isPlaying ? 'Pause' : 'Play'} size={32} />
        </button>
        <button
          type="button"
          className="songs-audioSkip textCaption"
          aria-label={t('songs.player.forward10')}
          disabled={!isLoaded}
          onClick={() => player.seek(position + 10)}
        >
          <Icon name="RotateCw" />
          <span aria-hidden="true">{t('songs.player.tenSeconds')}</span>
        </button>
      </div>
    </section>
  );
}

// Figma: Songs / Song — Clip. The thumbnail the server keeps, and a play
// button: nothing is asked of YouTube before the member presses it. The
// player is then the one of YouTube that sets no cookie before playing.
function Clip({ song }: { song: Song }) {
  const { t } = useTranslation();
  const [isPlaying, setPlaying] = useState(false);
  // The identifier the server read from the address, and checked.
  const videoId = song.clipVideoId;
  // Without a thumbnail, the cover art stands in for it.
  const poster = song.clipThumbnailUrl ?? song.coverUrl;

  return (
    <div className="songs-clip">
      <div className="songs-clipFrame">
        {isPlaying && videoId ? (
          <iframe
            title={t('songs.song.clipTitle', { name: song.name })}
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            className="songs-clipPlay"
            aria-label={t('songs.song.playClip')}
            disabled={!videoId}
            onClick={() => setPlaying(true)}
          >
            {poster && <img src={poster} alt="" />}
            {/* Over an image of any colour: drawn for a dark ground, like what floats over a cover. */}
            <span data-scheme="dark">
              <Icon name="Play" size={32} />
            </span>
          </button>
        )}
      </div>
      {song.clipUrl && (
        <a
          className="songs-clipLink textBodyStrong"
          href={song.clipUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t('songs.song.openYoutube')}
          <Icon name="ExternalLink" size={20} />
        </a>
      )}
    </div>
  );
}

// Figma: Songs / Song — "À propos" (0.3.0): what the setlist generator
// reads, a line each, in the order of Figma. A line without a value is not
// shown (model/songs.md, "Display"): a Standard song with no other category
// has no line "Pour les setlists".
function SetlistFacts({ song, sections }: { song: Song; sections: Section[] }) {
  const { t, i18n } = useTranslation();
  const names = (ids: number[]) =>
    new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(
      sections.filter((section) => ids.includes(section.id)).map((section) => section.name),
    );
  // "2e moitié, fin": the positions in the order of a set, one sentence.
  const positions = song.positions
    .map((position, index) => {
      const label = t(`songs.position.${position}`);
      return index === 0 ? label : label.toLocaleLowerCase(i18n.language);
    })
    .join(', ');
  const facts: [string, string][] = [
    ...(song.inRepertoireOn
      ? [[t('songs.song.inRepertoireSince'), song.inRepertoireOn.slice(0, 4)] as [string, string]]
      : []),
    ...(song.durationSeconds
      ? [[t('songs.song.duration'), clock(song.durationSeconds)] as [string, string]]
      : []),
    [t('songs.song.mood'), t(`songs.mood.${song.mood}`)],
    ...(positions ? [[t('songs.song.positions'), positions] as [string, string]] : []),
    ...(song.tiringSectionIds.length > 0
      ? [[t('songs.song.tiringFor'), names(song.tiringSectionIds)] as [string, string]]
      : []),
    ...(song.trickySectionIds.length > 0
      ? [[t('songs.song.trickyFor'), names(song.trickySectionIds)] as [string, string]]
      : []),
    // Last of the sheet (Figma, Songs, section 15).
    ...(song.copyright ? [[t('songs.song.copyright'), song.copyright] as [string, string]] : []),
  ];

  return facts.map(([label, value]) => (
    <div key={label}>
      <dt>{label}</dt>
      <dd className="textBodyStrong">{value}</dd>
    </div>
  ));
}

// Figma: Songs / Song — the Discord card (section 15, 0.3.0, issue #33). It
// ends the sheet when the song has a channel. It asks the API for the
// messages that tag the section of the member when the sheet opens; until
// they come, when none does, or when Discord does not answer, the card shows
// its sentence and its button only, with no error.
function DiscordCard({ song, url }: { song: Song; url: string }) {
  const { t, i18n } = useTranslation();
  const asked = useSongDiscord(song.id, true);
  const discord = asked.data;
  const messages = discord?.messages ?? [];
  // While the messages come: the button alone.
  const text = asked.isPending
    ? undefined
    : messages.length > 0 && discord?.roleName
      ? t('songs.song.discord.tagged', { role: `@${discord.roleName}` })
      : discord?.roleName
        ? t('songs.song.discord.nothingTagged', { role: `@${discord.roleName}` })
        : t('songs.song.discord.nothingToShow');

  return (
    <DiscordChannelCard title={t('discord.title')} text={text} url={url}>
      {messages.length > 0 &&
        messages.map((message) => (
          <DiscordMessageCard
            key={message.id}
            author={message.author}
            day={day(message.postedAt.slice(0, 10), i18n.language, 'short')}
            text={message.text}
            url={message.url}
          />
        ))}
    </DiscordChannelCard>
  );
}

// Figma: Songs / Song — "Toi et ce morceau". The two levels of the member,
// seen by them only, each with the average of the band under it.
function Levels({ song, onSaved }: { song: Song; onSaved: (song: Song) => void }) {
  const { t, i18n } = useTranslation();
  const [levels, setLevels] = useState(song.ownLevels);
  useEffect(() => setLevels(song.ownLevels), [song.ownLevels]);

  // The choice shows in the same instant as the press, then is saved, and
  // put back if the server refuses.
  const save = useMutation({
    mutationFn: (next: Song['ownLevels']) =>
      api<Song>(`/api/songs/${song.id}/levels`, { method: 'PUT', body: next }),
    onSuccess: onSaved,
    onError: () => setLevels(song.ownLevels),
  });
  const change = (next: Song['ownLevels']) => {
    setLevels(next);
    save.mutate(next);
  };
  const ofBand = (level: LevelAverage): ReactNode =>
    level.average !== null && (
      <span className="songs-average textCaption">
        {t('songs.song.average', {
          count: level.count,
          average: average(level.average, i18n.language),
        })}
      </span>
    );

  return (
    <Sheet title={t('songs.song.levels')}>
      {save.isError && <Message kind="danger">{t('songs.song.levelsError')}</Message>}
      <LevelScale
        label={t('songs.song.mastery')}
        name={`mastery-${song.id}`}
        value={levels.masteryLevel}
        onChange={(masteryLevel) => change({ ...levels, masteryLevel })}
        lowLabel={t('songs.song.masteryLow')}
        highLabel={t('songs.song.masteryHigh')}
      >
        {ofBand(song.mastery)}
      </LevelScale>
      <LevelScale
        label={t('songs.song.enjoyment')}
        name={`enjoyment-${song.id}`}
        value={levels.enjoymentLevel}
        onChange={(enjoymentLevel) => change({ ...levels, enjoymentLevel })}
        lowLabel={t('songs.song.enjoymentLow')}
        highLabel={t('songs.song.enjoymentHigh')}
      >
        {ofBand(song.enjoyment)}
      </LevelScale>
      <p className="songs-muted textCaption songs-phoneOnly">{t('songs.song.levelsPrivate')}</p>
    </Sheet>
  );
}
