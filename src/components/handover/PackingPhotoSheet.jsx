import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { cameraProblem } from './QrScanner';
import { PACKING_REASONS, recordPackingPhoto, stampText, stampedPhoto, uploadPackingPhoto } from '@/lib/packingPhoto';
import { useBackToClose } from '@/lib/useBackToClose';
import { blockedOffline, showError } from '@/lib/plainError';
import { isNativeApp } from '@/lib/nativeApp';
import { useAppText, N_ } from '@/lib/appText';

// Orders → Packed · take photo (Alvin, 23–24 Nov 2026): the packing photo of a home seller's order
// whose buyer has a QR, in Sellio's own camera (no photos from the phone's gallery). The order
// number is shown large to write on the parcel or a note; the photo is stamped with the order
// number, the shop and the time; Retake or Use photo. Use photo uploads it and records it, which
// marks the order ready for collection / out for delivery (lib/packingPhoto.js). The buyer sees it.

// Reasons a new photo fixes: back to the camera.
const RETAKE = new Set(['bad_photo', 'photo_missing', 'photo_old']);
// The storage rules refused the upload: the order was cancelled or handed over meanwhile (or this
// account lost orders.edit).
const refused = (error) => String(error?.statusCode || error?.status || '') === '403' || /row-level security|unauthori[sz]ed|not allowed/i.test(String(error?.message || ''));

