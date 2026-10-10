import './Halo.css';

// Figma: Halo. The light at the top of a screen that has no artwork: three
// blurred colour fields (accent, haloCool, haloDeep) that fade into the ground.
// Placed at the top of its container, behind the content; the container must
// be `position: relative`.
//
// It is decoration: hidden from assistive technology, and removed by the high
// contrast option.
export function Halo() {
  return (
    <div className="Halo" aria-hidden="true">
      <span className="Halo-accent" />
      <span className="Halo-cool" />
      <span className="Halo-deep" />
      <span className="Halo-fade" />
    </div>
  );
}
