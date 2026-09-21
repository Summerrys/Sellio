import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Cookie, ShieldCheck } from 'lucide-react';
import CookieConsent from '@/components/landing/CookieConsent';
import { getCookieConsent } from '@/lib/cookieConsent';
import './legal.css';

const LOGO_URL = 'https://assets.apptelier.sg/sellio/Logo_Sellio_Transparent.png';
const SITE_URL = 'https://sellio.apptelier.sg';

function useLegalMetadata({ title, description, path, dateModified }) {
  useEffect(() => {
    const previousTitle = document.title;
    const descriptionNode = document.querySelector('meta[name="description"]');
    const previousDescription = descriptionNode?.getAttribute('content');
    const canonicalUrl = SITE_URL + path;

    let canonical = document.querySelector('link[rel="canonical"]');
    const createdCanonical = !canonical;
    const previousCanonical = canonical?.getAttribute('href');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }

    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const previousOgTitle = ogTitle?.getAttribute('content');
    const previousOgUrl = ogUrl?.getAttribute('content');

    document.title = title + ' | Sellio';
    descriptionNode?.setAttribute('content', description);
    canonical.setAttribute('href', canonicalUrl);
    ogTitle?.setAttribute('content', title + ' | Sellio');
    ogUrl?.setAttribute('content', canonicalUrl);

    const schema = document.createElement('script');
    schema.type = 'application/ld+json';
    schema.dataset.sellioLegalSchema = path;
    schema.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: canonicalUrl,
      dateModified,
      isPartOf: {
        '@type': 'WebSite',
        name: 'Sellio',
        url: SITE_URL,
      },
      publisher: {
        '@type': 'Organization',
        name: 'Apptélier',
        url: 'https://apptelier.sg',
      },
    });
    document.head.appendChild(schema);

    return () => {
      document.title = previousTitle;
      if (descriptionNode && previousDescription) descriptionNode.setAttribute('content', previousDescription);
      if (createdCanonical) canonical.remove();
      else if (previousCanonical) canonical.setAttribute('href', previousCanonical);
      if (ogTitle && previousOgTitle) ogTitle.setAttribute('content', previousOgTitle);
      if (ogUrl && previousOgUrl) ogUrl.setAttribute('content', previousOgUrl);
      schema.remove();
    };
  }, [dateModified, description, path, title]);
}

export default function LegalPage({
  title,
  eyebrow,
  intro,
  description,
  path,
  lastUpdated,
  sections,
}) {
  useLegalMetadata({
    title,
    description,
    path,
    dateModified: '2026-09-22',
  });

  const [cookieOpen, setCookieOpen] = useState(() => !getCookieConsent());
  const cookieReturnFocus = useRef(null);

  return (
    <div className="sellio-legal-page">
      <a className="sellio-legal-skip" href="#legal-content">Skip to content</a>

      <header className="sellio-legal-header">
        <div className="sellio-legal-container sellio-legal-header__inner">
          <a className="sellio-legal-logo" href="/" aria-label="Sellio home">
            <img src={LOGO_URL} alt="Sellio" />
            <span>Sellio</span>
          </a>
          <nav className="sellio-legal-header__actions" aria-label="Policy navigation">
            <a href="/" className="sellio-legal-back"><ArrowLeft aria-hidden="true" /> Back to Sellio</a>
            <a href="/Auth" className="sellio-legal-login">Merchant Login <ArrowRight aria-hidden="true" /></a>
          </nav>
        </div>
      </header>

      <main id="legal-content" tabIndex={-1}>
        <section className="sellio-legal-hero" aria-labelledby="legal-page-title">
          <div className="sellio-legal-container">
            <span className="sellio-legal-eyebrow"><ShieldCheck aria-hidden="true" /> {eyebrow}</span>
            <h1 id="legal-page-title">{title}</h1>
            <p className="sellio-legal-intro">{intro}</p>
            <div className="sellio-legal-meta">
              <span>Last updated {lastUpdated}</span>
              <span>Apptélier · Singapore</span>
            </div>
          </div>
        </section>

        <div className="sellio-legal-container sellio-legal-layout">
          <aside className="sellio-legal-toc" aria-label="Table of contents">
            <p>On this page</p>
            <nav>
              {sections.map((section, index) => (
                <a key={section.id} href={'#' + section.id}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {section.title}
                </a>
              ))}
            </nav>
          </aside>

          <article className="sellio-legal-article">
            <div className="sellio-legal-notice">
              <strong>Plain-language notice</strong>
              <p>We have written this page to explain Sellio clearly. It should be read together with any plan, checkout, merchant agreement or service notice that applies to you.</p>
            </div>

            {sections.map((section, index) => (
              <section key={section.id} id={section.id} className="sellio-legal-section" aria-labelledby={section.id + '-title'}>
                <div className="sellio-legal-section__number">{String(index + 1).padStart(2, '0')}</div>
                <div>
                  <h2 id={section.id + '-title'}>{section.title}</h2>
                  {section.content}
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>

      <footer className="sellio-legal-footer">
        <div className="sellio-legal-container sellio-legal-footer__top">
          <div>
            <a className="sellio-legal-logo sellio-legal-logo--footer" href="/" aria-label="Sellio home">
              <img src={LOGO_URL} alt="" />
              <span>Sellio</span>
            </a>
            <p>Storefronts, orders and merchant operations—connected.</p>
          </div>
          <nav aria-label="Legal links">
            <a href="/privacy" aria-current={path === '/privacy' ? 'page' : undefined}>Privacy Policy</a>
            <a href="/terms" aria-current={path === '/terms' ? 'page' : undefined}>Terms &amp; Conditions</a>
            <button
              type="button"
              onClick={(event) => {
                cookieReturnFocus.current = event.currentTarget;
                setCookieOpen(true);
              }}
            >
              <Cookie aria-hidden="true" /> Cookie settings
            </button>
            <a href="mailto:hello@apptelier.sg">Contact</a>
          </nav>
        </div>
        <div className="sellio-legal-container sellio-legal-footer__bottom">
          <span>© 2026 Sellio by Apptélier.</span>
          <span>Built in Singapore · Ready for the world</span>
        </div>
      </footer>

      <CookieConsent open={cookieOpen} onOpenChange={setCookieOpen} returnFocusRef={cookieReturnFocus} />
    </div>
  );
}
