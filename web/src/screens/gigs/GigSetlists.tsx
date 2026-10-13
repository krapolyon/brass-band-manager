import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api } from '../../api.ts';
import { Button } from '../../components/Button.tsx';
import { Message } from '../../components/Message.tsx';
import { SetlistCard } from '../../components/SetlistCard.tsx';
import { SetlistSongRow } from '../../components/SetlistSongRow.tsx';
import type { Gig, Setlist } from '../../gigs.ts';
import { useMe } from '../../session.ts';

type Props = {
  gig: Gig;
  headingLevel: 2 | 3;
  /** False once the gig is over: its setlists say what was played, nothing is played live any more. */
  canGoLive: boolean;
};

// Figma: Gigs / Gig in progress — setlists (section 11). The setlists of a
// confirmed gig, as an accordion: one open at a time, the one that is live
// first, the first one otherwise. A member opens a song by touching it; who
// manages setlists writes them and starts them live.
export function GigSetlists({ gig, headingLevel, canGoLive }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = useMe().data?.permissions.includes('manageSetlists') ?? false;
  const live = gig.setlists.find((setlist) => setlist.livePosition !== null);
  const [openId, setOpenId] = useState<number | null>((live ?? gig.setlists[0])?.id ?? null);

  const start = useMutation({
    mutationFn: (setlist: Setlist) =>
      api<Setlist>(`/api/setlists/${setlist.id}/live`, { method: 'POST' }),
    onSuccess: (setlist) => {
      queryClient.invalidateQueries({ queryKey: ['gig', gig.id] });
      navigate(`/setlists/${setlist.id}/live`);
    },
  });

  if (gig.setlists.length === 0 && !canManage) return null;

  return (
    <>
      {gig.setlists.map((setlist) => {
        const isLive = setlist.livePosition !== null;
        const songs = t('gigs.setlist.songs', { count: setlist.songs.length });
        return (
          <SetlistCard
            key={setlist.id}
            open={openId === setlist.id}
            onToggle={() => setOpenId(openId === setlist.id ? null : setlist.id)}
            title={t('gigs.setlist.title', { number: setlist.number })}
            description={
              setlist.description
                ? t('gigs.setlist.described', { description: setlist.description, songs })
                : songs
            }
            live={
              isLive
                ? t('gigs.setlist.live', {
                    position: setlist.livePosition,
                    count: setlist.songs.length,
                  })
                : undefined
            }
            headingLevel={headingLevel}
            actions={
              (canManage || isLive) && (
                <>
                  {isLive ? (
                    <Button
                      kind="secondary"
                      size="small"
                      icon="Play"
                      iconFilled
                      onClick={() => navigate(`/setlists/${setlist.id}/live`)}
                    >
                      {t(canManage ? 'gigs.setlist.resumeLive' : 'gigs.setlist.followLive')}
                    </Button>
                  ) : (
                    canGoLive &&
                    setlist.songs.length > 0 && (
                      <Button
                        kind="secondary"
                        size="small"
                        icon="Play"
                        iconFilled
                        disabled={start.isPending}
                        onClick={() => start.mutate(setlist)}
                      >
                        {t('gigs.setlist.startLive')}
                      </Button>
                    )
                  )}
                  {canManage && (
                    <Button
                      kind="quiet"
                      size="small"
                      icon="Pencil"
                      onClick={() => navigate(`/gigs/${gig.id}/setlists/${setlist.id}`)}
                    >
                      {t('gigs.setlist.edit')}
                    </Button>
                  )}
                </>
              )
            }
          >
            {setlist.songs.map((song) => (
              <SetlistSongRow
                key={song.position}
                position={song.position}
                name={song.name}
                to={`/songs/${song.songId}`}
              />
            ))}
          </SetlistCard>
        );
      })}
      {start.isError && <Message kind="danger">{t('gigs.setlist.startFailed')}</Message>}
      {canManage && (
        <>
          {gig.setlists.length === 0 && (
            <p className="gigs-muted textCaption">{t('gigs.setlist.none')}</p>
          )}
          <Button
            kind="secondary"
            icon="Plus"
            onClick={() => navigate(`/gigs/${gig.id}/setlists/new`)}
          >
            {t('gigs.setlist.add')}
          </Button>
        </>
      )}
    </>
  );
}
