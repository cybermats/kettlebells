/**
 * Set-due chime — "beep, beep, boop" synthesised with the Web Audio API.
 *
 * No audio asset files (keeps the offline PWA payload tiny). Feature-detected
 * and guarded so it is a safe no-op in jsdom (tests) or unsupported browsers.
 *
 * Autoplay policy: an AudioContext starts suspended until a user gesture. We
 * create it lazily and resume() on play; because the first play only ever
 * happens after the user has tapped Start / a Done button, that gesture unlocks
 * the context.
 */

type AudioContextCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Schedule one sine tone at `freq` Hz starting at `startTime` for `durSec`. */
function tone(ac: AudioContext, freq: number, startTime: number, durSec: number): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  // Short attack + exponential decay so the tone doesn't click on/off.
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.3, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durSec);
  osc.connect(gain).connect(ac.destination);
  osc.start(startTime);
  osc.stop(startTime + durSec + 0.02);
}

/**
 * Prime the AudioContext from within a user-gesture handler (e.g. the Start
 * tap). iOS Safari (and Chrome's autoplay policy) will only let audio play if
 * the context was created/resumed inside a real user gesture; the later
 * `playSetDue()` fires from a timer, which does NOT count. Calling this on Start
 * unlocks the context so the set-due chime is audible on a phone at the gym.
 * Safe no-op when Web Audio is unavailable.
 */
export function unlockAudio(): void {
  const ac = getCtx();
  if (ac && ac.state === "suspended") {
    void ac.resume();
  }
}

/**
 * Play "beep, beep, boop" — two short high beeps then a lower, longer boop —
 * signalling that the next set is due. Safe no-op when Web Audio is
 * unavailable.
 */
export function playSetDue(): void {
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") {
    void ac.resume();
  }
  const t = ac.currentTime;
  tone(ac, 880, t, 0.09); // beep
  tone(ac, 880, t + 0.15, 0.09); // beep
  tone(ac, 520, t + 0.32, 0.16); // boop (lower, longer)
}
