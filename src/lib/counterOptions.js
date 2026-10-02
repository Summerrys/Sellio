// The product editor stores only addon groups as multiple choice.
// All other grouped types (other, size, color, legacy values) are single choice.
const KNOWN_VARIANT_KEYS = ['size', 'color', 'colour', 'addon', 'flavour', 'flavor', 'type', 'option', 'variant'];

export function getCounterOptionGroups(product) {
  const raw = Array.isArray(product?.variants) ? product.variants : [];
  if (!raw.length) return [];
  if (raw[0] && Array.isArray(raw[0].options)) {
    return raw.filter(g => Array.isArray(g.options) && g.options.length).map(g => ({
      name: g.name || 'Options',
      multiple: String(g.type || '').toLowerCase() === 'addon',
      required: String(g.type || '').toLowerCase() !== 'addon',
      options: g.options.map(o => ({ label: String(o.label ?? ''), price: Number(o.price_modifier) || 0 })),
    }));
  }
  const keys = Object.keys(raw[0] || {});
  const vKey = keys.find(k => KNOWN_VARIANT_KEYS.includes(k.toLowerCase())) || keys.find(k => k !== 'price' && k !== 'price_modifier');
  if (vKey) {
    const prices = raw.map(v => parseFloat(v.price) || 0).filter(p => p > 0);
    const base = parseFloat(product.price) > 0 ? parseFloat(product.price) : (prices.length ? Math.min(...prices) : 0);
    return [{
      name: vKey.charAt(0).toUpperCase() + vKey.slice(1).toLowerCase(),
      multiple: false, required: true,
      options: raw.map(v => ({
        label: String(v[vKey] ?? ''),
        price: Math.max(0, Math.round(((parseFloat(v.price) || 0) - base) * 100) / 100),
      })),
    }];
  }
  return [{ name: 'Options', multiple: false, required: true, options: raw.map(v => ({ label: String(v.name || v.label || ''), price: Number(v.price_modifier) || 0 })) }];
}

export function toggleCounterOption(selections, group, label) {
  const on = selections.some(x => x.group === group.name && x.label === label);
  if (!group.multiple) {
    return [...selections.filter(x => x.group !== group.name), { group: group.name, label }];
  }
  return on ? selections.filter(x => !(x.group === group.name && x.label === label))
    : [...selections, { group: group.name, label }];
}

export function validCounterOptions(groups, selections) {
  const seen = new Set();
  for (const choice of selections) {
    const group = groups.find(g => g.name === choice.group);
    const key = JSON.stringify([choice.group, choice.label]);
    if (!group || !group.options.some(o => o.label === choice.label) || seen.has(key)) return false;
    seen.add(key);
  }
  return groups.every(group => {
    const count = selections.filter(x => x.group === group.name).length;
    return (!group.required || count > 0) && (group.multiple || count <= 1);
  });
}
