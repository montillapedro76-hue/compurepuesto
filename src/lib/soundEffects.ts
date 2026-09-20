// Web Audio API Synthesizer for System Sound Effects

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }
    return sharedAudioCtx;
  } catch (e) {
    console.warn("AudioContext not supported or blocked by browser gesture:", e);
    return null;
  }
}

/**
 * Plays a realistic Cash Register / "Cha-Ching" sound effect
 */
export function playCashRegisterSound(): void {
  const isEnabled = localStorage.getItem('copias_bellavista_sound_on_sale');
  if (isEnabled === 'false') return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // 1. Mechanical Latch/Drawer Slide Click (Noise burst)
  try {
    const bufferSize = ctx.sampleRate * 0.05; // 50ms noise
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(2500, now);
    noiseFilter.Q.setValueAtTime(3, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(now);
  } catch (e) {
    console.warn("Noise buffer error:", e);
  }

  // 2. Multi-Tone Metallic Bell Chime (Caja Registradora "Cha-Ching!")
  // Notes: G6 (1568 Hz), B6 (1975 Hz), E7 (2637 Hz), F#7 (2960 Hz)
  const bellNotes = [
    { freq: 1567.98, delay: 0.02, duration: 0.35, gain: 0.3 },
    { freq: 1975.53, delay: 0.05, duration: 0.45, gain: 0.35 },
    { freq: 2637.02, delay: 0.09, duration: 0.6, gain: 0.4 },
    { freq: 3135.96, delay: 0.12, duration: 0.5, gain: 0.25 }
  ];

  bellNotes.forEach(note => {
    const startTime = now + note.delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Triangle waveform gives a warm metallic bell timbre
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(note.freq, startTime);

    // Envelope: sharp attack, exponential ring decay
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(note.gain, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + note.duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + note.duration + 0.05);
  });

  // 3. High-frequency Coin Clink / Ring (Silver tone)
  const coinOsc = ctx.createOscillator();
  const coinGain = ctx.createGain();
  const coinStartTime = now + 0.11;

  coinOsc.type = 'sine';
  coinOsc.frequency.setValueAtTime(4186, coinStartTime); // C8
  coinOsc.frequency.exponentialRampToValueAtTime(3520, coinStartTime + 0.25); // A7

  coinGain.gain.setValueAtTime(0.001, coinStartTime);
  coinGain.gain.linearRampToValueAtTime(0.2, coinStartTime + 0.005);
  coinGain.gain.exponentialRampToValueAtTime(0.0001, coinStartTime + 0.3);

  coinOsc.connect(coinGain);
  coinGain.connect(ctx.destination);

  coinOsc.start(coinStartTime);
  coinOsc.stop(coinStartTime + 0.35);
}

/**
 * Plays a Low Stock Warning "Beep" sound effect
 */
export function playLowStockBeep(): void {
  const isEnabled = localStorage.getItem('copias_bellavista_push_low_stock');
  if (isEnabled === 'false') return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Double warning beep (Beep-Beep!)
  const beeps = [
    { freq: 880, start: 0, duration: 0.12, gain: 0.35 },    // A5
    { freq: 1108.73, start: 0.16, duration: 0.18, gain: 0.4 } // C#6
  ];

  beeps.forEach(b => {
    const startTime = now + b.start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Square wave with low-pass filter gives a classic electronic POS alert beep
    osc.type = 'square';
    osc.frequency.setValueAtTime(b.freq, startTime);
    osc.frequency.exponentialRampToValueAtTime(b.freq * 0.9, startTime + b.duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(b.gain, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + b.duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + b.duration + 0.02);
  });
}
