import React, { useCallback, useId, useState } from 'react';
import { Camera, Image as ImageIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import PhotoPickerControl from './PhotoPickerControl';
import NativeCameraScanControl from './NativeCameraScanControl';
import BottomSheet from '../explore/BottomSheet';
import { BRAND_GRADIENT } from '../explore/shared';
import { isAndroid, isIOS } from '@/lib/pwaInstall';
import { useAppText } from '@/lib/appText';

// A button that adds a photo. On a phone or tablet (Sellio's Android app, Sellio added to a
// home screen, or a phone's browser, Android or iPhone) a tap opens "Add a photo": Take
// photo (the phone's camera; in the Android app it asks for the camera the first time, as
// Scan does) or Choose from gallery. The phones' own pickers differ: Android's goes straight
// to the gallery, and Sellio's Android app (Base44's web view) adds the camera only once
// Sellio may use it. On a computer it's the browser's own file picker. The sheet stays open
// while the camera or gallery is up, since the photo arrives at the option that opened it;
// then the sheet closes.
const OPTION = 'w-full flex items-center gap-3 rounded-[14px] border border-slate-200 bg-white p-3 text-left cursor-pointer active:bg-slate-50';

export default function PhotoSourceControl({ label, children, className = '', style, disabled = false, inputRef, onFile, title = 'Add a photo' }) {
  const { t } = useAppText();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const titleId = useId();
  const phone = typeof window !== 'undefined' && (isAndroid() || isIOS());

  if (!phone) {
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
          <button type="button" onClick={close} aria-label={t('Close')} className="w-11 h-11 -mr-2.5 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-50">
            <X className="w-[22px] h-[22px]" />
          </button>
        </div>
        <div className="mt-1 space-y-2.5">
          <NativeCameraScanControl label={t('Take photo')} action={t('Take photo')} onFile={picked} onError={(message) => toast.message(message)} className={OPTION}>
            <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: BRAND_GRADIENT }}>
              <Camera className="w-[22px] h-[22px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-slate-900">{t('Take photo')}</span>
              <span className="block text-[12.5px] text-slate-500 mt-0.5">{t('Use your phone’s camera')}</span>
            </span>
          </NativeCameraScanControl>
          <PhotoPickerControl label={t('Choose from gallery')} inputRef={inputRef} onFile={picked} className={OPTION}>
            <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-700">
              <ImageIcon className="w-[22px] h-[22px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-slate-900">{t('Choose from gallery')}</span>
              <span className="block text-[12.5px] text-slate-500 mt-0.5">{t('Pick a photo you already have')}</span>
            </span>
          </PhotoPickerControl>
        </div>
      </BottomSheet>
    </>
  );
}
