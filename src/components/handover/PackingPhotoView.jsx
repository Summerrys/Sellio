import React from 'react';
import { X } from 'lucide-react';
import ZoomableImage from '@/components/ui-custom/ZoomableImage';
import { useBackToClose } from '@/lib/useBackToClose';

// A packing photo full screen (pinch or double-tap to zoom), for the seller's Orders and the
// buyer's My purchases (lib/packingPhoto.js). words: { title, close } in the screen's language.
// margin 0: it can sit in a list that spaces its children (Orders' space-y-3).
export function PackingPhotoViewer({ src, words, onClose }) {
  useBackToClose(true, onClose);
  return (
    <div role="dialog" aria-modal="true" aria-label={words.title} className="fixed inset-0 bg-black flex flex-col" style={{ zIndex: 530, margin: 0 }} data-pull-refresh-block data-testid="packing-viewer">
      <div className="flex items-center justify-between gap-3 px-3" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', height: 'calc(56px + env(safe-area-inset-top, 0px))' }}>
        <p className="text-sm font-semibold text-white truncate pl-1">{words.title}</p>
        <button type="button" onClick={onClose} aria-label={words.close} autoFocus className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/10 flex-shrink-0">
          <X className="w-6 h-6" />
        </button>
      </div>
      <div className="flex-1 relative min-h-0">
        <ZoomableImage src={src} alt={words.title} style={{ position: 'absolute', inset: 8 }} imgClassName="max-w-full max-h-full object-contain" />
      </div>
      <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
    </div>
  );
}
