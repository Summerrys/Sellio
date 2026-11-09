import React, { useId, useState } from 'react';
import { Camera, Image as ImageIcon, Loader2, Trash2, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { showError } from '@/lib/plainError';
import BottomSheet from '@/components/explore/BottomSheet';
import PhotoPickerControl from '@/components/ui-custom/PhotoPickerControl';
import NativeCameraScanControl from '@/components/ui-custom/NativeCameraScanControl';
import { BRAND_GRADIENT } from '@/components/explore/shared';
import { isAndroid, isIOS } from '@/lib/pwaInstall';
import { chooseProfilePhoto, uploadProfilePhoto, useProfilePhoto } from '@/lib/profilePhoto';

// The person's photo in place of the letter (lib/profilePhoto.js): their Google photo, one they
// chose, or the letter when there's none (or it won't load).
export function ProfileAvatar({ email, initial, size = 56, className = '', fallbackClassName = '', fallbackStyle }) {
  const { url } = useProfilePhoto(email);
  const [broken, setBroken] = useState(null);
  if (url && broken !== url) {
    return (
      <img
        src={url}
        alt=""
        data-testid="profile-photo"
        referrerPolicy="no-referrer"
        onError={() => setBroken(url)}
        className={`rounded-full object-cover flex-shrink-0 bg-slate-100 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      data-testid="profile-initial"
      className={`rounded-full flex items-center justify-center flex-shrink-0 ${fallbackClassName} ${className}`}
      style={{ width: size, height: size, ...fallbackStyle }}
    >
      {initial}
    </span>
  );
}

const OPTION = 'w-full flex items-center gap-3 rounded-[14px] border border-slate-200 bg-white p-3 text-left cursor-pointer active:bg-slate-50';

function OptionText({ title, detail, danger = false }) {
  return (
    <span className="min-w-0">
      <span className={`block text-[15px] font-semibold ${danger ? 'text-rose-600' : 'text-slate-900'}`}>{title}</span>
      {detail && <span className="block text-[12.5px] text-slate-500 mt-0.5">{detail}</span>}
    </span>
  );
}

// The photo with a camera badge; a tap opens "Profile photo": take one or choose one (on a
// computer: choose one), go back to the Google photo, or remove it.
export function ProfilePhotoEditor({ email, initial, size = 72, fallbackStyle }) {
  const { answer } = useProfilePhoto(email);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const phone = typeof window !== 'undefined' && (isAndroid() || isIOS());
  const close = () => setOpen(false);

  // The sheet stays open while the camera or gallery is up (the photo arrives at the option
  // that opened it), and closes when the photo arrives or another option is picked.
  const run = async (work, done) => {
    setOpen(false);
    setBusy(true);
    try {
      await work();
      toast.success(done);
    } catch (error) {
      // Plain words: the reason when it's written for people (the photo can't be used, the
      // upload failed), otherwise what kind of problem it was.
      showError(error, 'Couldn’t change your photo');
    } finally {
      setBusy(false);
    }
  };
  const picked = (file) => { if (file) run(() => uploadProfilePhoto(email, file), 'Photo updated'); };
  const canUseGoogle = !!answer?.google && answer?.source !== 'google';
  const canRemove = !!answer?.source;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        aria-label="Change profile photo"
        aria-haspopup="dialog"
        data-testid="profile-photo-button"
        className="relative rounded-full flex-shrink-0"
      >
        <ProfileAvatar email={email} initial={initial} size={size} fallbackClassName="text-white text-2xl font-bold" fallbackStyle={fallbackStyle} />
        <span className="absolute -right-0.5 -bottom-0.5 w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center border-[3px] border-white">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
        </span>
      </button>
      <BottomSheet open={open} onClose={close} labelledBy={titleId}>
        <div className="flex items-center">
          <h2 id={titleId} className="flex-1 text-base font-bold text-slate-900">Profile photo</h2>
          <button type="button" onClick={close} aria-label="Close" className="w-11 h-11 -mr-2.5 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-50">
            <X className="w-[22px] h-[22px]" />
          </button>
        </div>
        <div data-testid="profile-photo-options" className="mt-1 space-y-2.5">
          {phone && (
            <NativeCameraScanControl label="Take photo" action="Take photo" onFile={picked} onError={(message) => toast.message(message)} className={OPTION}>
              <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: BRAND_GRADIENT }}>
                <Camera className="w-[22px] h-[22px]" />
              </span>
              <OptionText title="Take photo" detail="Use your phone’s camera" />
            </NativeCameraScanControl>
          )}
          <PhotoPickerControl label={phone ? 'Choose from gallery' : 'Choose a photo'} onFile={picked} className={OPTION}>
            <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-700">
              <ImageIcon className="w-[22px] h-[22px]" />
            </span>
            <OptionText title={phone ? 'Choose from gallery' : 'Choose a photo'} detail="Pick a photo you already have" />
          </PhotoPickerControl>
          {canUseGoogle && (
            <button type="button" className={OPTION} onClick={() => run(() => chooseProfilePhoto(email, 'google'), 'Using your Google photo')}>
              <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-700">
                <UserRound className="w-[22px] h-[22px]" />
              </span>
              <OptionText title="Use my Google photo" detail="The photo on your Google account" />
            </button>
          )}
          {canRemove && (
            <button type="button" className={OPTION} onClick={() => run(() => chooseProfilePhoto(email, 'none'), 'Photo removed')}>
              <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-rose-50 text-rose-600">
                <Trash2 className="w-[20px] h-[20px]" />
              </span>
              <OptionText title="Remove photo" detail="Show your initial instead" danger />
            </button>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
