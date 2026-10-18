import './DiscordMessageCard.css';

type Props = {
  /** Their name on Discord. */
  author: string;
  day: string;
  /** Four lines at most, then an ellipsis. */
  text: string;
  /** The message in Discord. */
  url: string;
};

// Figma: DiscordMessage/Card. A message of a Discord channel that tags the
// section of the member, read by the bot of the band. The whole card opens
// the message in Discord. Never stored: the server keeps what Discord said
// 10 minutes (model/songs.md, "Display").
export function DiscordMessageCard({ author, day, text, url }: Props) {
  return (
    <a className="DiscordMessageCard" href={url} target="_blank" rel="noopener noreferrer">
      <span className="DiscordMessageCard-top">
        <span className="textBodyStrong">{author}</span>
        <span className="DiscordMessageCard-day textCaption">{day}</span>
      </span>
      <span className="DiscordMessageCard-text textBody">{text}</span>
    </a>
  );
}
