import React, { useState } from 'react';

export default function ProductFormVariants({ formData, onChange }) {
  const [newVariant, setNewVariant] = useState({ name: '', price_modifier: 0 });
  const variants = formData.variants || [];

  const addGroup = () => {
    onChange({
      variants: [...variants, { name: '', type: 'other', options: [{ label: '', price_modifier: 0 }] }],
    });
  };

  const removeGroup = (groupIndex) => {
    onChange({ variants: variants.filter((_, i) => i !== groupIndex) });
  };

  const addOption = (groupIndex) => {
    const updated = variants.map((g, i) =>
      i === groupIndex ? { ...g, options: [...g.options, { label: '', price_modifier: 0 }] } : g
    );
    onChange({ variants: updated });
  };

  const removeOption = (groupIndex, optIndex) => {
    const updated = variants.map((g, i) =>
      i === groupIndex ? { ...g, options: g.options.filter((_, oi) => oi !== optIndex) } : g
    );
    onChange({ variants: updated });
  };

  const updateGroupName = (groupIndex, value) => {
    const type =
      /size/i.test(value) ? 'size' :
      /colou?r/i.test(value) ? 'color' :
      /add.?on|topping|extra/i.test(value) ? 'addon' : 'other';
    const updated = variants.map((g, i) => i === groupIndex ? { ...g, name: value, type } : g);
    onChange({ variants: updated });
  };

  const updateGroupType = (groupIndex, value) => {
    const updated = variants.map((g, i) => i === groupIndex ? { ...g, type: value } : g);
    onChange({ variants: updated });
  };

  const updateOptionLabel = (groupIndex, optIndex, value) => {
    const updated = variants.map((g, i) =>
      i === groupIndex
        ? { ...g, options: g.options.map((o, oi) => oi === optIndex ? { ...o, label: value } : o) }
        : g
    );
    onChange({ variants: updated });
  };

  const updateOptionPrice = (groupIndex, optIndex, value) => {
    const updated = variants.map((g, i) =>
      i === groupIndex
        ? { ...g, options: g.options.map((o, oi) => oi === optIndex ? { ...o, price_modifier: parseFloat(value) || 0 } : o) }
        : g
    );
    onChange({ variants: updated });
  };

  // Legacy flat-variant helpers (kept for UI compatibility during transition)
  const addVariant = () => {
    if (!newVariant.name.trim()) return;
    onChange({
      variants: [
        ...variants,
        { name: newVariant.name.trim(), price_modifier: parseFloat(newVariant.price_modifier) || 0 },
      ],
    });
    setNewVariant({ name: '', price_modifier: 0 });
  };

  const removeVariant = (index) => {
    onChange({ variants: variants.filter((_, i) => i !== index) });
  };

  return (
    <div>
      {variants.map((group, groupIndex) => (
        <div key={groupIndex} style={{
          border: '0.5px solid #e5e7eb',
          borderRadius: '12px',
          padding: '12px',
          marginBottom: '12px',
          background: '#fafafa'
        }}>
          {/* Group header */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
            <input
              value={group.name}
              onChange={(e) => updateGroupName(groupIndex, e.target.value)}
              placeholder="Group name e.g. Size, Add-ons"
              style={{ flex: 1, fontWeight: '600', fontSize: '13px' }}
            />
            <select
              value={group.type}
              onChange={(e) => updateGroupType(groupIndex, e.target.value)}
              style={{ width: '90px', fontSize: '12px', flexShrink: 0 }}
            >
              <option value="size">Size</option>
              <option value="color">Color</option>
              <option value="addon">Add-on</option>
              <option value="other">Other</option>
            </select>
            <button
              onClick={() => removeGroup(groupIndex)}
              style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, fontSize: '16px' }}
            >✕</button>
          </div>

          {/* Options */}
          {(group.options || []).map((option, optIndex) => (
            <div key={optIndex} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
              <input
                value={option.label}
                onChange={(e) => updateOptionLabel(groupIndex, optIndex, e.target.value)}
                placeholder="Option name"
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '12px', color: '#6b7280', flexShrink: 0 }}>+SGD</span>
              <input
                type="number"
                inputMode="decimal"
                value={option.price_modifier || ''}
                onChange={(e) => updateOptionPrice(groupIndex, optIndex, e.target.value)}
                placeholder="0"
                style={{ width: '70px', flexShrink: 0 }}
              />
              <button
                onClick={() => removeOption(groupIndex, optIndex)}
                style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
              >✕</button>
            </div>
          ))}

          <button
            onClick={() => addOption(groupIndex)}
            style={{ fontSize: '12px', color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginTop: '4px' }}
          >+ Add option</button>
        </div>
      ))}

      <button
        onClick={addGroup}
        style={{
          width: '100%', padding: '10px',
          border: '1px dashed #d1d5db',
          borderRadius: '8px',
          background: 'none', cursor: 'pointer',
          color: '#7c3aed', fontSize: '13px', fontWeight: '600'
        }}
      >+ Add variant group</button>
    </div>
  );
}