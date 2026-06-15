import React, { useState } from 'react';
import { Plus, Trash2, Check, X } from 'lucide-react';

const VARIANT_TYPE_COLORS = {
  size:  { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', dot: '#3b82f6' },
  color: { bg: '#fdf4ff', border: '#e9d5ff', text: '#7e22ce', dot: '#a855f7' },
  addon: { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', dot: '#f97316' },
  other: { bg: '#f8fafc', border: '#e2e8f0', text: '#475569', dot: '#94a3b8' },
};

const inferType = (name) => {
  if (!name) return 'other';
  const n = name.toLowerCase();
  if (/size|small|medium|large|regular|xl/.test(n)) return 'size';
  if (/colou?r/.test(n)) return 'color';
  if (/add.?on|topping|extra|sauce|syrup/.test(n)) return 'addon';
  return 'other';
};

function OptionChip({ option, onEdit, onRemove, currency }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px 6px 12px',
        background: 'white',
        border: '1.5px solid #e2e8f0',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 500,
        color: '#334155',
        cursor: 'pointer',
        userSelect: 'none',
        minHeight: 36,
        touchAction: 'manipulation',
      }}
      onClick={onEdit}
    >
      <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {option.label || 'Untitled'}
      </span>
      {option.price_modifier !== 0 && (
        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400, flexShrink: 0 }}>
          {option.price_modifier > 0 ? '+' : ''}{currency} {parseFloat(option.price_modifier || 0).toFixed(2)}
        </span>
      )}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onRemove(); }}
        style={{
          width: 18, height: 18, borderRadius: '50%', background: '#f1f5f9',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0, padding: 0,
        }}
        aria-label="Remove option"
      >
        <X style={{ width: 10, height: 10, color: '#94a3b8' }} />
      </button>
    </div>
  );
}

function OptionEditor({ option, onSave, onCancel, currency, placeholder }) {
  const [label, setLabel] = useState(option.label || '');
  const [price, setPrice] = useState(option.price_modifier !== undefined ? String(option.price_modifier) : '0');

  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'center',
      padding: '8px 10px', background: '#f8fafc',
      border: '1.5px solid rgb(var(--color-primary))',
      borderRadius: 10, marginTop: 6,
    }}>
      <input
        autoFocus
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder={placeholder || 'Option name'}
        style={{
          flex: 1, fontSize: 13, padding: '7px 10px',
          border: '1px solid #e2e8f0', borderRadius: 8,
          outline: 'none', background: 'white', minWidth: 0,
        }}
        onKeyDown={e => { if (e.key === 'Enter') onSave({ label, price_modifier: parseFloat(price) || 0 }); if (e.key === 'Escape') onCancel(); }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>+{currency}</span>
        <input
          type="number"
          inputMode="decimal"
          value={price}
          onChange={e => setPrice(e.target.value)}
          placeholder="0"
          style={{
            width: 68, fontSize: 13, padding: '7px 8px',
            border: '1px solid #e2e8f0', borderRadius: 8,
            outline: 'none', background: 'white', textAlign: 'right',
          }}
          onKeyDown={e => { if (e.key === 'Enter') onSave({ label, price_modifier: parseFloat(price) || 0 }); }}
        />
      </div>
      <button
        type="button"
        onClick={() => onSave({ label, price_modifier: parseFloat(price) || 0 })}
        style={{
          width: 32, height: 32, borderRadius: 8, background: 'rgb(var(--color-primary))',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0,
        }}
        aria-label="Save option"
      >
        <Check style={{ width: 14, height: 14, color: 'white' }} />
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          width: 32, height: 32, borderRadius: 8, background: '#f1f5f9',
          border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
        aria-label="Cancel"
      >
        <X style={{ width: 14, height: 14, color: '#94a3b8' }} />
      </button>
    </div>
  );
}

