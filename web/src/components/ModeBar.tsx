import { Icon, type IconName } from './Icon.tsx';
import './ModeBar.css';

export const songModes = ['mp3', 'midi', 'pdf', 'clip', 'live'] as const;
export type SongMode = (typeof songModes)[number];

// Figma: the icon of each mode, as the ModeBar names them.
const modeIcons: Record<SongMode, IconName> = {
  mp3: 'AudioLines',
  midi: 'Piano',
  pdf: 'FileText',
  clip: 'Clip',
  live: 'BookOpen',
};

type Props = {
  /** Figma: Current. */
  current: SongMode;
  onChange: (mode: SongMode) => void;
  labels: Record<SongMode, string>;
  /** What the group is, for screen readers. */
  label: string;
  /** Modes that are shown but cannot be opened. They keep the focus, so that their name can be read. */
  unavailable?: SongMode[];
};

// Figma: ModeBar. The five modes of a song, in glass, floating over the
// cover. The current mode is told by its filled icon and by the accent, and
// to screen readers by aria-current, as the tabs of the TabBar.
//
// In Figma every ModeBar is set to the Dark scheme, because it floats over
// the cover: the element carries data-scheme, which tokens.css reads.
export function ModeBar({ current, onChange, labels, label, unavailable = [] }: Props) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would bring a legend to draw; the group only needs its name
    <div className="ModeBar" role="group" aria-label={label} data-scheme="dark">
      {songModes.map((mode) => {
        const disabled = unavailable.includes(mode);

        return (
          <button
            key={mode}
            type="button"
            aria-current={mode === current ? 'true' : undefined}
            aria-disabled={disabled ? 'true' : undefined}
            onClick={() => {
              if (!disabled && mode !== current) onChange(mode);
            }}
          >
            <Icon name={modeIcons[mode]} filled={mode === current} />
            <span className="textMicro">{labels[mode]}</span>
          </button>
        );
      })}
    </div>
  );
}
