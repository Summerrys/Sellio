// A single reusable "ding" bell tone as a runtime-synthesized WAV Blob URL, in
// place of the multi-note chimes used before. Fundamental + a soft higher
// harmonic with a longer decay tail, closer to a real notification "ding"
// than a flat beep - matching the sound merchants are used to hearing when a
// normal order comes in.
//
// Played through a real <audio> element rather than the Web Audio API
// directly: iOS/iPadOS Safari has repeatedly proven unreliable at keeping a
// raw AudioContext playable for sounds triggered from non-gesture contexts (a
// new order arriving via realtime, a timer-based repeat alert). <audio>
// elements have a more lenient, better-established autoplay story on iOS once
// unlocked from a genuine gesture.
function makeDingDataUrl() {
  const sampleRate = 8000;
  const duration = 0.5;
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
  const fundamental = 830;
  const harmonic = 1660;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, i / (sampleRate * 0.008));
    const decay = Math.exp(-t * 6);
    const envelope = attack * decay;
    const val = envelope * (0.7 * Math.sin(2 * Math.PI * fundamental * t) + 0.25 * Math.sin(2 * Math.PI * harmonic * t));
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, val * 32767)), true);
  }
  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

let _dingUrl = null;
export function getDingUrl() {
  if (!_dingUrl) _dingUrl = makeDingDataUrl();
  return _dingUrl;
}
