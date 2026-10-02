// Treat every record field as text when building browser print documents.
export function escapePrintHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
}

export function printImageSrc(value) {
  if (typeof value !== 'string') return '';
  const src = value.trim();
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(src)) return escapePrintHtml(src);
  try {
    const url = new URL(src);
    if (url.protocol === 'https:') return escapePrintHtml(url.href);
  } catch {}
  return '';
}
