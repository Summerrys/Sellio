import React, { useState, useRef, useEffect } from 'react';
import { useLanguage, SUPPORTED_LANGUAGES } from '@/lib/LanguageContext';

// Short collapsed labels per the merchant's request: EN / 中 / MY
const SHORT_LABEL = { en: 'EN', zh: '中', ms: 'MY' };
// Flag shown to the left of each label for quick visual identification
const FLAG = { en: '🇬🇧', zh: '🇨🇳', ms: '🇲🇾' };

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function LanguageToggle({ primaryColor = '#6366f1' }) {
  const { lang, setLang } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!expanded) return;
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setExpanded(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [expanded]);

  const handleSelect = (code) => {
    setLang(code);
    setExpanded(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          background: hexToRgba(primaryColor, 0.10),
          borderRadius: 999,
          padding: 3,
          gap: expanded ? 2 : 0,
        }}
      >
        {SUPPORTED_LANGUAGES.map(({ code }) => {
          const isActive = lang === code;
          // Collapsed: only render the active language's pill.
          if (!expanded && !isActive) return null;
          return (
            <button
              key={code}
              type="button"
              onClick={() => (isActive && !expanded ? setExpanded(true) : handleSelect(code))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 9px',
                borderRadius: 999,
                border: 'none',
                fontSize: 10.5,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: isActive ? hexToRgba(primaryColor, 0.16) : 'transparent',
                color: isActive ? primaryColor : '#64748b',
                minHeight: 22,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 11, lineHeight: 1 }}>{FLAG[code]}</span>
              {SHORT_LABEL[code]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
