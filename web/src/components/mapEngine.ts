// The map library, in a file of its own so that it is loaded only by the
// screen that draws a map (GigMeetingMap imports this file when it appears).
// MapLibre GL JS is served by the app, like its worker: nothing comes from a
// CDN, and the style below asks for no font and no image.
import { Map as MapLibreMap, type StyleSpecification, setWorkerUrl } from 'maplibre-gl';
// The worker of the library, built with the app into a file of its own: the
// library would otherwise look for it beside its own file, where nothing is.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

setWorkerUrl(workerUrl);

/** The five colours of the map: the variables mapGround… of the scheme, read where the map is. */
export type MapColours = {
  ground: string;
  green: string;
  water: string;
  building: string;
  street: string;
};

// What counts as "parks and green spaces" in the land layer of the Shortbread schema.
const GREEN = [
  'park',
  'garden',
  'playground',
  'village_green',
  'recreation_ground',
  'grass',
  'meadow',
  'forest',
  'orchard',
  'vineyard',
  'allotments',
  'scrub',
  'heath',
  'golf_course',
  'cemetery',
  'grave_yard',
];
const MAJOR = ['motorway', 'trunk', 'primary'];
const MIDDLE = ['secondary', 'tertiary'];
const PATHS = ['footway', 'path', 'steps', 'cycleway', 'track', 'bridleway'];

// The width of a street by its kind, in pixels at a zoom.
const streetWidth = (major: number, middle: number, small: number, path: number) => [
  'match',
  ['get', 'kind'],
  MAJOR,
  major,
  MIDDLE,
  middle,
  PATHS,
  path,
  small,
];

/**
 * The style of the preview: streets, water, parks and buildings in the greys
 * of the scheme. No name, no shop: the layers that carry them are not drawn,
 * so no font is ever asked for.
 *
 * @param tilesUrl The TileJSON address of vector tiles in the Shortbread schema
 */
function styleOf(tilesUrl: string, colours: MapColours): StyleSpecification {
  return {
    version: 8,
    sources: { tiles: { type: 'vector', url: tilesUrl } },
    layers: [
      { id: 'ground', type: 'background', paint: { 'background-color': colours.ground } },
      {
        id: 'green',
        type: 'fill',
        source: 'tiles',
        'source-layer': 'land',
        filter: ['in', ['get', 'kind'], ['literal', GREEN]],
        paint: { 'fill-color': colours.green },
      },
      {
        id: 'ocean',
        type: 'fill',
        source: 'tiles',
        'source-layer': 'ocean',
        paint: { 'fill-color': colours.water },
      },
      {
        id: 'waterPolygons',
        type: 'fill',
        source: 'tiles',
        'source-layer': 'water_polygons',
        paint: { 'fill-color': colours.water },
      },
      {
        id: 'waterLines',
        type: 'line',
        source: 'tiles',
        'source-layer': 'water_lines',
        filter: ['!=', ['get', 'tunnel'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': colours.water,
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 1, 17, 5, 19, 12],
        },
      },
      {
        id: 'buildings',
        type: 'fill',
        source: 'tiles',
        'source-layer': 'buildings',
        paint: { 'fill-color': colours.building },
      },
      {
        id: 'streetPolygons',
        type: 'fill',
        source: 'tiles',
        'source-layer': 'street_polygons',
        filter: ['!=', ['get', 'tunnel'], true],
        paint: { 'fill-color': colours.street },
      },
      {
        id: 'streets',
        type: 'line',
        source: 'tiles',
        'source-layer': 'streets',
        // Neither the tunnels nor the railways.
        filter: ['all', ['!=', ['get', 'tunnel'], true], ['!=', ['get', 'rail'], true]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': colours.street,
          'line-width': [
            'interpolate',
            ['exponential', 1.6],
            ['zoom'],
            12,
            streetWidth(2.5, 1.5, 0.6, 0),
            17,
            // Figma draws the streets 10, 8 and 6 thick.
            streetWidth(10, 8, 6, 1.5),
            19,
            streetWidth(28, 22, 16, 4),
          ],
        },
      },
    ] as StyleSpecification['layers'],
  };
}

export type Preview = {
  setZoom: (zoom: number) => void;
  setColours: (colours: MapColours) => void;
  remove: () => void;
};

/**
 * Draws a still preview centred on a point: it is not moved, turned or
 * zoomed by hand. Throws when the browser cannot draw it (no WebGL).
 */
export function preview(
  container: HTMLElement,
  tilesUrl: string,
  centre: { latitude: number; longitude: number },
  zoom: number,
  colours: MapColours,
): Preview {
  const map = new MapLibreMap({
    container,
    style: styleOf(tilesUrl, colours),
    center: [centre.longitude, centre.latitude],
    zoom,
    interactive: false,
    // The credit is written by the app, always visible (GigMeetingMap).
    attributionControl: false,
    // Nothing is said to the library's own servers, and nothing is kept on the device.
    fadeDuration: 0,
  });

  return {
    setZoom: (next) => map.setZoom(next),
    setColours: (next) => map.setStyle(styleOf(tilesUrl, next)),
    remove: () => map.remove(),
  };
}
