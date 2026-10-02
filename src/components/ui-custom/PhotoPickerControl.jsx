import React from 'react';

// The native file input receives the user's tap itself. Avoid relaying the
// gesture to a display:none input, which can be blocked in embedded browsers.
export default function PhotoPickerControl({ label, children, className = '', style, capture, disabled = false, inputRef, onFile }) {
  const select = event => {
    const file = event.currentTarget.files?.[0];
    // Cancel keeps the current image; choosing the same file again still works.
    event.currentTarget.value = '';
    if (file) onFile(file);
  };

  return (
    <label
      className={`relative focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[rgb(var(--color-primary))] ${className}`}
      style={{ ...style, position: 'relative', ...(disabled ? { opacity: 0.5 } : {}) }}
      data-pull-refresh-block
    >
      {children}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={capture}
        aria-label={label}
        disabled={disabled}
        onChange={select}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: disabled ? 'default' : 'pointer', zIndex: 1 }}
      />
    </label>
  );
}
