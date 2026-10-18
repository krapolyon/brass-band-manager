import { useTranslation } from 'react-i18next';
import { FilterChip } from './FilterChip.tsx';
import './ChannelChoice.css';

export type Channels = { push: boolean; email: boolean };

type Props = {
  label: string;
  /** Figma: "Description" and "Show description". */
  description?: string;
  value: Channels;
  onChange: (value: Channels) => void;
  /** Figma: "Show email": off for the live setlist, and on an instance without a mail server. */
  showEmail?: boolean;
  /** A kind that cannot be off (the reminders to answer): the last chip on cannot be turned off. */
  neverOff?: boolean;
  /** The device does not receive: the push chip is kept as it is, and cannot change here. */
  pushDisabled?: boolean;
};

// Figma: ChannelChoice. One kind of notification and how it reaches the
// member: one chip per channel, Notification and E-mail, that wrap when the
// text grows (model/members.md, "Notification settings"). Both off: nothing
// is sent. E-mail is hidden where it cannot apply (the live setlist, a
// server without mail); push is shown disabled on a device that does not
// receive.
export function ChannelChoice({
  label,
  description,
  value,
  onChange,
  showEmail = true,
  neverOff = false,
  pushDisabled = false,
}: Props) {
  const { t } = useTranslation();
  const isLast = (channel: keyof Channels) =>
    neverOff && value[channel] && Object.entries(value).filter(([, on]) => on).length === 1;

  return (
    <fieldset className="ChannelChoice">
      <legend className="ChannelChoice-texts">
        <span className="textBodyStrong">{label}</span>
        {description && (
          <span className="ChannelChoice-description textCaption">{description}</span>
        )}
      </legend>
      <div className="ChannelChoice-channels">
        <FilterChip
          pressed={value.push}
          icon="Notification"
          disabled={pushDisabled}
          locked={isLast('push')}
          onChange={(push) => onChange({ ...value, push })}
        >
          {t('channelChoice.push')}
        </FilterChip>
        {showEmail && (
          <FilterChip
            pressed={value.email}
            icon="Mail"
            locked={isLast('email')}
            onChange={(email) => onChange({ ...value, email })}
          >
            {t('channelChoice.email')}
          </FilterChip>
        )}
      </div>
    </fieldset>
  );
}
