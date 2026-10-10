import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { IconButton } from '../../components/IconButton.tsx';
import { StepIndicator } from '../../components/StepIndicator.tsx';

const STEPS = 3;

type Props = {
  step: 1 | 2 | 3;
  /** The address of the screen before this one. */
  back: string;
};

// The nav of a step of the install: the way back, and where the member is.
export function StepNav({ step, back }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <>
      <IconButton
        kind="glass"
        icon="ChevronLeft"
        label={t('common.back')}
        onClick={() => navigate(back)}
      />
      <StepIndicator step={step} of={STEPS} label={t('install.step', { step, count: STEPS })} />
    </>
  );
}