export default function PackingPhotoSheet({ tenantId, order, shopName, onDone, onClose }) {
  const { t, locale } = useAppText();
  const videoRef = useRef(null);
  const [camera, setCamera] = useState('starting'); // starting | on | blocked | none | busy | failed | unsupported | stopped
  const [attempt, setAttempt] = useState(0);
  const [shot, setShot] = useState(null); // { blob, url } once taken
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const number = order?.order_number || '';

  useBackToClose(true, () => { if (busy) return false; onClose(); return undefined; });

  // The back camera, while the sheet is open (as the QR scanner opens it).
  useEffect(() => {
    let stream = null;
    let stopped = false;
    setCamera('starting');
    (async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) { setCamera('unsupported'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        });
      } catch (error) {
        if (!stopped) setCamera(cameraProblem(error));
        return;
      }
      const video = videoRef.current;
      if (stopped || !video) { stream.getTracks().forEach((track) => track.stop()); return; }
      video.srcObject = stream;
      stream.getVideoTracks().forEach((track) => { track.onended = () => { if (!stopped) setCamera('stopped'); }; });
      try { await video.play(); } catch { /* muted inline video: plays once frames arrive */ }
      if (!stopped) setCamera('on');
    })();
    return () => {
      stopped = true;
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [attempt]);

  // The taken photo's preview link goes with it.
  useEffect(() => () => { if (shot?.url) URL.revokeObjectURL(shot.url); }, [shot]);

  const stamp = stampText({ orderNumber: number, shopName, at: new Date(), locale });

  const take = async () => {
    if (camera !== 'on' || busy || shot) return;
    const blob = await stampedPhoto(videoRef.current, stampText({ orderNumber: number, shopName, at: new Date(), locale }));
    if (!blob) { setNote(t('Couldn’t take the photo. Try again.')); return; }
    setNote(null);
    setShot({ blob, url: URL.createObjectURL(blob) });
  };

  const retake = () => {
    if (busy) return;
    setShot(null);
    setNote(null);
  };

  const use = async () => {
    if (!shot || busy) return;
    if (blockedOffline(t('Couldn’t save the packing photo'), t('Saving a photo needs the internet.'), t)) return;
    setBusy(true);
    setNote(null);
    try {
      let path;
      try {
        path = await uploadPackingPhoto(tenantId, order.id, shot.blob);
      } catch (error) {
        if (refused(error)) {
          setNote(t('Order #{number} can’t take a photo now: it may have been cancelled or handed over. Refresh Orders to check.', { number }));
          return;
        }
        throw error;
      }
      const answer = await recordPackingPhoto(tenantId, order.id, path);
      if (answer?.ok) {
        toast.success(t('Order #{number} packed. The buyer can see the photo.', { number: answer.order_number || number }));
        onDone?.(answer);
        onClose();
        return;
      }
      setNote(t(PACKING_REASONS[answer?.reason] || N_('Couldn’t save the packing photo. Try again.'), { number: answer?.order_number || number }));
      if (RETAKE.has(answer?.reason)) setShot(null);
    } catch (error) {
      showError(error, t('Couldn’t save the packing photo'), { t });
    } finally {
      setBusy(false);
    }
  };

  const problem = {
    // In Sellio's app the phone's settings allow it; on the website the browser.
    blocked: isNativeApp()
      ? t('Sellio isn’t allowed to use the camera. Turn on camera access for Sellio in your phone’s settings, then try again.')
      : t('This page isn’t allowed to use the camera. Allow camera access for this site in your browser, then try again.'),
    none: t('This device can’t open a camera. Open this order in Sellio on your phone to take the packing photo.'),
    unsupported: t('This device can’t open a camera. Open this order in Sellio on your phone to take the packing photo.'),
    busy: t('The camera didn’t start (another app may be using it). Try again.'),
    failed: t('The camera didn’t start (another app may be using it). Try again.'),
    stopped: t('The camera stopped.'),
  }[camera];
  const canRetry = !!problem && camera !== 'none' && camera !== 'unsupported';
  const close = () => { if (!busy) onClose(); };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('Packing photo for order #{number}', { number })}
      className="fixed inset-0 bg-black flex flex-col"
      style={{ zIndex: 520, margin: 0 }}
      data-pull-refresh-block
      data-testid="packing-sheet"
    >
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: camera === 'on' && !shot ? 1 : 0 }}
        />
        {shot && (
          <img src={shot.url} alt={t('Packing photo for order #{number}', { number })} className="absolute inset-0 w-full h-full object-contain bg-black" data-testid="packing-preview" />
        )}
        {camera === 'on' && !shot && (
          // Where the stamp goes on the photo.
          <p aria-hidden="true" className="absolute left-0 right-0 bottom-0 px-3 py-2 text-[13px] font-semibold text-white bg-black/60 truncate" data-testid="packing-stamp">{stamp}</p>
        )}
        {camera === 'starting' && !shot && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80 text-sm">
            <Loader2 className="w-6 h-6 animate-spin" />
            {t('Opening the camera…')}
          </div>
        )}
        {problem && !shot && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center" data-testid="packing-camera-problem">
            <p className="text-sm text-white/90 leading-relaxed">{problem}</p>
            {canRetry && (
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="h-9 px-4 rounded-full bg-white text-slate-900 text-sm font-semibold">
                {t('Try the camera again')}
              </button>
            )}
          </div>
        )}

        {/* The order number, large, to write on the parcel; over the top of the picture. */}
        <div className="absolute top-0 left-0 right-0 px-4 pb-6 text-white" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', background: 'linear-gradient(rgba(0,0,0,0.78), rgba(0,0,0,0))' }}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-white/85">{t('Packing photo')}</p>
              <p className="text-[30px] leading-tight font-extrabold tracking-wide break-all" data-testid="packing-number">{number}</p>
              <p className="mt-0.5 text-[13px] text-white/85" data-testid="packing-instruction">
                {shot
                  ? t('Can you read {number} in the photo? The buyer will see it.', { number })
                  : t('Write {number} on the parcel or a note, and keep it in the photo.', { number })}
              </p>
            </div>
            <button type="button" onClick={close} aria-label={t('Close')} className="w-10 h-10 -mr-1 rounded-full flex items-center justify-center text-white bg-white/10 flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {note && (
        <div role="alert" className="mx-4 mt-3 rounded-xl px-3 py-2.5 text-sm flex gap-2 bg-rose-50 text-rose-800" data-testid="packing-note">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{note}</span>
        </div>
      )}

      <div className="flex-shrink-0 px-4 pt-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        {shot ? (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={retake} disabled={busy} data-testid="packing-retake" className="h-[52px] rounded-2xl bg-slate-800 text-white text-[15px] font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50">
              <RotateCcw className="w-4 h-4" />{t('Retake')}
            </button>
            <button
              type="button"
              onClick={use}
              disabled={busy}
              data-testid="packing-use"
              className="h-[52px] rounded-2xl text-white text-[15px] font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'var(--color-primary-gradient, rgb(var(--color-primary)))' }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {busy ? t('Saving…') : t('Use photo')}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={take}
              disabled={camera !== 'on'}
              aria-label={t('Take photo')}
              data-testid="packing-shutter"
              className="w-[72px] h-[72px] rounded-full border-4 border-white/90 flex items-center justify-center disabled:opacity-40"
            >
              <span className="block w-[56px] h-[56px] rounded-full bg-white" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
