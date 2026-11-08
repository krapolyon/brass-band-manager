import { Soundfont } from 'smplr';
import { type MidiSong, type MidiTrack, secondsAt, tickAt } from './midi.ts';

// Plays a MIDI file: each track with recorded notes of its instrument
// (smplr), through a volume of its own, so that a track can be cut while the
// song goes on.
//
// The samples are files of the app (web/public/soundfonts/), never fetched
// from another site. They cover the instruments of a brass band; any other
// sound of the file is played with the nearest of them.

const SAMPLES = '/soundfonts/FluidR3_GM';

// iPhone (issue #22). A sound of the Web Audio API belongs to the "ambient"
// category of iOS: it is silenced by the silent switch, and after the app was
// left alone iOS may leave its clock "interrupted", a state that resume() does
// not always end. A recording or a clip, played by an <audio> or <video>
// element, belongs to "playback", which is why playing one first brought the
// MIDI file back. So, from the press on "Lire":
//   - the category is asked for (navigator.audioSession, Safari 16.4 on);
//   - on an older iPhone, a silent <audio> plays once, which does the same;
//   - a clock that iOS left "interrupted" is replaced by a new one, with the
//     same instruments (their files come from the cache).
//
// A computer (issue #70). The clock is made at the first press, inside the
// gesture of the member, and resume() is waited for as long as the device
// takes: a Bluetooth headset, Windows or Safari may need more than a second.
// Until 1.1.0 the clock was made when the mode opened, given half a second,
// then replaced by one made after a wait, outside the gesture, which Safari
// keeps silent. A clock that has not started after WAKE_MS is said as such
// (ClockError), never as a failure of the network.

/** How long a clock is given to start before the member is told it does not. */
const WAKE_MS = 8000;

/** The sound of the device does not start: not a matter of network. */
export class ClockError extends Error {}

type AudioSession = { type: string };

/** Half a second of silence, as a WAV file: what an <audio> element plays to unlock the sound. */
function silence(): string {
  const samples = 4000;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i);
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true); // samples per second
  view.setUint32(28, 8000, true); // bytes per second
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true); // 8 bits: 128 is silence
  text(36, 'data');
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

let unlocker: HTMLAudioElement | null = null;

/** An iPhone or an iPad (which says it is a Mac, with a touch screen). */
const isAppleMobile = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** Asks iOS to treat the sound of the app as music. Called from the press of the member. */
function unlockSound(): void {
  const session = (navigator as Navigator & { audioSession?: AudioSession }).audioSession;
  if (session) {
    session.type = 'playback';
    return;
  }
  // Elsewhere a media element is not needed, and on Android it would take
  // the sound from other apps.
  if (!isAppleMobile()) return;
  unlocker ??= new Audio(silence());
  unlocker.play().catch(() => {
    // Not needed elsewhere than on an older iPhone; refused there, nothing better to do.
  });
}

/** The samples a track is played with. */
function samplesOf(track: MidiTrack): string {
  if (track.isDrums) return 'percussion';
  const sound = track.program;
  if (sound === 57) return 'trombone';
  if (sound === 58) return 'tuba';
  if (sound === 60) return 'french_horn';
  if (sound >= 56 && sound <= 63) return 'trumpet';
  if (sound === 66) return 'tenor_sax';
  if (sound === 67) return 'baritone_sax';
  if (sound === 64 || sound === 65) return 'alto_sax';
  if (sound >= 68 && sound <= 71) return 'clarinet';
  if (sound >= 72 && sound <= 79) return 'flute';
  // Not an instrument of a brass band: the brass that plays in its range.
  const middle = (track.lowest + track.highest) / 2;
  return middle < 50 ? 'tuba' : middle < 62 ? 'trombone' : 'trumpet';
}

type Voice = {
  track: MidiTrack;
  volume: GainNode;
  instrument: ReturnType<typeof Soundfont>;
  /** The next note to hand to the audio clock. */
  next: number;
};

// A stretch of playing: from this tick, started at this time of the audio clock.
type Stretch = { tick: number; time: number };

export type Loop = { start: number; end: number };

// Notes are handed to the audio clock a little ahead of time, a few at a
// time: late enough to follow a change of tempo, early enough never to be late.
const AHEAD_SECONDS = 0.2;
const EVERY_MS = 40;
// What is drawn follows the heard time smoothly (heardPosition): a gap up to
// this is drawn nearer by this share at each frame; a larger one is taken at once.
const SMOOTH_GAP_SECONDS = 0.15;
const SMOOTH_SHARE = 0.1;
const FADE_SECONDS = 0.03;

