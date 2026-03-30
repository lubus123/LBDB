import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Web Audio API
// sounds.ts uses both tone() (oscillator + gain) and noise() (buffer source +
// gain), so we need mocks for all node types plus AudioContext itself.
//
// AudioContext must be a proper class (constructable with `new`) so vitest
// can stub it as a global and sounds.ts can call `new AudioContext()`.
// ---------------------------------------------------------------------------

// Shared spies so we can inspect calls after the fact.
let mockCreateOscillator: ReturnType<typeof vi.fn>;
let mockCreateGain: ReturnType<typeof vi.fn>;
let mockCreateBuffer: ReturnType<typeof vi.fn>;
let mockCreateBufferSource: ReturnType<typeof vi.fn>;

function makeMockAudioContextClass() {
  mockCreateOscillator = vi.fn(() => ({
    type: 'sine' as OscillatorType,
    frequency: {
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
    stop: vi.fn(),
    disconnect: vi.fn(),
  }));

  mockCreateGain = vi.fn(() => ({
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
  }));

  mockCreateBuffer = vi.fn(() => ({
    getChannelData: vi.fn(() => new Float32Array(1024)),
  }));

  mockCreateBufferSource = vi.fn(() => ({
    buffer: null,
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
    stop: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Use a proper class so `new AudioContext()` works.
  class MockAudioContext {
    currentTime = 0;
    sampleRate = 44100;
    destination = {};
    state: AudioContextState = 'running';
    resume = vi.fn();
    close = vi.fn();
    createOscillator = mockCreateOscillator;
    createGain = mockCreateGain;
    createBuffer = mockCreateBuffer;
    createBufferSource = mockCreateBufferSource;
  }

  return MockAudioContext;
}

// Install fresh mocks before every test.  We also call vi.resetModules() so
// the module-level `ctx` singleton in sounds.ts is reset between tests.
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();

  const MockAudioContext = makeMockAudioContextClass();
  vi.stubGlobal('AudioContext', MockAudioContext);
  vi.stubGlobal('webkitAudioContext', MockAudioContext);
});

// ---------------------------------------------------------------------------
// Dynamic import helper — must be called AFTER vi.resetModules() so each test
// gets a fresh module with a null `ctx` singleton.
// ---------------------------------------------------------------------------
async function importSounds() {
  return import('./sounds');
}

// ---------------------------------------------------------------------------
// Helper to get the AudioContext instance created during a sound call.
// ---------------------------------------------------------------------------
function getCtxInstance(): InstanceType<ReturnType<typeof makeMockAudioContextClass>> {
  // AudioContext has been replaced with our class; grab the first instance.
  const Ctor = AudioContext as unknown as { instances?: unknown[] };
  // Vitest tracks `new` calls on stubbed globals via mock.instances
  // on the constructor spy — but since we used stubGlobal with a class,
  // we access it via the spy wrapper installed by stubGlobal.
  // The simplest approach: return the object that owns our spies.
  return {
    createOscillator: mockCreateOscillator,
    createGain: mockCreateGain,
    createBuffer: mockCreateBuffer,
    createBufferSource: mockCreateBufferSource,
  } as unknown as ReturnType<typeof makeMockAudioContextClass>['prototype'];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('playDiceRoll', () => {
  it('does not throw', async () => {
    const { playDiceRoll } = await importSounds();
    expect(() => playDiceRoll()).not.toThrow();
  });

  it('creates at least one oscillator', async () => {
    const { playDiceRoll } = await importSounds();
    playDiceRoll();
    expect(mockCreateOscillator).toHaveBeenCalled();
  });

  it('creates at least one gain node', async () => {
    const { playDiceRoll } = await importSounds();
    playDiceRoll();
    expect(mockCreateGain).toHaveBeenCalled();
  });

  it('starts and schedules stop on the oscillator', async () => {
    const { playDiceRoll } = await importSounds();
    playDiceRoll();
    const osc = mockCreateOscillator.mock.results[0].value;
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
  });

  it('creates a noise buffer source for the thump', async () => {
    const { playDiceRoll } = await importSounds();
    playDiceRoll();
    expect(mockCreateBufferSource).toHaveBeenCalled();
    expect(mockCreateBuffer).toHaveBeenCalled();
  });
});

describe('playCapture', () => {
  it('does not throw', async () => {
    const { playCapture } = await importSounds();
    expect(() => playCapture()).not.toThrow();
  });

  it('creates at least one oscillator', async () => {
    const { playCapture } = await importSounds();
    playCapture();
    expect(mockCreateOscillator).toHaveBeenCalled();
  });

  it('creates at least one gain node', async () => {
    const { playCapture } = await importSounds();
    playCapture();
    expect(mockCreateGain).toHaveBeenCalled();
  });

  it('starts and schedules stop on the oscillator', async () => {
    const { playCapture } = await importSounds();
    playCapture();
    const osc = mockCreateOscillator.mock.results[0].value;
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
  });

  it('creates a noise buffer source for the clack', async () => {
    const { playCapture } = await importSounds();
    playCapture();
    expect(mockCreateBufferSource).toHaveBeenCalled();
  });
});

describe('playJailEscape', () => {
  it('does not throw', async () => {
    const { playJailEscape } = await importSounds();
    expect(() => playJailEscape()).not.toThrow();
  });

  it('creates at least one oscillator', async () => {
    const { playJailEscape } = await importSounds();
    playJailEscape();
    expect(mockCreateOscillator).toHaveBeenCalled();
  });

  it('creates at least one gain node', async () => {
    const { playJailEscape } = await importSounds();
    playJailEscape();
    expect(mockCreateGain).toHaveBeenCalled();
  });

  it('starts and schedules stop on the first oscillator', async () => {
    const { playJailEscape } = await importSounds();
    playJailEscape();
    const osc = mockCreateOscillator.mock.results[0].value;
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
  });

  it('sets the oscillator type to sine', async () => {
    const { playJailEscape } = await importSounds();
    playJailEscape();
    const osc = mockCreateOscillator.mock.results[0].value;
    expect(osc.type).toBe('sine');
  });

  it('applies frequency ramp for rising chime (400 → 800 Hz)', async () => {
    const { playJailEscape } = await importSounds();
    playJailEscape();
    const osc = mockCreateOscillator.mock.results[0].value;
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(400, 0);
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(800, 0.25);
  });

  it('creates a second oscillator for the harmonic fifth', async () => {
    const { playJailEscape } = await importSounds();
    playJailEscape();
    // playJailEscape() calls tone(600, …) after the main osc — two oscillators total.
    expect(mockCreateOscillator).toHaveBeenCalledTimes(2);
  });
});

describe('playVictory', () => {
  it('does not throw', async () => {
    const { playVictory } = await importSounds();
    expect(() => playVictory()).not.toThrow();
  });

  it('creates an oscillator for the first note synchronously', async () => {
    const { playVictory } = await importSounds();
    playVictory();
    // The first tone (C5, 523 Hz) is called synchronously.
    expect(mockCreateOscillator).toHaveBeenCalled();
  });

  it('creates a gain node for the first note synchronously', async () => {
    const { playVictory } = await importSounds();
    playVictory();
    expect(mockCreateGain).toHaveBeenCalled();
  });

  it('starts and schedules stop on the first oscillator', async () => {
    const { playVictory } = await importSounds();
    playVictory();
    const osc = mockCreateOscillator.mock.results[0].value;
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
  });

  it('uses the C5 frequency (523 Hz) for the first note', async () => {
    const { playVictory } = await importSounds();
    playVictory();
    const osc = mockCreateOscillator.mock.results[0].value;
    expect(osc.frequency.value).toBe(523);
  });
});

describe('playDefeat', () => {
  it('does not throw', async () => {
    const { playDefeat } = await importSounds();
    expect(() => playDefeat()).not.toThrow();
  });

  it('creates an oscillator for the first note synchronously', async () => {
    const { playDefeat } = await importSounds();
    playDefeat();
    expect(mockCreateOscillator).toHaveBeenCalled();
  });

  it('creates a gain node for the first note synchronously', async () => {
    const { playDefeat } = await importSounds();
    playDefeat();
    expect(mockCreateGain).toHaveBeenCalled();
  });

  it('starts and schedules stop on the first oscillator', async () => {
    const { playDefeat } = await importSounds();
    playDefeat();
    const osc = mockCreateOscillator.mock.results[0].value;
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
  });

  it('uses the A4 frequency (440 Hz) for the first (highest) note', async () => {
    const { playDefeat } = await importSounds();
    playDefeat();
    const osc = mockCreateOscillator.mock.results[0].value;
    expect(osc.frequency.value).toBe(440);
  });
});

describe('playTimeout', () => {
  it('does not throw', async () => {
    const { playTimeout } = await importSounds();
    expect(() => playTimeout()).not.toThrow();
  });

  it('creates at least one oscillator', async () => {
    const { playTimeout } = await importSounds();
    playTimeout();
    expect(mockCreateOscillator).toHaveBeenCalled();
  });

  it('creates at least one gain node', async () => {
    const { playTimeout } = await importSounds();
    playTimeout();
    expect(mockCreateGain).toHaveBeenCalled();
  });

  it('starts and schedules stop on the oscillator', async () => {
    const { playTimeout } = await importSounds();
    playTimeout();
    const osc = mockCreateOscillator.mock.results[0].value;
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
  });

  it('uses a low frequency (150 Hz) for the first buzz tone', async () => {
    const { playTimeout } = await importSounds();
    playTimeout();
    const osc = mockCreateOscillator.mock.results[0].value;
    expect(osc.frequency.value).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// AudioContext singleton — the module reuses a single context.
// ---------------------------------------------------------------------------

describe('AudioContext singleton', () => {
  it('reuses the same AudioContext instance across multiple sound calls', async () => {
    const { playDiceRoll, playCapture } = await importSounds();
    // Track how many times the constructor is called.
    let constructCount = 0;
    const OrigCtor = AudioContext;
    vi.stubGlobal(
      'AudioContext',
      class extends (OrigCtor as unknown as new () => object) {
        constructor() {
          super();
          constructCount++;
        }
      },
    );

    // Re-import so the fresh module uses our counting constructor.
    vi.resetModules();
    const { playDiceRoll: roll2, playCapture: cap2 } = await import('./sounds');
    roll2();
    cap2();

    // Only one AudioContext should have been instantiated.
    expect(constructCount).toBe(1);
  });
});
