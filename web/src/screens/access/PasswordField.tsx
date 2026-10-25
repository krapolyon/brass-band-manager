import { type InputHTMLAttributes, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../../components/IconButton.tsx';
import { TextField } from '../../components/TextField.tsx';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  label: string;
  hint?: string;
  hintTone?: 'neutral' | 'success';
  error?: string;
};

// A TextField for a password: hidden, with the eye that shows it as its
// trailing icon (Figma: TextField, "Show trailing icon").
export function PasswordField(props: Props) {
  const { t } = useTranslation();
  const [isShown, setShown] = useState(false);

  return (
    <TextField
      type={isShown ? 'text' : 'password'}
      autoCapitalize="none"
      spellCheck={false}
      {...props}
      trailing={
        <IconButton
          icon={isShown ? 'EyeOff' : 'Eye'}
          label={t(isShown ? 'password.hide' : 'password.show')}
          tone="muted"
          aria-pressed={isShown}
          onClick={() => setShown(!isShown)}
        />
      }
    />
  );
}