export class MidiEngine {
  // Made at the first press on play (see above); null until then.
  private context: AudioContext | null = null;
  private voices: Voice[] = [];
  private readonly end: number;
  private stretches: Stretch[] = [];
  private timer: number | null = null;
  private pausedAt = 0;
  // The time heard at the last frame, and when, to smooth what is drawn.
  private lastHeard: { time: number; at: number } | null = null;
  private speed = 1;
  private loop: Loop | null = null;
  private mutedVolume = 0;
  private readonly muted: boolean[];
  // The member asked to play, and the sounds are not there yet.
  private wanted = false;
  private disposed = false;
  // Resolves once every instrument has its samples; they load from the first press.
  private loaded: Promise<void> = Promise.resolve();
  /** Told when the samples start loading, and when they are there or failed. */
  onSounds: (state: 'loading' | 'ready' | 'failed') => void = () => {};
  /** Called when the song reaches its end. */
  onEnd: () => void = () => {};
  /** Called when the player stops by itself because the page was hidden (leave()). */
  onStop: () => void = () => {};

  constructor(private readonly song: MidiSong) {
    this.end = song.measures[song.measures.length - 1] ?? 0;
    this.muted = song.tracks.map(() => false);
    document.addEventListener('visibilitychange', this.leave);
  }

  /**
   * A phone that locks, or an app left, playing or not (1.1.0): the device
   * suspends the clock, and on return an iPhone may keep it "running" while
   * its time no longer moves, with no sound and no error. So the player
   * pauses where the song is heard and lets go of its clock; the next press
   * on "Lire" makes a new one, inside the gesture, with the same instruments
   * (their files come from the cache).
   */
  private leave = (): void => {
    if (document.visibilityState !== 'hidden' || this.disposed) return;
    const wasPlaying = this.isPlaying || this.wanted;
    this.pause();
    for (const voice of this.voices) voice.instrument.dispose();
    this.voices = [];
    void this.context?.close().catch(() => {});
    this.context = null;
    this.loaded = Promise.resolve();
    if (wasPlaying) this.onStop();
  };

  /** The clock and its instruments, made at the first press. */
  private clock(): AudioContext {
    if (this.context) return this.context;
    this.context = new AudioContext();
    this.voices = this.voicesOn(this.context);
    this.loaded = this.loadingOf(this.voices);
    return this.context;
  }

  /** The instruments of the tracks, on a clock. */
  private voicesOn(context: AudioContext): Voice[] {
    return this.song.tracks.map((track, index) => {
      const volume = context.createGain();
      volume.gain.value = this.muted[index] ? this.mutedVolume : 1;
      volume.connect(context.destination);
      const instrument = Soundfont(context, {
        instrumentUrl: `${SAMPLES}/${samplesOf(track)}-mp3.js`,
        destination: volume,
        // Only the notes the track plays are decoded.
        notesToLoad: { notes: [...new Set(track.notes.map((note) => note.pitch))] },
      });
      return { track, volume, instrument, next: 0 };
    });
  }

  private loadingOf(voices: Voice[]): Promise<void> {
    this.onSounds('loading');
    const loading = Promise.all(voices.map((voice) => voice.instrument.load)).then(() => {});
    loading.then(
      () => !this.disposed && this.onSounds('ready'),
      () => !this.disposed && this.onSounds('failed'),
    );
    return loading;
  }

  // Read each time: the state changes while resume() is waited for. iOS adds
  // "interrupted" to the states the types know.
  private stateOf = (context: AudioContext): string => context.state;

  /** Makes the clock run, waiting as long as the device takes, up to WAKE_MS. */
  private async wake(context: AudioContext): Promise<void> {
    if (this.stateOf(context) === 'running') return;
    await Promise.race([
      context.resume().catch(() => {}),
      new Promise((resolve) => window.setTimeout(resolve, WAKE_MS)),
    ]);
  }

  /** A new clock, with the same instruments, in place of one iOS left interrupted. */
  private replaceClock(): AudioContext {
    for (const voice of this.voices) voice.instrument.dispose();
    void this.context?.close().catch(() => {});
    this.context = null;
    return this.clock();
  }

