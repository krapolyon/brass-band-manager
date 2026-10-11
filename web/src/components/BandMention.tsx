import { useBand } from '../band.ts';
import { Icon } from './Icon.tsx';
import './BandMention.css';

// Figma: Band/Mention. The band, named beside its logo; without a logo, a
// neutral mark. The name and the logo are what the app shows before sign-in.
export function BandMention() {
  const band = useBand().data;
  if (!band) return null;

  return (
    <div className="BandMention">
      <span className="BandMention-logo">
        {band.logoUrl ? <img src={band.logoUrl} alt="" /> : <Icon name="Music" />}
      </span>
      <span className="textHeading">{band.name}</span>
    </div>
  );
}
