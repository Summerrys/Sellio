import React from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from 'sonner';
import { Download, X } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';
import { isNativeApp } from '@/lib/nativeApp';

// Saving a file Sellio made (a CSV, a report, a QR code) inside Sellio's Android app.
// The app can't save files straight from a page, so the file goes online first and
// "Save to phone" opens it in the phone's browser, which downloads it. A browser
// saves files straight from the page as before; callers check inAppFiles() first.
//
// Where the file goes:
// - A shop's files (exports, reports, templates, table QR codes): the private
//   "exports" storage, in <shop>/<person>/, readable only by the person who made it,
//   through a link that stops working after LINK_MINUTES. Files older than that are
//   removed when the link expires while the page is still open, the next time the
//   same person saves a file, and when they next open the app (Layout).
// - A QR code made during a business's onboarding, before the shop exists
//   (publicQr): the public photo storage, like the shop's other QR codes; it only
//   holds the ordering page's public link.

export const EXPORTS_BUCKET = 'exports';
export const LINK_MINUTES = 10;
const GRADIENT = { background: 'var(--color-primary-gradient, linear-gradient(135deg, #3b82f6, #9333ea))', color: '#fff' };

export function inAppFiles() {
  return isNativeApp();
}

// A storage-safe file name: letters, digits, dot, dash and underscore.
export function storageFileName(name) {
  const cleaned = String(name || '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|_+$/g, '');
  return (cleaned || 'file').slice(-80);
}

async function asBlob(src) {
  if (src instanceof Blob) return src;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Could not read the file (${res.status})`);
  return res.blob();
}

// Removes this person's saved files whose link has expired (their names start
// with the time they were saved).
async function clearExpired(storage, folder) {
  try {
    const { data } = await storage.list(folder, { limit: 100 });
    const cutoff = Date.now() - LINK_MINUTES * 60 * 1000;
    const old = (data || [])
      .filter((f) => f?.id && Number.parseInt(f.name, 10) > 0 && Number.parseInt(f.name, 10) < cutoff)
      .map((f) => `${folder}/${f.name}`);
    if (old.length) await storage.remove(old);
  } catch {
    // tidying up is best-effort
  }
}

// Run when the app opens a shop: removes this person's expired files there.
export async function clearExpiredFiles(tenantId) {
  if (!tenantId) return;
  try {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (uid) await clearExpired(supabase.storage.from(EXPORTS_BUCKET), `${tenantId}/${uid}`);
  } catch {
    // best-effort
  }
}

// "Your file is ready": a small window over the page (above the bottom bar), with
// "Save to phone" as a real link, because the app only opens a link in the phone's
// browser when the person taps it. It closes itself when the link expires.
let openReady = null;

function FileReady({ url, filename, label, expires, onClose }) {
  return (
    <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${label} ready`}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="file-ready"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-slate-900">{label} ready</p>
            <p className="mt-0.5 break-all text-xs text-slate-500">{filename}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 p-1 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          data-testid="file-ready-save"
          onClick={() => setTimeout(onClose, 400)}
          className="mt-4 flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium"
          style={GRADIENT}
        >
          <Download className="h-4 w-4" /> Save to phone
        </a>
        <p className="mt-2.5 text-xs leading-snug text-slate-400">
          Opens in your phone’s browser, which saves it to your Downloads.
          {expires ? ` The link works for ${LINK_MINUTES} minutes.` : ''}
        </p>
      </div>
    </div>
  );
}

function showReady(props) {
  openReady?.();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let timer = null;
  const close = () => {
    if (openReady !== close) return;
    openReady = null;
    clearTimeout(timer);
    root.unmount();
    host.remove();
  };
  openReady = close;
  timer = setTimeout(close, LINK_MINUTES * 60 * 1000);
  root.render(<FileReady {...props} onClose={close} />);
}

// src: a Blob, or the address of the file (a data: or https: URL).
// tenantId: the shop the file belongs to. publicQr: a QR code made before the shop
// exists (business onboarding). Returns true once "Save to phone" is showing.
export async function saveFileInApp(src, filename, { tenantId, label = 'File', publicQr = false } = {}) {
  const loadingId = toast.loading('Getting your file ready…');
  try {
    if (!tenantId && !publicQr) throw new Error('No shop for this file');
    const blob = await asBlob(src);
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) throw new Error('Not signed in');
    // The type without parameters ("text/csv", not "text/csv;charset=utf-8"): storage
    // takes the type from the file itself and only accepts the plain types.
    const contentType = (blob.type || 'application/octet-stream').split(';')[0].trim();
    const file = blob.type === contentType ? blob : new Blob([blob], { type: contentType });
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let url;
    let expires = false;
    if (tenantId) {
      const storage = supabase.storage.from(EXPORTS_BUCKET);
      const folder = `${tenantId}/${uid}`;
      await clearExpired(storage, folder);
      const path = `${folder}/${stamp}-${storageFileName(filename)}`;
      const { error } = await storage.upload(path, file, { contentType, upsert: false, cacheControl: '0' });
      if (error) throw error;
      const { data, error: linkError } = await storage.createSignedUrl(path, LINK_MINUTES * 60, { download: filename });
      if (linkError || !data?.signedUrl) throw linkError || new Error('No link');
      url = data.signedUrl;
      expires = true;
      setTimeout(() => { storage.remove([path]).catch(() => {}); }, LINK_MINUTES * 60 * 1000 + 5000);
    } else {
      const storage = supabase.storage.from('product-images');
      const path = `temp/onboarding/${uid}/qr/${stamp}-${storageFileName(filename)}`;
      const { error } = await storage.upload(path, file, { contentType, upsert: false, cacheControl: '300' });
      if (error) throw error;
      url = storage.getPublicUrl(path, { download: filename }).data.publicUrl;
    }
    toast.dismiss(loadingId);
    showReady({ url, filename, label, expires });
    return true;
  } catch (e) {
    console.warn('Saving the file in the app failed:', e);
    toast.dismiss(loadingId);
    toast.error('Couldn’t get the file ready. Please try again.');
    return false;
  }
}
