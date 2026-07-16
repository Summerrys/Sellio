// Generates short beep tones as real <audio>-playable WAV Blob URLs, entirely
// at runtime in JS (no embedded audio data to keep in sync or risk corrupting).
//
// This replaces the previous Web Audio API oscillator approach. That's a
// deliberate change: iOS/iPadOS Safari has repeatedly proven unreliable at
// keeping a raw AudioContext playable for sounds triggered from non-gesture
// contexts (a new order arriving via realtime, a timer-based repeat alert)
// even after several rounds of unlock/keep-alive/resume mitigations.
// <audio> elements have a more lenient, better-established autoplay story on
// iOS once played from a genuine gesture, which is the standard workaround
// pattern used by chat apps and other tools that need to play notification
// sounds later, unprompted.
function makeBeepDataUrl(freq, duration = 0.14, sampleRate = 8000, volume = 0.6) {
  const n = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    // Short attack, longer release so it doesn't click at the edges.
    const envelope = Math.min(1, i / (sampleRate * 0.01), (n - i) / (sampleRate * 0.05));
    const val = volume * envelope * Math.sin(2 * Math.PI * freq * t);
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, val * 32767)), true);
  }
  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

// Two-note chime for a new order — same rising feel as the previous oscillator
// version, just rendered as a real short WAV instead.
function makeTwoNoteChime(freq1, freq2) {
  return [makeBeepDataUrl(freq1), makeBeepDataUrl(freq2)];
}

let _newOrderUrls = null;
let _readyUrls = null;

export function getNewOrderChimeUrls() {
  if (!_newOrderUrls) _newOrderUrls = makeTwoNoteChime(440, 660);
  return _newOrderUrls;
}

export function getReadyChimeUrls() {
  if (!_readyUrls) _readyUrls = makeTwoNoteChime(880, 1320);
  return _readyUrls;
}
