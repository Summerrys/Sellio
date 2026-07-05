import React, { useState, useRef, useEffect } from 'react';
import { useLanguage, SUPPORTED_LANGUAGES } from '@/lib/LanguageContext';

// Short collapsed labels per the merchant's request: ENG / CHI / MY
const SHORT_LABEL = { en: 'ENG', zh: 'CHI', ms: 'MY' };

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
          background: '#f1f5f9',
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
                padding: '4px 9px',
                borderRadius: 999,
                border: 'none',
                fontSize: 10.5,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s',
                background: isActive ? primaryColor : 'transparent',
                color: isActive ? 'white' : '#64748b',
                minHeight: 22,
                whiteSpace: 'nowrap',
              }}
            >
              {SHORT_LABEL[code]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
