// The drawing of one part for the Live mode, by Verovio, and where its lines
// and its measures are once drawn. Verovio is one large program, loaded only
// here, the first time a score is drawn.

/** One line of the drawing: where it is, and the written measures it holds. */
export type Line = { top: number; height: number; measures: number[] };
/** Where a written measure is drawn, in pixels from the top left of the drawing. */
export type Box = {
  line: number;
  left: number;
  right: number;
  /** Where its notes and rests start, in quarter notes from the measure, and where they are drawn. */
  onsets: Onset[];
};
export type Onset = { quarters: number; x: number };
type Timemap = ReturnType<
  InstanceType<typeof import('verovio/esm').VerovioToolkit>['renderToTimemap']
>;
export type Drawn = { lines: Line[]; boxes: (Box | null)[] };

// How large the score is drawn at 100 %, in the unit of Verovio: the size
// a phone has always had.
export const SCALE = 45;
// From the tablet, one column at the width of the pane, never wider than this.
export const MAX_COLUMN = 1232;

type Toolkit = InstanceType<typeof import('verovio/esm').VerovioToolkit>;
let verovio: Promise<() => Toolkit> | null = null;
function newToolkit(): Promise<Toolkit> {
  verovio ??= Promise.all([import('verovio/wasm'), import('verovio/esm')]).then(
    async ([{ default: createVerovioModule }, { VerovioToolkit }]) => {
      const module = await createVerovioModule();
      return () => new VerovioToolkit(module);
    },
  );
  // A failure is not kept: the next opening tries again.
  verovio.catch(() => {
    verovio = null;
  });
  return verovio.then((create) => create());
}

type Layout = {
  /** The width the lines take, in pixels. */
  width: number;
  /** In the unit of Verovio: SCALE times the size chosen, and 1.5 more in landscape. */
  scale: number;
  /** One line for the whole part, scrolled sideways (a phone in landscape). */
  isRibbon: boolean;
};

/**
 * Where a share of a measure is drawn: between the notes that start around it,
 * so that what crosses the measure is on the note being played, the space of a
 * clef or of a long note included. Without notes known, evenly.
 */
export function xAt(box: Box, fraction: number, quarters: number): number {
  const at = fraction * quarters;
  const first = box.onsets[0];
  const points = [
    ...(first && first.quarters <= 0 ? [] : [{ quarters: 0, x: box.left }]),
    ...box.onsets,
    { quarters, x: box.right },
  ];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to || at > to.quarters) continue;
    const span = to.quarters - from.quarters;
    return span > 0 ? from.x + ((to.x - from.x) * (at - from.quarters)) / span : to.x;
  }
  return box.right;
}

/**
 * Draws a part (its MusicXML alone) into the sheet, and says where its lines
 * and measures are. Null when it cannot be drawn whole.
 */
export async function drawPart(
  sheet: HTMLElement,
  part: string,
  { width, scale, isRibbon }: Layout,
  measureCount: number,
): Promise<Drawn | null> {
  const toolkit = await newToolkit();
  let svg = '';
  let timemap: Timemap = [];
  try {
    toolkit.setOptions({
      // A score and nothing else: Verovio reads other formats too.
      inputFrom: 'musicxml',
      scale,
      // The ribbon is one system as long as the part; the page is then cut to it.
      pageWidth: isRibbon ? 100000 : Math.round((width * 100) / scale),
      adjustPageWidth: isRibbon,
      // One page as tall as the score: the screen does the scrolling.
      pageHeight: 60000,
      adjustPageHeight: true,
      breaks: isRibbon ? 'none' : 'auto',
      header: 'none',
      footer: 'none',
      pageMarginTop: 60,
      pageMarginBottom: 60,
      pageMarginLeft: 60,
      pageMarginRight: 30,
      spacingSystem: 4,
      spacingStaff: 4,
      justifyVertically: false,
      // The number of every measure, as on the screens of Figma.
      mnumInterval: 1,
    });
    // A score too long for one page would be cut: said, not shown in part.
    if (toolkit.loadData(part) && toolkit.getPageCount() === 1) {
      svg = toolkit.renderToSVG(1);
      timemap = toolkit.renderToTimemap({ includeMeasures: true, includeRests: true });
    }
  } finally {
    toolkit.destroy();
  }
  if (svg === '') return null;
  sheet.replaceChildren(safeDrawing(svg));
  if (!isRibbon) keepMarksInside(sheet);
  return geometryOf(sheet, measureCount, onsetsOf(timemap));
}

/**
 * When each note and rest of a drawn measure starts, in quarter notes from the
 * start of the measure, by the identifier of the measure in the drawing. A
 * measure played twice (a repeat) keeps its first pass.
 */
