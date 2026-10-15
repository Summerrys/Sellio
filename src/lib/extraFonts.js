// Storefront typography (Nunito, Poppins, Noto Sans/Serif SC for Chinese) and the
// legal pages' headings use these. They aren't in index.html: the Chinese families
// alone make that stylesheet about 250 KB, which held up every launch of the app.
const HREF = 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&family=Noto+Serif+SC:wght@400;500;600;700&family=Nunito:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700;800&display=swap';

export function loadExtraFonts() {
  if (typeof document === 'undefined' || document.getElementById('sellio-extra-fonts')) return;
  const link = document.createElement('link');
  link.id = 'sellio-extra-fonts';
  link.rel = 'stylesheet';
  link.href = HREF;
  document.head.appendChild(link);
}