  /**
   * Makes the clock and starts the sound, from a gesture of the member,
   * before play() is called after a wait: the tempo tapped in the Live mode
   * starts the player on the next 1, outside the gesture (1.1.0).
   */
  prime(): void {
    if (this.disposed) return;
    unlockSound();
    void this.clock()
      .resume()
      .catch(() => {});
  }

  get isPlaying(): boolean {
    return this.timer !== null;
  }

  /** Where the song is, in ticks. */
  position(): number {
    if (!this.isPlaying || !this.context) return this.pausedAt;
    return this.tickAtTime(this.context.currentTime);
  }

  /**
   * Where the sound being heard is, for what is drawn (1.1.0): the audio clock
   * runs ahead of the speakers by the delay of the output (a few ms on a
   * computer, up to 300 on a Bluetooth headset), and moves by steps. The
   * browser says which time of the clock leaves the speakers at which instant
   * of the page: from there the time goes on smoothly.
   */
  heardPosition(): number {
    if (!this.isPlaying || !this.context) return this.pausedAt;
    const context = this.context;
    const stamp = context.getOutputTimestamp?.();
    const heard =
      stamp?.contextTime !== undefined && stamp.performanceTime
        ? stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000
        : context.currentTime - (context.outputLatency || context.baseLatency || 0);
    // Never ahead of the clock, which stops when the sound stalls.
    return this.tickAtTime(
      Math.min(context.currentTime, this.smoothed(Math.min(context.currentTime, heard))),
    );
  }

  /**
   * The time heard, without the steps of the audio clock and of the stamps
   * of the output, which move the score by small jumps (1.1.0): from one
   * frame to the next the time goes on by what the page measured, and draws
   * nearer to what the clock says by a small share. A gap larger than a few
   * frames (a seek, a stall) is taken as it is.
   */
  private smoothed(heard: number): number {
    const at = performance.now();
    const last = this.lastHeard;
    let time = heard;
    if (last) {
      const expected = last.time + (at - last.at) / 1000;
      const gap = heard - expected;
      if (Math.abs(gap) < SMOOTH_GAP_SECONDS) time = expected + gap * SMOOTH_SHARE;
    }
    this.lastHeard = { time, at };
    return time;
  }

  private tickAtTime(now: number): number {
    // The last stretch that has started: a loop is handed over ahead of time.
    let current = this.stretches[0];
    for (const stretch of this.stretches) {
      if (stretch.time <= now) current = stretch;
    }
    if (!current) return this.pausedAt;
    return Math.min(this.end, this.tickAfter(current, Math.max(0, now - current.time)));
  }

  private tickAfter(stretch: Stretch, seconds: number): number {
    return tickAt(this.song, secondsAt(this.song, stretch.tick) + seconds * this.speed);
  }

  private timeOf(stretch: Stretch, tick: number): number {
    return (
      stretch.time + (secondsAt(this.song, tick) - secondsAt(this.song, stretch.tick)) / this.speed
    );
  }

  async play(): Promise<void> {
    if (this.isPlaying || this.disposed) return;
    this.wanted = true;
    // A browser lets sound start only from a gesture of the member: this is
    // it. What needs the gesture is done before anything is waited for.
    unlockSound();
    let context = this.clock();
    await this.wake(context);
    // Meanwhile the member may have paused, or left: nothing to rebuild.
    if (!this.wanted || this.disposed) return;
    if (this.stateOf(context) === 'interrupted') {
      context = this.replaceClock();
      await this.wake(context);
      if (!this.wanted || this.disposed) return;
    }
    // Said as such, never left as a silent "playing".
    if (this.stateOf(context) !== 'running') {
      this.wanted = false;
      throw new ClockError('The sound of the device does not start');
    }
    await this.loaded;
    // Meanwhile the member may have paused, pressed again, or left.
    if (!this.wanted || this.disposed || this.isPlaying) return;
    this.wanted = false;
    if (this.pausedAt >= this.end) this.pausedAt = this.loop?.start ?? 0;
    this.startFrom(this.pausedAt);
  }

  pause(): void {
    this.wanted = false;
    if (!this.isPlaying) return;
    this.pausedAt = this.position();
    this.halt();
  }

  /** Moves to a tick, playing or not. */
  seek(tick: number): void {
    const to = Math.min(Math.max(0, tick), this.end);
    if (this.isPlaying) {
      this.halt();
      this.startFrom(to);
    } else {
      this.pausedAt = to;
    }
  }

