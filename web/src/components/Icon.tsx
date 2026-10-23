import { type IconDrawing, iconPaths } from './iconPaths.ts';
import './Icon.css';

// The icons of the design system (Figma: Icon/<Name>), as they are drawn
// there: a 24 by 24 grid and two styles. Outline is a line of 1.5 with round
// ends, Filled is a solid shape. Both take the colour of the text around them.
//
// The drawings are in iconPaths.ts. They come from Iconsax (https://iconsax.io,
// by Vuesax): the Linear set for Outline, the Bold set for Filled. Close,
// Accessibility, Contrast, Biceps, Check, DragHandle, Parasol and PartyPopper were
// drawn for this app in the same style.
//
// Licence notice. The Iconsax free licence allows these icons to be used
// integrated in the source code of a product, as here, provided this notice
// stays with them. It does not allow redistributing them as loose files or as
// an icon set: do not extract them from this app to publish them on their own.
//
// Adding an icon: add it in Figma first (from Iconsax when it has it), with
// its two styles, then generate its paths from Figma into iconPaths.ts.
// Section pictograms are another family: see Pictogram.tsx.
export type IconName = keyof typeof iconPaths;

type Props = {
  name: IconName;
  /** Figma draws icons at 24 (the default), 20 inside small buttons and messages, 16 beside a caption. */
  size?: 24 | 20 | 16 | 32;
  /** Figma: Style=Filled. The solid drawing, for the current entry of the navigation or a state that is on. */
  filled?: boolean;
};

// An icon is decoration: what it means is always said in words next to it, or
// in the accessible name of the button that holds it.
export function Icon({ name, size = 24, filled = false }: Props) {
  const drawing: IconDrawing = iconPaths[name][filled ? 'filled' : 'outline'];

  return (
    <svg className="Icon" data-size={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <IconShapes drawing={drawing} />
    </svg>
  );
}

// The paths of one drawing. Shared with Pictogram, whose generic pictogram is
// an icon.
export function IconShapes({ drawing }: { drawing: IconDrawing }) {
  return (
    <>
      {drawing.fill?.map((d) => (
        <path key={`fill ${d}`} d={d} fill="currentColor" />
      ))}
      {drawing.stroke?.map((d) => (
        <path
          key={`stroke ${d}`}
          d={d}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </>
  );
}
