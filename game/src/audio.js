// Procedural sound, one job: every sound the game makes, synthesized with WebAudio, no
// audio files and no network. The context starts on the first user gesture (the play click),
// so autoplay rules never bite; until then every call is a silent no-op.
let ctx = null;
let master = null;
let noiseBuffer = null;

function ensure() {
  if (ctx) return true;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  } catch {
    return false;
  }
  return true;
}

function burst({ duration, type = 'lowpass', frequency = 1200, gain = 0.5, when = 0 }) {
  if (!ensure() || ctx.state === 'suspended') return;
  const start = ctx.currentTime + when;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(gain, start);
  envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(filter).connect(envelope).connect(master);
  source.start(start);
  source.stop(start + duration + 0.02);
}

function tone({ frequency, duration, type = 'sine', gain = 0.3, slideTo = null, when = 0 }) {
  if (!ensure() || ctx.state === 'suspended') return;
  const start = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), start + duration);
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(gain, start);
  envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(envelope).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export const audio = {
  unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  },
  shot(weapon) {
    // A sharp crack: high noise burst plus a low thump. Rifles crack harder than pistols.
    const hard = weapon === 'rifle' || weapon === 'sniper' ? 0.65 : 0.45;
    burst({ duration: 0.09, frequency: 2600, gain: hard });
    burst({ duration: 0.16, type: 'lowpass', frequency: 320, gain: 0.5 });
  },
  enemyShot() {
    burst({ duration: 0.08, frequency: 1800, gain: 0.22 });
  },
  dryFire() {
    tone({ frequency: 1800, duration: 0.03, type: 'square', gain: 0.08 });
  },
  reload() {
    tone({ frequency: 900, duration: 0.04, type: 'square', gain: 0.1 });
    tone({ frequency: 620, duration: 0.04, type: 'square', gain: 0.1, when: 0.28 });
    tone({ frequency: 1100, duration: 0.05, type: 'square', gain: 0.12, when: 0.62 });
  },
  hit() {
    tone({ frequency: 2400, duration: 0.05, type: 'square', gain: 0.14 });
  },
  kill() {
    tone({ frequency: 2400, duration: 0.05, type: 'square', gain: 0.14 });
    tone({ frequency: 3200, duration: 0.07, type: 'square', gain: 0.14, when: 0.07 });
  },
  hurt() {
    burst({ duration: 0.12, type: 'lowpass', frequency: 500, gain: 0.4 });
    tone({ frequency: 140, duration: 0.14, type: 'sawtooth', gain: 0.2, slideTo: 70 });
  },
  plantTick() {
    tone({ frequency: 1250, duration: 0.06, type: 'square', gain: 0.16 });
  },
  plantDone() {
    tone({ frequency: 880, duration: 0.12, type: 'square', gain: 0.18 });
    tone({ frequency: 1320, duration: 0.18, type: 'square', gain: 0.18, when: 0.12 });
  },
  defuseTick() {
    tone({ frequency: 980, duration: 0.05, type: 'square', gain: 0.12 });
  },
  explosion() {
    burst({ duration: 0.9, type: 'lowpass', frequency: 240, gain: 0.9 });
    burst({ duration: 0.4, frequency: 900, gain: 0.5 });
    tone({ frequency: 90, duration: 0.7, type: 'sine', gain: 0.6, slideTo: 32 });
  },
  buy() {
    tone({ frequency: 1560, duration: 0.06, type: 'sine', gain: 0.16 });
    tone({ frequency: 2080, duration: 0.08, type: 'sine', gain: 0.16, when: 0.06 });
  },
  denied() {
    tone({ frequency: 220, duration: 0.12, type: 'square', gain: 0.14 });
  },
  roundWin() {
    [523, 659, 784].forEach((frequency, i) => tone({ frequency, duration: 0.16, gain: 0.2, when: i * 0.11 }));
  },
  roundLose() {
    [392, 330, 262].forEach((frequency, i) => tone({ frequency, duration: 0.18, gain: 0.2, when: i * 0.12 }));
  },
  bounce() {
    tone({ frequency: 300, duration: 0.05, type: 'square', gain: 0.1 });
  },
};
