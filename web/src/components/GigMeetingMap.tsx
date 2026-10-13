import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.tsx';
import { IconButton } from './IconButton.tsx';
import type { MapColours, Preview } from './mapEngine.ts';
import './GigMeetingMap.css';

type Props = {
  latitude: number;
  longitude: number;
  /** The TileJSON address of the vector tiles (an instance setting, given with the gig). */
  tilesUrl: string;
  /** A press on the map: opens the maps app, like "Y aller". */
  onOpen: () => void;
  zoomInLabel: string;
  zoomOutLabel: string;
};

// Figma: the Map frame of Gig/Meeting. Zoom 17 at first; the two buttons
// change it by 1, between 12 and 19.
const START_ZOOM = 17;
const MIN_ZOOM = 12;
const MAX_ZOOM = 19;

const coloursAt = (element: HTMLElement): MapColours => {
  const style = getComputedStyle(element);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return {
    ground: read('--mapGround'),
    green: read('--mapGreen'),
    water: read('--mapWater'),
    building: read('--mapBuilding'),
    street: read('--mapStreet'),
    streetMajor: read('--mapStreetMajor'),
  };
};

// A still preview of where the band meets: streets, water, parks and
// buildings in the greys of the scheme, no name, no shop, with the pin on the
// meeting point. It is decoration for assistive technology, which has the
// address in words and "Y aller" beside it; a press on it does what "Y aller"
// does. The credit of the map data stays visible, as its licence asks.
//
// The map library is loaded when the map appears, never before; a browser
// that cannot draw it shows the ground alone.
export function GigMeetingMap({
  latitude,
  longitude,
  tilesUrl,
  onOpen,
  zoomInLabel,
  zoomOutLabel,
}: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const map = useRef<Preview | null>(null);
  const [zoom, setZoom] = useState(START_ZOOM);
  const zoomNow = useRef(zoom);
  zoomNow.current = zoom;

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let isGone = false;
    let stopWatching = () => {};

    import('./mapEngine.ts')
      .then(({ preview }) => {
        if (isGone) return;
        const drawn = preview(
          element,
          tilesUrl,
          { latitude, longitude },
          zoomNow.current,
          coloursAt(element),
        );
        map.current = drawn;

        // The scheme or the contrast changed: the map takes its new colours.
        const recolour = () => drawn.setColours(coloursAt(element));
        const attributes = new MutationObserver(recolour);
        attributes.observe(document.documentElement, { attributes: true });
        const media = ['(prefers-color-scheme: dark)', '(prefers-contrast: more)'].map((query) =>
          window.matchMedia(query),
        );
        for (const one of media) one.addEventListener('change', recolour);
        stopWatching = () => {
          attributes.disconnect();
          for (const one of media) one.removeEventListener('change', recolour);
        };
      })
      // No WebGL, or the library did not load: the ground, the pin and the credit stay.
      .catch(() => {});

    return () => {
      isGone = true;
      stopWatching();
      map.current?.remove();
      map.current = null;
    };
  }, [latitude, longitude, tilesUrl]);

  const zoomTo = (next: number) => {
    setZoom(next);
    map.current?.setZoom(next);
  };

  return (
    <div className="GigMeetingMap" data-zoom={zoom}>
      {/* A shortcut for a pointer; "Y aller", beside it, is the button. */}
      <div className="GigMeetingMap-canvas" ref={canvas} aria-hidden="true" onClick={onOpen} />
      <span className="GigMeetingMap-pin" aria-hidden="true">
        <Icon name="MapPin" filled />
      </span>
      <div className="GigMeetingMap-zoom">
        <IconButton
          kind="glass"
          icon="SearchZoomIn"
          label={zoomInLabel}
          disabled={zoom >= MAX_ZOOM}
          onClick={() => zoomTo(Math.min(MAX_ZOOM, zoom + 1))}
        />
        <IconButton
          kind="glass"
          icon="SearchZoomOut"
          label={zoomOutLabel}
          disabled={zoom <= MIN_ZOOM}
          onClick={() => zoomTo(Math.max(MIN_ZOOM, zoom - 1))}
        />
      </div>
      {/* Not translated: the name the licence asks to show. */}
      <a
        className="GigMeetingMap-credit textMicro"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        © OpenStreetMap
      </a>
    </div>
  );
}
