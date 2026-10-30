import React, { useCallback, useId, useState } from 'react';
import { Camera, Image as ImageIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import PhotoPickerControl from './PhotoPickerControl';
import NativeCameraScanControl from './NativeCameraScanControl';
import BottomSheet from '../explore/BottomSheet';
import { BRAND_GRADIENT } from '../explore/shared';
import { isNativeApp } from '@/lib/nativeApp';

// A button that adds a photo. A browser's own picker offers the camera and the gallery,
// so in a browser this is the plain picker. Sellio's Android app (Base44's web view) adds
// the camera to its picker only once Sellio may use the camera, and never asks, so there
// the picker went straight to the gallery. In the app a tap opens "Add a photo" instead:
// Take photo (asks for the camera the first time, as Scan does, then opens the phone's
// camera) or Choose from gallery. The sheet stays open while the camera or gallery is up,
// since the photo arrives at the option that opened it; then the sheet closes.
const OPTION = 'w-full flex items-center gap-3 rounded-[14px] border border-slate-200 bg-white p-3 text-left cursor-pointer active:bg-slate-50';

export default function PhotoSourceControl({ label, children, className = '', style, disabled = false, inputRef, onFile, title = 'Add a photo' }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const titleId = useId();
  const nativeAndroid = typeof window !== 'undefined' && /Android/i.test(window.navigator.userAgent) && isNativeApp();

  if (!nativeAndroid) {
    return (
      <PhotoPickerControl label={label} className={className} style={style} disabled={disabled} inputRef={inputRef} onFile={onFile}>
        {children}
      </PhotoPickerControl>
    );
  }

  const picked = (file) => {
    setOpen(false);
    onFile(file);
  };

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={className}
        style={{ ...style, ...(disabled ? { opacity: 0.5 } : {}) }}
        data-pull-refresh-block
      >
        {children}
      </button>
      <BottomSheet open={open} onClose={close} labelledBy={titleId}>
        <div className="flex items-center">
          <h2 id={titleId} className="flex-1 text-base font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={close} aria-label="Close" className="w-11 h-11 -mr-2.5 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-50">
            <X className="w-[22px] h-[22px]" />
          </button>
        </div>
        <div className="mt-1 space-y-2.5">
          <NativeCameraScanControl label="Take photo" action="Take photo" onFile={picked} onError={(message) => toast.message(message)} className={OPTION}>
            <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: BRAND_GRADIENT }}>
              <Camera className="w-[22px] h-[22px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-slate-900">Take photo</span>
              <span className="block text-[12.5px] text-slate-500 mt-0.5">Use your phone’s camera</span>
            </span>
          </NativeCameraScanControl>
          <PhotoPickerControl label="Choose from gallery" inputRef={inputRef} onFile={picked} className={OPTION}>
            <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-700">
              <ImageIcon className="w-[22px] h-[22px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-slate-900">Choose from gallery</span>
              <span className="block text-[12.5px] text-slate-500 mt-0.5">Pick a photo you already have</span>
            </span>
          </PhotoPickerControl>
        </div>
      </BottomSheet>
    </>
  );
}
