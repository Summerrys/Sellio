import React from 'react';
import { useLanguage, SUPPORTED_LANGUAGES } from '@/lib/LanguageContext';

export default function LanguageToggle({ primaryColor = '#6366f1', compact = false }) {
  const { lang, setLang } = useLanguage();

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: '#f1f5f9',
        borderRadius: 999,
        padding: 3,
        gap: 2,
      }}
    >
      {SUPPORTED_LANGUAGES.map(({ code, label }) => {
        const active = lang === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            style={{
              padding: compact ? '4px 8px' : '5px 11px',
              borderRadius: 999,
              border: 'none',
              fontSize: compact ? 11 : 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s',
              background: active ? primaryColor : 'transparent',
              color: active ? 'white' : '#64748b',
              minHeight: compact ? 24 : 28,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
