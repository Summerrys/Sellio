import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import PhotoPickerControl from './PhotoPickerControl';
import { appPlatform } from '@/lib/nativeApp';
import { useAppText, appT } from '@/lib/appText';
import { showPermissionHelp } from '@/lib/permissionHelp';

// Sellio's Android app: the camera was allowed here before, so a tap goes straight to it.
const CAMERA_ALLOWED_KEY = 'sellio.cameraAllowed';
function cameraAllowedBefore() {
  try { return window.localStorage.getItem(CAMERA_ALLOWED_KEY) === '1'; } catch { return false; }
}
function rememberCamera(allowed) {
  try {
    if (allowed) window.localStorage.setItem(CAMERA_ALLOWED_KEY, '1');
    else window.localStorage.removeItem(CAMERA_ALLOWED_KEY);
  } catch { /* storage unavailable: every tap checks first */ }
}

// The camera closed without a photo (the file input's "cancel"): maybe backed out of, maybe
// refused in Settings since. The next tap checks again either way, and a refusal shows then.
function checkAgainIfNoPhoto() {
  const isPicker = (target) => target instanceof HTMLInputElement && target.type === 'file';
  const done = () => {
    document.removeEventListener('cancel', onCancel, true);
    document.removeEventListener('change', onChange, true);
    clearTimeout(timer);
  };
  const onCancel = (event) => { if (isPicker(event.target)) { rememberCamera(false); done(); } };
  const onChange = (event) => { if (isPicker(event.target)) done(); };
  const timer = setTimeout(done, 10 * 60 * 1000);
  document.addEventListener('cancel', onCancel, true);
  document.addEventListener('change', onChange, true);
}

// capture=environment delegates photography to the phone's camera app.
// Sellio's Android app needs a grant first (14 Nov 2026): its web view asks Android for the
// camera as the camera opens, but a "Don't allow" there just closes it without a word to the page
// (Capacitor's BridgeWebChromeClient), so the button seemed to do nothing. Asking first, the same
// way, tells Sellio, which then shows why it needs the camera and opens Settings (PermissionHelp).
// Once the camera was allowed, taps go straight to it (a check would start the camera twice).
// Sellio's iPhone app and websites let the camera ask for itself.
// `action` is the button's name in its hints ("tap Scan again").
export default function NativeCameraScanControl({ onFile, onError, onBeforeOpen, children, disabled, action: actionName, ...props }) {
  // Read when a hint is shown, so the default follows the language at that moment.
  const actionLabel = () => actionName || appT('Scan');
  const { t } = useAppText();
  const nativeAndroid = typeof window !== 'undefined' && appPlatform() === 'android';
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
    if (cameraAllowedBefore()) { checkAgainIfNoPhoto(); return; }
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
      rememberCamera(true);
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
      const refused = error.name === 'NotAllowedError' || error.name === 'SecurityError';
      if (refused) {
        rememberCamera(false);
        showPermissionHelp('camera', { action: actionLabel() });
        return;
      }
      onError?.(appT('Could not open the camera. Close other camera apps and try {action} again.', { action: actionLabel() }));
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

