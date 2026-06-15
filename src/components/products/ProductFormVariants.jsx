import React from 'react';

export default function ProductFormVariants({ formData, onChange }) {
  const variants = formData.variants || [];
  const currency = formData.currency || 'SGD';

  const inferType = (name) => {
    if (!name) return 'other';
    const n = name.toLowerCase();
    if (/size|small|medium|large/.test(n)) return 'size';
    if (/colou?r/.test(n)) return 'color';
    if (/add.?on|topping|extra/.test(n)) return 'addon';
    return 'other';
  };

  const getOptionLabel = (group) => {
    const n = (group.name || '').toLowerCase();
    if (/size/.test(n)) return 'Size';
    if (/colou?r/.test(n)) return 'Colour';
    if (/add.?on|topping|extra/.test(n)) return 'Add-on';
    if (/price/.test(n)) return 'Price';
    if (group.name?.trim()) return group.name;
    return 'Option';
  };

  const addGroup = () => {
    onChange({ variants: [...variants, { name: '', type: 'other', options: [{ label: '', price_modifier: 0 }] }] });
  };

  const removeGroup = (gi) => onChange({ variants: variants.filter((_, i) => i !== gi) });

  const addOption = (gi) => {
    const updated = variants.map((g, i) => i === gi ? { ...g, options: [...(g.options || []), { label: '', price_modifier: 0 }] } : g);
    onChange({ variants: updated });
  };

  const removeOption = (gi, oi) => {
    const updated = variants.map((g, i) => i === gi ? { ...g, options: (g.options || []).filter((_, j) => j !== oi) } : g);
    onChange({ variants: updated });
  };

  const updateGroupName = (gi, value) => {
    const updated = variants.map((g, i) => i === gi ? { ...g, name: value, type: inferType(value) } : g);
    onChange({ variants: updated });
  };

  const updateOptionLabel = (gi, oi, value) => {
    const updated = variants.map((g, i) =>
      i === gi ? { ...g, options: (g.options || []).map((o, j) => j === oi ? { ...o, label: value } : o) } : g
    );
    onChange({ variants: updated });
  };

  const updateOptionPrice = (gi, oi, value) => {
    const updated = variants.map((g, i) =>
      i === gi ? { ...g, options: (g.options || []).map((o, j) => j === oi ? { ...o, price_modifier: value === '' ? 0 : parseFloat(value) || 0 } : o) } : g
    );
    onChange({ variants: updated });
  };

  return (
    <div>
      {variants.map((group, gi) => (
        <div key={gi} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, marginBottom: 12, background: '#fafafa' }}>
          {/* Group name row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Group Name</label>
              <input
                value={group.name}
                onChange={e => updateGroupName(gi, e.target.value)}
                placeholder="e.g. Size, Color, Toppings, Add-ons..."
                style={{ width: '100%', fontWeight: 600, fontSize: 13, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none', background: 'white', boxSizing: 'border-box' }}
              />
            </div>
            <button
              type="button"
              onClick={() => removeGroup(gi)}
              style={{ color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', flexShrink: 0, marginTop: 18, display: 'flex', alignItems: 'center' }}
            >✕</button>
          </div>

          {/* Column headers */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 4, paddingLeft: 2 }}>
            <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{getOptionLabel(group)}</span>
            <span style={{ width: 90, fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right', flexShrink: 0 }}>+{currency}</span>
            <span style={{ width: 24, flexShrink: 0 }} />
          </div>

          {/* Options */}
          {(group.options || []).map((option, oi) => (
            <div key={oi} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <input
                value={option.label ?? ''}
                onChange={e => updateOptionLabel(gi, oi, e.target.value)}
                placeholder={`${getOptionLabel(group)} name`}
                style={{ flex: 1, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', background: 'white' }}
              />
              <input
                type="number"
                inputMode="decimal"
                value={option.price_modifier ?? 0}
                onChange={e => updateOptionPrice(gi, oi, e.target.value)}
                placeholder="0"
                style={{ width: 90, padding: '7px 8px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', background: 'white', textAlign: 'right', flexShrink: 0 }}
              />
              <button
                type="button"
                onClick={() => removeOption(gi, oi)}
                style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, fontSize: 16, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => addOption(gi)}
            style={{ fontSize: 12, color: 'rgb(var(--color-primary))', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginTop: 6 }}
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