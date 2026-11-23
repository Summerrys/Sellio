import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAppText } from '@/lib/appText';
import { isNativeApp } from '@/lib/nativeApp';

// The phone's back camera, reading QR codes (collection QRs, Orders → Hand over). Decoding: the
// browser's own BarcodeDetector where it reads QR codes (Chrome on Android), jsQR otherwise
// (iPhone, desktop, or when the detector fails), loaded only then. In Sellio's apps the camera is
// allowed through Capacitor's web view (Android asks for the CAMERA permission the app already
// declares; iOS shows NSCameraUsageDescription).
// onResult(text) is called for each QR read (the same one again only after a pause); paused stops
// reading but keeps the camera on.

const READ_EVERY_MS = 160;
const SAME_AGAIN_MS = 2500;

async function browserDetector() {
  try {
    const Detector = typeof window !== 'undefined' ? window.BarcodeDetector : undefined;
    if (!Detector) return null;
    const formats = typeof Detector.getSupportedFormats === 'function' ? await Detector.getSupportedFormats() : ['qr_code'];
    if (!formats.includes('qr_code')) return null;
    const detector = new Detector({ formats: ['qr_code'] });
    return async (video) => (await detector.detect(video))?.[0]?.rawValue || null;
  } catch {
    return null;
  }
}

async function jsqrReader() {
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h || !context) return null;
    // A phone screen held up to the camera fills much of the picture: 640 pixels is plenty.
    const scale = Math.min(1, 640 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data || null;
  };
}

// The camera problem in words for people (err.name from getUserMedia).
export function cameraProblem(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'blocked';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'none';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  return 'failed';
}

export default function QrScanner({ onResult, paused = false }) {
  const { t } = useAppText();
  const videoRef = useRef(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [state, setState] = useState('starting'); // starting | on | blocked | none | busy | failed | unsupported | stopped
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stream = null;
    let timer = null;
    let stopped = false;
    let read = null;
    let last = { text: '', at: 0 };
    setState('starting');

    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    const loop = async () => {
      if (stopped) return;
      const video = videoRef.current;
      if (!pausedRef.current && read && video && video.readyState >= 2) {
        let text = null;
        try {
          text = await read(video);
        } catch {
          // The browser's detector can exist and still fail (some web views): use jsQR instead.
          try { read = await jsqrReader(); } catch { read = null; }
        }
        if (stopped) return;
        const now = Date.now();
        if (text && (text !== last.text || now - last.at > SAME_AGAIN_MS)) {
          last = { text, at: now };
          onResultRef.current?.(text);
        }
      }
      timer = setTimeout(loop, READ_EVERY_MS);
    };

    (async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setState('unsupported');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (error) {
        if (!stopped) setState(cameraProblem(error));
        return;
      }
      if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
      const video = videoRef.current;
      if (!video) { stop(); return; }
      video.srcObject = stream;
      // The camera turned off underneath us (the app went to the background, another app took it).
      stream.getVideoTracks().forEach((track) => { track.onended = () => { if (!stopped) setState('stopped'); }; });
      try { await video.play(); } catch { /* autoplay muted inline: plays once frames arrive */ }
      read = (await browserDetector()) || (await jsqrReader().catch(() => null));
      if (stopped) return;
      if (!read) { stop(); setState('failed'); return; }
      setState('on');
      loop();
    })();

    return stop;
  }, [attempt]);

  const noCamera = t('This device or browser can’t open the camera. Type the buyer’s 6-digit code instead.');
  const didntStart = t('The camera didn’t start (another app may be using it). Try again, or type the buyer’s 6-digit code.');
  const problem = {
    // In Sellio's app the phone's settings allow it; on a website (a courier's link) the browser.
    blocked: isNativeApp()
      ? t('Sellio isn’t allowed to use the camera. Turn on camera access for Sellio in your phone’s settings, or type the buyer’s 6-digit code.')
      : t('This page isn’t allowed to use the camera. Allow camera access for this site in your browser, or type the buyer’s 6-digit code.'),
    none: noCamera,
    unsupported: noCamera,
    busy: didntStart,
    failed: didntStart,
    stopped: t('The camera stopped.'),
  }[state];

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-slate-900" style={{ aspectRatio: '1 / 1', maxHeight: '52vh' }} data-testid="qr-scanner">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: state === 'on' ? 1 : 0 }}
      />
      {state === 'on' && (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-3/5 aspect-square rounded-2xl border-[3px] border-white/90" style={{ boxShadow: '0 0 0 9999px rgba(15,23,42,0.35)' }} />
        </div>
      )}
      {state === 'starting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80 text-sm">
          <Loader2 className="w-6 h-6 animate-spin" />
          {t('Opening the camera…')}
        </div>
      )}
      {problem && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center" data-testid="qr-scanner-problem">
          <p className="text-sm text-white/90 leading-relaxed">{problem}</p>
          {state !== 'unsupported' && state !== 'none' && (
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="h-9 px-4 rounded-full bg-white text-slate-900 text-sm font-semibold">
              {t('Try the camera again')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
