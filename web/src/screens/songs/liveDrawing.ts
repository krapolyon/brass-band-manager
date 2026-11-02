// The drawing of one part for the Live mode, by Verovio, and where its lines
// and its measures are once drawn. Verovio is one large program, loaded only
// here, the first time a score is drawn.

/** One line of the drawing: where it is, and the written measures it holds. */
export type Line = { top: number; height: number; measures: number[] };
/** Where a written measure is drawn, in pixels from the top left of the drawing. */
export type Box = { line: number; left: number; right: number };
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
    }
  } finally {
    toolkit.destroy();
  }
  if (svg === '') return null;
  sheet.replaceChildren(safeDrawing(svg));
  if (!isRibbon) keepMarksInside(sheet);
  return geometryOf(sheet, measureCount);
}

/** Where the lines and the measures of the drawing are, relative to the drawing. */
function geometryOf(sheet: HTMLElement, measureCount: number): Drawn {
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
        boxes[written] = { line, left: area.left - base.left, right: area.right - base.left };
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
