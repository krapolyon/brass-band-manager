// A field whose suggestions show under it, on a phone: once the keyboard is
// up, the field is scrolled to the top of what is still visible, so that the
// suggestions show between the field and the keyboard (issue #19).
//
// What is visible is the visual viewport: the part of the page the keyboard
// leaves. Its height is only known once the keyboard is up, which is why the
// field is placed again each time that height changes while it has the focus.
// No fixed offset: keyboards differ, and so do phones.

/** The room kept above the field, so that its label stays in sight. */
const MARGIN = 16;

/** The room is taken back a moment after the field loses the focus: the
 *  press that took the focus away ends first, on what was under the finger. */
const RELEASE_DELAY = 400;
let pendingRelease: number | undefined;

/** True on a device driven by touch, where a keyboard covers the screen. */
export function hasTouchKeyboard(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Called when the field takes the focus. Returns what to call when it loses
 * it. `room` is given the height to keep free under the field, so that a
 * short page can still be scrolled that far.
 */
export function keepAboveKeyboard(field: HTMLElement, room: (height: number) => void): () => void {
  const view = window.visualViewport;
  if (!view || !hasTouchKeyboard()) return () => {};
  // A field that takes the focus back keeps the room it had.
  window.clearTimeout(pendingRelease);

  const place = () => {
    // Enough page under the field for it to reach the top of the view.
    room(view.height);
    requestAnimationFrame(() => {
      // Where the field is, counted from the top of what is visible.
      const top = field.getBoundingClientRect().top - view.offsetTop;
      // Instant: no movement for whoever asked for reduced motion, and none
      // to fight with the one of the keyboard.
      window.scrollBy({ top: top - MARGIN, behavior: 'instant' });
    });
  };

  place();
  view.addEventListener('resize', place);
  return () => {
    view.removeEventListener('resize', place);
    window.clearTimeout(pendingRelease);
    pendingRelease = window.setTimeout(() => room(0), RELEASE_DELAY);
  };
}
