import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import PhotoPickerControl from './PhotoPickerControl';

// capture=environment delegates photography to the phone's camera app.
// Only Android wrappers with a declared CAMERA permission need a grant first.
export default function NativeCameraScanControl({ onFile, onError, onBeforeOpen, children, disabled, ...props }) {
  const nativeAndroid = typeof window !== 'undefined' && /Android/i.test(navigator.userAgent) && (
    typeof window.ReactNativeWebView?.postMessage === 'function' ||
    typeof window.__hybrid_bridge?.sendMessage === 'function'
  );
  const granted = useRef(!nativeAndroid);
  const mounted = useRef(false);
  const pending = useRef(false);
  const request = useRef(0);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current += 1; };
  }, []);

  const activate = event => {
    if (onBeforeOpen?.() === false) { event.preventDefault(); return; }
    if (pending.current) { event.preventDefault(); return; }
    if (!nativeAndroid) return;
    if (granted.current) { granted.current = false; return; }
    if (!navigator.mediaDevices?.getUserMedia) {
      event.preventDefault();
      onError?.('Allow Camera in your phone’s Sellio permissions, then try Scan again.');
      return;
    }
    event.preventDefault();
    const input = event.currentTarget;
    const id = ++request.current;
    pending.current = true;
    setPreparing(true);
    // Request only when Scan is tapped. Release the stream immediately; the
    // actual photo is taken by the native camera, never by a Sellio preview.
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    }).then(stream => {
      stream.getTracks().forEach(track => track.stop());
      if (!mounted.current || id !== request.current) return;
      granted.current = true;
      pending.current = false;
      setPreparing(false);
      if (!input.isConnected || input.disabled) return;
      try {
        // Some browsers retain the gesture across the OS permission prompt.
        // If it expires, the next real tap opens the camera directly.
        if (typeof input.showPicker === 'function') { input.showPicker(); granted.current = false; }
        else input.click();
      } catch {
        onError?.('Camera access enabled. Tap Scan again to open your camera.');
      }
    }).catch(error => {
      if (!mounted.current || id !== request.current) return;
      pending.current = false;
      setPreparing(false);
      granted.current = false;
      onError?.(error.name === 'NotAllowedError' || error.name === 'SecurityError'
        ? 'Camera access is off. Allow Camera in your phone’s Sellio permissions, then tap Scan again.'
        : 'Could not open the camera. Close other camera apps and try Scan again.');
    });
  };

  return (
    <PhotoPickerControl
      {...props}
      capture="environment"
      disabled={disabled}
      onActivate={activate}
      onFile={onFile}
      aria-busy={preparing}
    >
      {preparing ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Opening camera…</span></> : children}
    </PhotoPickerControl>
  );
}