export default function ProductFormVariants({ formData, onChange }) {
  const variants = formData.variants || [];
  const currency = formData.currency || 'SGD';
  const [editingOption, setEditingOption] = useState(null);

  const addGroup = () => {
    const newVariants = [...variants, { name: '', type: 'other', options: [] }];
    onChange({ variants: newVariants });
    setEditingOption({ gi: newVariants.length - 1, oi: 'new' });
  };

  const removeGroup = (gi) => {
    setEditingOption(null);
    onChange({ variants: variants.filter((_, i) => i !== gi) });
  };

  const updateGroupName = (gi, value) => {
    const updated = variants.map((g, i) =>
      i === gi ? { ...g, name: value, type: inferType(value) } : g
    );
    onChange({ variants: updated });
  };

  const saveOption = (gi, oi, data) => {
    if (!data.label?.trim()) { setEditingOption(null); return; }
    const updated = variants.map((g, i) => {
      if (i !== gi) return g;
      const opts = [...(g.options || [])];
      if (oi === 'new') {
        opts.push({ label: data.label.trim(), price_modifier: data.price_modifier || 0 });
      } else {
        opts[oi] = { ...opts[oi], label: data.label.trim(), price_modifier: data.price_modifier || 0 };
      }
      return { ...g, options: opts };
    });
    onChange({ variants: updated });
    setEditingOption(null);
  };

  const removeOption = (gi, oi) => {
    setEditingOption(null);
    const updated = variants.map((g, i) =>
      i === gi ? { ...g, options: (g.options || []).filter((_, j) => j !== oi) } : g
    );
    onChange({ variants: updated });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {variants.map((group, gi) => {
        const typeKey = group.type || inferType(group.name) || 'other';
        const colors = VARIANT_TYPE_COLORS[typeKey] || VARIANT_TYPE_COLORS.other;
        const isEditingNew = editingOption?.gi === gi && editingOption?.oi === 'new';

        return (
          <div
            key={gi}
            style={{
              border: `1.5px solid ${colors.border}`,
              borderRadius: 14,
              background: colors.bg,
              overflow: 'hidden',
            }}
          >
            {/* Group header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px 8px',
              borderBottom: `1px solid ${colors.border}`,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: colors.dot, flexShrink: 0,
              }} />
              <input
                value={group.name}
                onChange={e => updateGroupName(gi, e.target.value)}
                placeholder="Group name  (e.g. Size, Add-ons…)"
                style={{
                  flex: 1, fontSize: 13, fontWeight: 600,
                  color: colors.text,
                  background: 'transparent', border: 'none',
                  outline: 'none', padding: 0,
                  minWidth: 0,
                }}
              />
              <button
                type="button"
                onClick={() => removeGroup(gi)}
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: '#fef2f2', border: '1px solid #fecaca',
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0,
                }}
                aria-label="Remove group"
              >
                <Trash2 style={{ width: 13, height: 13, color: '#ef4444' }} />
              </button>
            </div>

            {/* Options area */}
            <div style={{ padding: '10px 12px 12px' }}>
              {(group.options || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {(group.options || []).map((option, oi) => {
                    if (editingOption?.gi === gi && editingOption?.oi === oi) {
                      return (
                        <div key={oi} style={{ width: '100%' }}>
                          <OptionEditor
                            option={option}
                            currency={currency}
                            placeholder={group.name ? `${group.name} name` : 'Option name'}
                            onSave={(data) => saveOption(gi, oi, data)}
                            onCancel={() => setEditingOption(null)}
                          />
                        </div>
                      );
                    }
                    return (
                      <OptionChip
                        key={oi}
                        option={option}
                        currency={currency}
                        onEdit={() => setEditingOption({ gi, oi })}
                        onRemove={() => removeOption(gi, oi)}
                      />
                    );
                  })}
                </div>
              )}

              {isEditingNew && (
                <OptionEditor
                  option={{ label: '', price_modifier: 0 }}
                  currency={currency}
                  placeholder={group.name ? `${group.name} name` : 'Option name'}
                  onSave={(data) => saveOption(gi, 'new', data)}
                  onCancel={() => setEditingOption(null)}
                />
              )}

              {!isEditingNew && (
                <button
                  type="button"
                  onClick={() => setEditingOption({ gi, oi: 'new' })}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 12, fontWeight: 600, color: colors.text,
                    background: 'white', border: `1.5px dashed ${colors.border}`,
                    borderRadius: 999, padding: '5px 12px',
                    cursor: 'pointer', minHeight: 32, touchAction: 'manipulation',
                  }}
                >
                  <Plus style={{ width: 12, height: 12 }} />
                  Add option
                </button>
              )}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addGroup}
        style={{
          width: '100%', padding: '11px 16px',
          border: '1.5px dashed rgb(var(--color-primary))',
          borderRadius: 12, background: 'transparent',
          cursor: 'pointer', color: 'rgb(var(--color-primary))',
          fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          minHeight: 44, touchAction: 'manipulation',
        }}
      >
        <Plus style={{ width: 15, height: 15 }} />
        Add variant group
      </button>
    </div>
  );
}