function onsetsOf(timemap: Timemap): Map<string, { quarters: number; ids: string[] }[]> {
  const found = new Map<string, { quarters: number; ids: string[] }[]>();
  let measure: { id: string; from: number } | null = null;
  for (const moment of timemap) {
    if (moment.measureOn) {
      measure = found.has(moment.measureOn) ? null : { id: moment.measureOn, from: moment.qstamp };
      if (measure) found.set(measure.id, []);
    }
    const ids = [...(moment.on ?? []), ...(moment.restsOn ?? [])];
    if (measure && ids.length > 0) {
      found.get(measure.id)?.push({ quarters: moment.qstamp - measure.from, ids });
    }
  }
  return found;
}

/** Where the lines and the measures of the drawing are, relative to the drawing. */
function geometryOf(
  sheet: HTMLElement,
  measureCount: number,
  onsets: Map<string, { quarters: number; ids: string[] }[]>,
): Drawn {
  const base = sheet.getBoundingClientRect();
  const systems = [...sheet.querySelectorAll<SVGGraphicsElement>('g.system')];
  const drawn = sheet.querySelectorAll('g.measure').length;
  // Should the drawing hold another number of measures than the score, each
  // drawn measure stands for its share of them.
  const writtenOf = (rank: number) =>
    drawn === measureCount ? rank : Math.round((rank * measureCount) / Math.max(1, drawn));

  const lines: Line[] = [];
  const boxes: (Box | null)[] = Array.from({ length: measureCount }, () => null);
  let rank = 0;
  systems.forEach((system, line) => {
    const box = system.getBoundingClientRect();
    const held: number[] = [];
    for (const measure of system.querySelectorAll<SVGGraphicsElement>('g.measure')) {
      const written = writtenOf(rank);
      rank += 1;
      const area = measure.getBoundingClientRect();
      if (written < measureCount) {
        held.push(written);
        boxes[written] = {
          line,
          left: area.left - base.left,
          right: area.right - base.left,
          onsets: (onsets.get(measure.id) ?? []).flatMap(({ quarters, ids }) => {
            // The left of the head of a note, or of a rest; of a chord, its leftmost.
            const lefts = ids.flatMap((id) => {
              const drawn = measure.querySelector(`[id="${CSS.escape(id)}"]`);
              const head = drawn?.querySelector('.notehead') ?? drawn;
              const left = head?.getBoundingClientRect().left;
              return left === undefined ? [] : [left - base.left];
            });
            return lefts.length > 0 ? [{ quarters, x: Math.min(...lefts) }] : [];
          }),
        };
      }
    }
    lines.push({ top: box.top - base.top, height: box.height, measures: held });
  });
  // A measure the drawing left out takes the place of the one before it.
  for (let written = 1; written < measureCount; written++) {
    boxes[written] ??= boxes[written - 1] ?? null;
  }
  return { lines, boxes };
}

// What a drawing of a score is made of. Anything else has no place in it.
const DRAWN = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'path',
  'rect',
  'ellipse',
  'circle',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
]);
const DRAWN_ATTRIBUTES = new Set([
  'id',
  'class',
  'd',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'dx',
  'dy',
  'width',
  'height',
  'points',
  'transform',
  'viewBox',
  'overflow',
  'version',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'opacity',
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'text-anchor',
  'text-decoration',
  'xml:space',
  'data-id',
]);

/**
 * The drawing of Verovio as elements of the page. It is built from a file a
 * member sent, so nothing is trusted: only the shapes and the texts of a
 * drawing are kept, with the attributes that draw them. No style, no link out
 * of the drawing, nothing that runs.
 */
function safeDrawing(svg: string): Node {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const SVG = 'http://www.w3.org/2000/svg';
  for (const element of [...parsed.querySelectorAll('*')]) {
    if (element.namespaceURI !== SVG || !DRAWN.has(element.localName)) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const isOwnLink =
        (attribute.name === 'href' || attribute.name === 'xlink:href') &&
        element.localName === 'use' &&
        attribute.value.startsWith('#');
      if (!isOwnLink && !DRAWN_ATTRIBUTES.has(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return document.importNode(parsed.documentElement, true);
}

// A rehearsal mark is centred on the start of its measure: at the start or
// at the end of a line it would be cut by the edge of the screen. It is moved
// just enough to be read whole.
function keepMarksInside(sheet: HTMLElement) {
  const edge = (sheet.querySelector('svg') ?? sheet).getBoundingClientRect();
  const margin = 8;
  for (const mark of sheet.querySelectorAll<SVGGraphicsElement>('g.reh')) {
    const box = mark.getBoundingClientRect();
    const drawn = mark.getBBox();
    if (box.width === 0 || drawn.width === 0) continue;
    const overLeft = edge.left + margin - box.left;
    const overRight = box.right - (edge.right - margin);
    const move = overLeft > 0 ? overLeft : overRight > 0 ? -overRight : 0;
    // From pixels of the screen to the units the drawing is written in.
    if (move !== 0) {
      mark.setAttribute('transform', `translate(${(move * drawn.width) / box.width}, 0)`);
    }
  }
}
