/**
 * Procedural sound effects via Web Audio API.
 * No audio files — everything synthesized. Lazy AudioContext init.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise(duration: number, volume: number, decay: number) {
  const c = getCtx();
  const len = c.sampleRate * duration;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * volume;
  const src = c.createBufferSource();
  src.buffer = buf;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + decay);
  src.connect(gain).connect(c.destination);
  src.start();
}

function tone(freq: number, duration: number, volume: number, type: OscillatorType = 'sine') {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

/** Thumpy dice landing */
export function playDiceRoll() {
  noise(0.08, 0.15, 0.12);
  tone(80, 0.15, 0.2);
}

/** Percussive clack when capturing */
export function playCapture() {
  noise(0.03, 0.25, 0.05);
  tone(200, 0.06, 0.3);
}

/** Victory fanfare — ascending triad */
export function playVictory() {
  tone(523, 0.4, 0.12); // C5
  setTimeout(() => tone(659, 0.4, 0.12), 120); // E5
  setTimeout(() => tone(784, 0.6, 0.15), 240); // G5
  setTimeout(() => tone(1047, 0.8, 0.1), 400); // C6
}

/** Defeat — descending minor */
export function playDefeat() {
  tone(440, 0.3, 0.08); // A4
  setTimeout(() => tone(349, 0.4, 0.08), 200); // F4
  setTimeout(() => tone(294, 0.5, 0.06), 400); // D4
}

/** Rising chime for jail escape */
export function playJailEscape() {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(800, c.currentTime + 0.25);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.15, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.35);
  // Harmonic fifth
  tone(600, 0.3, 0.08);
}
