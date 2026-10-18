let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(next: boolean) {
  enabled = next;
}

function context(): AudioContext | null {
  if (!enabled || typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Short original tones — not sampled from another chess app. */
export function playTone(kind: "move" | "capture" | "check" | "done" | "fail") {
  const audio = context();
  if (!audio) return;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const freq = kind === "move" ? 520 : kind === "capture" ? 180 : kind === "check" ? 740 : kind === "done" ? 880 : 140;
  osc.type = kind === "capture" ? "triangle" : "sine";
  osc.frequency.setValueAtTime(freq, now);
  if (kind === "done") osc.frequency.exponentialRampToValueAtTime(1320, now + 0.18);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "done" ? 0.28 : 0.09));
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}
