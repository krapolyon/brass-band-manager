import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AccessibilityOptions as Options } from '../../appearance.ts';
import { AccessibilityOptions } from '../../components/AccessibilityOptions.tsx';
import { Button } from '../../components/Button.tsx';
import { Panel } from '../../components/Panel.tsx';
import { setDeviceAccessibility, useAccessibilityBeforeSignIn } from '../../deviceAccessibility.ts';

type Props = {
  /** During an invitation: the options are those of the account being completed, not of the device. */
  account?: { value: Options; onChange: (value: Options) => void };
};

// The button "Accessibilité" of every screen shown before sign-in
// (model/members.md, "Accessibility before sign-in"): always visible,
// reachable from the keyboard, never a step to go through. It opens the six
// options, which apply at once.
export function AccessibilityButton({ account }: Props) {
  const { t } = useTranslation();
  const [isOpen, setOpen] = useState(false);
  const device = useAccessibilityBeforeSignIn();

  return (
    <>
      <Button kind="secondary" size="small" icon="Accessibility" onClick={() => setOpen(true)}>
        {t('accessibility.title')}
      </Button>
      <Panel open={isOpen} onClose={() => setOpen(false)} title={t('accessibility.title')}>
        <p className="AccessibilityButton-note textBody">
          {t(account ? 'accessibility.forAccount' : 'accessibility.forDevice')}
        </p>
        <AccessibilityOptions
          value={account?.value ?? device}
          onChange={account?.onChange ?? setDeviceAccessibility}
        />
      </Panel>
    </>
  );
}
