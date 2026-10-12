import { useTranslation } from 'react-i18next';
import { type AccessibilityOptions as Options, textSizes } from '../appearance.ts';
import { SliderRow } from './SliderRow.tsx';
import { SwitchRow } from './SwitchRow.tsx';
import './AccessibilityOptions.css';

type Props = {
  value: Options;
  /** Called at each change: an option applies at once, with no save button. */
  onChange: (value: Options) => void;
};

const switches = [
  ['hasHighContrast', 'highContrast'],
  ['hasIncreasedSpacing', 'increasedSpacing'],
  ['hasLegibleFont', 'legibleFont'],
  ['hasReducedMotion', 'reducedMotion'],
  ['hasExtendedTimeouts', 'extendedTimeouts'],
] as const;

// Figma: AccessibilityOptions. The six accessibility options of the
// dictionary (model/members.md), in its order: one form, used by the settings
// of a member and by the sheet shown before sign-in.
export function AccessibilityOptions({ value, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="AccessibilityOptions">
      <SliderRow
        label={t('accessibility.textSize.label')}
        value={t('accessibility.textSize.value', { percent: value.textSizePercent })}
        description={t('accessibility.textSize.description')}
        steps={textSizes.length}
        step={textSizes.indexOf(value.textSizePercent)}
        onChange={(step) => onChange({ ...value, textSizePercent: textSizes[step] ?? 100 })}
      />
      {switches.map(([field, key]) => (
        <SwitchRow
          key={field}
          label={t(`accessibility.${key}.label`)}
          description={t(`accessibility.${key}.description`)}
          checked={value[field]}
          onChange={(checked) => onChange({ ...value, [field]: checked })}
        />
      ))}
    </div>
  );
}
