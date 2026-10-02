// Hands a generated file to the user. On phones and tablets the share sheet is
// used when the browser can share files (Save to Files, WhatsApp, email, ...);
// everywhere else, or if sharing isn't possible, the file is downloaded.
// Returns 'shared' | 'downloaded' | 'cancelled' | 'needs-tap'.
// 'needs-tap': the browser wants a fresh tap before sharing (the file took a
// few seconds to make); call again from a button press with { retry: true }.

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
}

function prefersShare() {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export async function deliverFile(blob, filename, { retry = false } = {}) {
  let file = null;
  try {
    file = typeof File === 'function' ? new File([blob], filename, { type: blob.type || 'application/octet-stream' }) : null;
  } catch {
    file = null;
  }
  const canShare = !!file && typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  if (canShare && prefersShare()) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      if (e && e.name === 'NotAllowedError' && !retry) return 'needs-tap';
      // anything else (or a second refusal): download instead
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}
