// Small synthesised sound effects (no audio files to download). Audio starts
// only after the player's first tap, as browsers require, and the player can
// turn it off; the choice is remembered on this device.
const KEY = 'sellio-world-sound';

export function createSfx() {
  let ctx = null, master = null;
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* storage unavailable */ }

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch { return null; }
      master = ctx.createGain(); master.gain.value = 0.32; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, at, dur, { type = 'sine', gain = 0.35, to = 0 } = {}) {
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  return {
    warm: () => { ensure(); },
    coin(value = 1) {
      const lift = 1 + (value - 1) * 0.06;
      tone(987.77 * lift, 0, 0.09, { type: 'square', gain: 0.12 });
      tone(1318.5 * lift, 0.07, 0.28, { type: 'square', gain: 0.12 });
      if (value >= 4) tone(1975.5 * lift, 0.16, 0.3, { gain: 0.16 });
    },
    visit() { [659.25, 830.61, 987.77].forEach((f, i) => tone(f, i * 0.07, 0.4, { gain: 0.18 })); },
    unlock() { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i * 0.08, 0.45, { type: 'triangle', gain: 0.22 })); },
    reward() { [783.99, 987.77, 1174.66].forEach((f, i) => tone(f, i * 0.06, 0.35, { type: 'triangle', gain: 0.2 })); },
    tap() { tone(520, 0, 0.05, { type: 'triangle', gain: 0.08 }); },
    hop() { tone(330, 0, 0.32, { type: 'sine', gain: 0.18, to: 1320 }); tone(660, 0.28, 0.3, { type: 'triangle', gain: 0.12, to: 990 }); },
    nope() { tone(220, 0, 0.18, { type: 'triangle', gain: 0.14, to: 160 }); },
    get enabled() { return enabled; },
    setEnabled(on) {
      enabled = !!on;
      try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* storage unavailable */ }
      if (!enabled && ctx) ctx.suspend().catch(() => {});
      if (enabled) ensure();
    },
    dispose() { try { ctx?.close(); } catch { /* already closed */ } ctx = null; },
  };
}