  /** The speed against the tempo of the file: 1 is that tempo. */
  setSpeed(speed: number): void {
    if (speed === this.speed) return;
    const at = this.position();
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.halt();
    this.speed = speed;
    this.pausedAt = at;
    if (wasPlaying) this.startFrom(at);
  }

  /** Plays a range again and again, or stops doing so. */
  setLoop(loop: Loop | null): void {
    this.loop = loop && loop.end > loop.start ? loop : null;
    const at = this.position();
    if (!this.loop) {
      // What was handed over ahead of time belonged to the range: started again from here.
      if (this.isPlaying) this.seek(at);
      return;
    }
    if (at < this.loop.start || at >= this.loop.end) this.seek(this.loop.start);
    else if (this.isPlaying) this.seek(at);
  }

  setMuted(index: number, isMuted: boolean): void {
    this.muted[index] = isMuted;
    this.applyVolume(index);
  }

  /** How loud a cut track stays, from 0 to 1. */
  setMutedVolume(volume: number): void {
    this.mutedVolume = volume;
    this.voices.forEach((_, index) => {
      this.applyVolume(index);
    });
  }

  private applyVolume(index: number): void {
    const gain = this.voices[index]?.volume.gain;
    if (!gain || !this.context) return;
    const to = this.muted[index] ? this.mutedVolume : 1;
    gain.cancelScheduledValues(this.context.currentTime);
    gain.setTargetAtTime(to, this.context.currentTime, FADE_SECONDS);
  }

  private startFrom(tick: number): void {
    if (this.disposed || !this.context) return;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.stretches = [{ tick, time: this.context.currentTime + 0.05 }];
    this.lastHeard = null;
    for (const voice of this.voices) {
      voice.next = voice.track.notes.findIndex((note) => note.tick >= tick);
      if (voice.next === -1) voice.next = voice.track.notes.length;
    }
    this.timer = window.setInterval(() => this.handOver(), EVERY_MS);
    this.handOver();
  }

  private halt(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.stretches = [];
    this.lastHeard = null;
    for (const voice of this.voices) voice.instrument.stop();
  }

  // Hands to the audio clock the notes that start in the next moments.
  private handOver(): void {
    if (!this.context) return;
    const until = this.context.currentTime + AHEAD_SECONDS;

    for (let rounds = 0; rounds < 8; rounds++) {
      const stretch = this.stretches[this.stretches.length - 1];
      if (!stretch) return;
      const stop = this.loop ? this.loop.end : this.end;
      const upTo = Math.min(stop, this.tickAfter(stretch, Math.max(0, until - stretch.time)));

      for (const voice of this.voices) {
        const notes = voice.track.notes;
        while (voice.next < notes.length) {
          const note = notes[voice.next];
          if (!note || note.tick >= upTo) break;
          voice.next += 1;
          const time = this.timeOf(stretch, note.tick);
          const lasts = this.timeOf(stretch, Math.min(note.tick + note.ticks, stop)) - time;
          voice.instrument.start({
            note: note.pitch,
            velocity: note.velocity,
            time: Math.max(time, this.context.currentTime),
            // A drum rings as long as its sample does.
            duration: voice.track.isDrums ? null : Math.max(0.03, lasts),
          });
        }
      }

      if (upTo < stop) return;
      const reachedAt = this.timeOf(stretch, stop);
      if (!this.loop) {
        // The end of the song: said once the last note has had its time.
        if (this.context.currentTime >= reachedAt) {
          this.halt();
          this.pausedAt = this.end;
          this.onEnd();
        }
        return;
      }
      // The end of the range: the next stretch starts at its beginning.
      const again = { tick: this.loop.start, time: reachedAt };
      this.stretches = [...this.stretches.slice(-1), again];
      for (const voice of this.voices) {
        voice.next = voice.track.notes.findIndex((note) => note.tick >= again.tick);
        if (voice.next === -1) voice.next = voice.track.notes.length;
      }
    }
  }

  /** Stops everything and gives the sound back to the device. */
  dispose(): void {
    document.removeEventListener('visibilitychange', this.leave);
    this.disposed = true;
    this.wanted = false;
    this.halt();
    for (const voice of this.voices) voice.instrument.dispose();
    void this.context?.close().catch(() => {});
  }
}
