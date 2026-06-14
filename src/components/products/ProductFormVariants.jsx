import React from 'react';

export default function ProductFormVariants({ formData, onChange }) {
  const variants = formData.variants || [];

  const inferType = (name) => {
    if (/size/i.test(name)) return 'size';
    if (/colou?r/i.test(name)) return 'color';
    if (/add.?on|topping|extra/i.test(name)) return 'addon';
    return 'other';
  };

  const addGroup = () => {
    onChange({ variants: [...variants, { name: '', type: 'other', options: [{ label: '', price_modifier: 0 }] }] });
  };

  const removeGroup = (gi) => onChange({ variants: variants.filter((_, i) => i !== gi) });

  const addOption = (gi) => {
    const updated = variants.map((g, i) => i === gi ? { ...g, options: [...g.options, { label: '', price_modifier: 0 }] } : g);
    onChange({ variants: updated });
  };

  const removeOption = (gi, oi) => {
    const updated = variants.map((g, i) => i === gi ? { ...g, options: g.options.filter((_, j) => j !== oi) } : g);
    onChange({ variants: updated });
  };

  const updateGroupName = (gi, value) => {
    const updated = variants.map((g, i) => i === gi ? { ...g, name: value, type: inferType(value) } : g);
    onChange({ variants: updated });
  };

  const updateOptionLabel = (gi, oi, value) => {
    const updated = variants.map((g, i) =>
      i === gi ? { ...g, options: g.options.map((o, j) => j === oi ? { ...o, label: value } : o) } : g
    );
    onChange({ variants: updated });
  };

  const updateOptionPrice = (gi, oi, value) => {
    const updated = variants.map((g, i) =>
      i === gi ? { ...g, options: g.options.map((o, j) => j === oi ? { ...o, price_modifier: value === '' ? 0 : parseFloat(value) || 0 } : o) } : g
    );
    onChange({ variants: updated });
  };

  return (
    <div>
      {variants.map((group, gi) => (
        <div key={gi} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginBottom: 12, background: '#fafafa' }}>
          {/* Group header — text input only, no dropdown */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input
              value={group.name}
              onChange={e => updateGroupName(gi, e.target.value)}
              placeholder="e.g. Size, Color, Add-ons, Toppings..."
              style={{ flex: 1, fontWeight: 600, fontSize: 13, padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none', background: 'white' }}
            />
            <button
              type="button"
              onClick={() => removeGroup(gi)}
              style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, fontSize: 18, lineHeight: 1 }}
            >✕</button>
          </div>

          {/* Options */}
          {(group.options || []).map((option, oi) => (
            <div key={oi} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <input
                value={option.label}
                onChange={e => updateOptionLabel(gi, oi, e.target.value)}
                placeholder="Option name"
                style={{ flex: 1, padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', background: 'white' }}
              />
              <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0 }}>+{formData.currency || 'SGD'}</span>
              <input
                type="number"
                inputMode="decimal"
                value={option.price_modifier ?? ''}
                onChange={e => updateOptionPrice(gi, oi, e.target.value)}
                placeholder="0"
                style={{ width: 72, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', background: 'white', textAlign: 'right' }}
              />
              <button
                type="button"
                onClick={() => removeOption(gi, oi)}
                style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, fontSize: 16 }}
              >✕</button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => addOption(gi)}
            style={{ fontSize: 12, color: 'rgb(var(--color-primary))', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginTop: 4 }}
          >+ Add option</button>
        </div>
      ))}

      <button
        type="button"
        onClick={addGroup}
        style={{ width: '100%', padding: 10, border: '1.5px dashed rgb(var(--color-primary))', borderRadius: 8, background: 'none', cursor: 'pointer', color: 'rgb(var(--color-primary))', fontSize: 13, fontWeight: 600 }}
      >+ Add variant group</button>
    </div>
  );
}