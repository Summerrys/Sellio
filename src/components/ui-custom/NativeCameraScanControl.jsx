import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import PhotoPickerControl from './PhotoPickerControl';
import { isBase44Shell } from '@/lib/nativeApp';
import { useAppText, appT } from '@/lib/appText';

// capture=environment delegates photography to the phone's camera app.
// Only Base44's Android wrapper needs a grant first. (Sellio's Capacitor app asks for the
// camera itself when the camera opens.)
// `action` is the button's name in its hints ("tap Scan again").
export default function NativeCameraScanControl({ onFile, onError, onBeforeOpen, children, disabled, action: actionName, ...props }) {
  // Read when a hint is shown, so the default follows the language at that moment.
  const actionLabel = () => actionName || appT('Scan');
  const { t } = useAppText();
  const nativeAndroid = typeof window !== 'undefined' && /Android/i.test(navigator.userAgent) && isBase44Shell();
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
      onError?.(appT('Allow Camera in your phone’s Sellio permissions, then try {action} again.', { action: actionLabel() }));
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
        onError?.(appT('Camera access enabled. Tap {action} again to open your camera.', { action: actionLabel() }));
      }
    }).catch(error => {
      if (!mounted.current || id !== request.current) return;
      pending.current = false;
      setPreparing(false);
      granted.current = false;
      onError?.(error.name === 'NotAllowedError' || error.name === 'SecurityError'
        ? appT('Camera access is off. Allow Camera in your phone’s Sellio permissions, then tap {action} again.', { action: actionLabel() })
        : appT('Could not open the camera. Close other camera apps and try {action} again.', { action: actionLabel() }));
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
      {preparing ? <><Loader2 className="w-4 h-4 animate-spin" /><span>{t('Opening camera…')}</span></> : children}
    </PhotoPickerControl>
  );
}

