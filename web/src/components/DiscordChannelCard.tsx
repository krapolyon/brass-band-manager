import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon.tsx';
import './DiscordChannelCard.css';

type Props = {
  title: string;
  /** Figma: "Text" and "Show text". */
  text?: string;
  /** The link of the channel, which opens it in Discord. */
  url: string;
  /** Figma: the Messages slot and "Show messages": DiscordMessageCard, the latest first. */
  children?: ReactNode;
  /** 3 when the record is itself under a heading of level 2 (a split view). */
  headingLevel?: 2 | 3;
};

// Figma: DiscordChannel/Card. The Discord channel of a song or a gig, at the
// end of its sheet: what the channel says for the member, read when the sheet
// opens and never stored, then one button that opens the channel. A link of
// Discord, not a button: it opens the app of the phone when it has it.
export function DiscordChannelCard({ title, text, url, children, headingLevel = 2 }: Props) {
  const { t } = useTranslation();
  const Heading = `h${headingLevel}` as const;

  return (
    <section className="DiscordChannelCard">
      <Heading className="textHeading">{title}</Heading>
      {text && <p className="DiscordChannelCard-text textCaption">{text}</p>}
      {children && <div className="DiscordChannelCard-messages">{children}</div>}
      <a
        className="Button textButton"
        data-kind="secondary"
        data-size="large"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name="ExternalLink" size={20} />
        {t('discord.open')}
      </a>
    </section>
  );
}
