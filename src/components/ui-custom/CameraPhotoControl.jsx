import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Loader2, X } from 'lucide-react';
import PhotoPickerControl from './PhotoPickerControl';
import { useBackToClose } from '@/lib/useBackToClose';

const stopStream = stream => stream?.getTracks().forEach(track => track.stop());

export default function CameraPhotoControl({ label, children, className, style, onFile }) {
  const [open, setOpen] = useState(false);
  const [stream, setStream] = useState(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const requestRef = useRef(0);
  const triggerRef = useRef(null);
  const titleId = useId();

  const close = useCallback(() => {
    requestRef.current++;
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStream(null);
    setReady(false);
    setCapturing(false);
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useBackToClose(open, close);

  useEffect(() => () => {
    requestRef.current++;
    stopStream(streamRef.current);
  }, []);

  useEffect(() => {
    if (!stream || !videoRef.current) return;
    videoRef.current.srcObject = stream;
    videoRef.current.play().catch(() => setError('Could not start the camera preview. Please try again.'));
  }, [stream]);

  const start = () => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setReady(false);
    setCapturing(false);
    setError('');
    setOpen(true);
    const request = ++requestRef.current;
    // This is the camera feature itself, not a permission probe. In the Android
    // wrapper getUserMedia invokes its native runtime-permission handler;
    // capture=file alone silently fails when the declared CAMERA grant is off.
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(media => {
      if (request !== requestRef.current) { stopStream(media); return; }
      streamRef.current = media;
      setStream(media);
    }).catch(err => {
      if (request !== requestRef.current) return;
      setError(err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
        ? 'Camera access is off. Allow Camera in your phone’s Sellio permissions, then try again.'
        : 'Could not open the camera. Try again or upload a photo.');
    });
  };

  const capture = () => {
    const video = videoRef.current;
    if (!ready || capturing || !video?.videoWidth || !video.videoHeight) return;
    setCapturing(true);
    const request = requestRef.current;
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not capture the photo. Please try again.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (request !== requestRef.current) return;
        if (!blob) { setCapturing(false); setError('Could not capture the photo. Please try again.'); return; }
        const file = new File([blob], `menu-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        close();
        onFile(file);
      }, 'image/jpeg', 0.9);
    } catch (err) {
      setCapturing(false);
      setError(err.message || 'Could not capture the photo. Please try again.');
    }
  };

  if (!navigator.mediaDevices?.getUserMedia) {
    return <PhotoPickerControl label={label} capture="environment" className={className} style={style} onFile={onFile}>{children}</PhotoPickerControl>;
  }

  return (
    <>
      <button ref={triggerRef} type="button" aria-label={label} className={className} style={style} onClick={start} data-pull-refresh-block>{children}</button>
      {open && createPortal(
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 p-6" style={{ zIndex: 300 }} data-pull-refresh-block>
          <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-lg rounded-2xl bg-white overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 48px)' }}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h2 id={titleId} className="font-semibold text-slate-900">Take Photo</h2>
              <button type="button" onClick={close} aria-label="Close camera" autoFocus className="rounded-lg p-2 text-slate-500"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-3">
              {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : (
                <div className="relative overflow-hidden rounded-xl bg-slate-900">
                  <video ref={videoRef} autoPlay muted playsInline onLoadedMetadata={() => setReady(true)} className="w-full max-h-[60dvh] object-contain" />
                  {!ready && <div className="flex items-center justify-center gap-2 p-6 text-white text-sm"><Loader2 size={18} className="animate-spin" />Allow camera access to take a photo.</div>}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={error ? start : capture} disabled={!error && (!ready || capturing)} className="flex-1 rounded-lg px-3 py-3 font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'var(--color-primary-gradient)' }}>
                  <Camera size={18} />{error ? 'Try Again' : capturing ? 'Capturing…' : 'Take Photo'}
                </button>
                <PhotoPickerControl label="Upload menu photo instead" onFile={file => { close(); onFile(file); }} className="flex-1 flex items-center justify-center rounded-lg border border-slate-300 px-3 py-3 text-sm font-medium text-slate-700 cursor-pointer">Upload Photo</PhotoPickerControl>
              </div>
            </div>
          </div>
        </div>, document.body
      )}
    </>
  );
}
