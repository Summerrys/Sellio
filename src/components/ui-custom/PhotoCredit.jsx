import React from 'react';
import { useAppText } from '@/lib/appText';
import { creditSite, PIXABAY_HOME } from '@/lib/samplePhotos';

// A photo the shop didn't take (a sample from Pixabay, or from Unsplash before 20 Nov 2026,
// products.image_credits): customers see it marked "Sample photo" (it shows a similar dish, not
// the shop's), and the photographer credited, with links to them and to the site it's from.
export function SampleTag({ style }) {
  const { t } = useAppText();
  return (
    <span data-testid="sample-tag" style={{ position: 'absolute', left: 6, bottom: 6, padding: '1px 6px', borderRadius: 6, background: 'rgba(15,23,42,.72)', color: '#ffffff', fontSize: 10, lineHeight: '15px', fontWeight: 600, pointerEvents: 'none', ...style }}>
      {t('Sample photo')}
    </span>
  );
}

export function PhotoCredit({ credit, style }) {
  const { t } = useAppText();
  if (!credit?.name) return null;
  const link = (href, text) => (href
    ? <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'underline' }}>{text}</a>
    : text);
  const site = creditSite(credit);
  return (
    <p data-testid="photo-credit" style={{ margin: 0, fontSize: 11.5, lineHeight: '16px', color: '#64748b', ...style }}>
      {t('Sample photo')} · {t('Photo by {name} on {site}', { name: link(credit.profile, credit.name), site: link(site.href, site.name) })}
    </p>
  );
}

// Where search results are from, under them (Pixabay's API rules: "show your users where the
// images and videos are from, whenever search results are displayed").
export function PhotosFrom({ style }) {
  const { t } = useAppText();
  return (
    <p data-testid="photos-from" style={{ margin: 0, fontSize: 11.5, lineHeight: '16px', color: '#64748b', ...style }}>
      {t('Photos from {site}', { site: <a href={PIXABAY_HOME} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'underline' }}>Pixabay</a> })}
    </p>
  );
}
