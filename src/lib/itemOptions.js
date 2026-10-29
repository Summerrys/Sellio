// An item's options (sizes, add-ons) as a buyer picks them — the same rules on the shop
// page's item screen and on an Explore listing, so both put the same line in the cart:
//   • Grouped options ([{ name, type, options: [{ label, price_modifier }] }]) are used as
//     stored. An older item keeps one flat list ([{ size: 'SMALL', price: 4.5 }, …]); that
//     is read as one group, each choice's extra price worked out from the item's price.
//   • An 'addon' group: pick any. Every other group: pick one, and the item can't be added
//     until it is picked (the product editor tells sellers "Customer picks exactly one") —
//     except an older flat list of extras, which stays optional (isRequiredChoice).
//   • The picks become one cart option, the way checkout (place_order) reads it: labels
//     in group order (add-ons in the order picked), joined with ", ", extra prices added up.
// Picks are kept as { [group index]: choice } for a pick-one group and
// { [group index]: [choice, …] } for an add-on group.

const KNOWN = ['size', 'color', 'colour', 'addon', 'flavour', 'flavor', 'type', 'option', 'variant'];

export function normaliseVariants(rawVariants, basePrice) {
  if (!rawVariants?.length) return [];
  if (rawVariants[0]?.options) return rawVariants;
  const firstItem = rawVariants[0];
  const keys = Object.keys(firstItem || {});
  const vKey = keys.find(k => KNOWN.includes(k.toLowerCase())) || keys.find(k => k !== 'price' && k !== 'price_modifier');
  if (vKey) {
    const prices = rawVariants.map(v => parseFloat(v.price) || 0).filter(p => p > 0);
    const base = parseFloat(basePrice) > 0 ? parseFloat(basePrice) : (prices.length ? Math.min(...prices) : 0);
    const groupName = vKey.charAt(0).toUpperCase() + vKey.slice(1).toLowerCase();
    return [{ name: groupName, options: rawVariants.map(v => ({ label: String(v[vKey] || ''), price_modifier: Math.max(0, Math.round((parseFloat(v.price || 0) - base) * 100) / 100) })) }];
  }
  return [{ name: 'Options', options: rawVariants.map(v => ({ label: v.name || v.label || '', price_modifier: v.price_modifier || 0 })) }];
}

// 'addon' groups are pick-any (in any letter case, as checkout and the counter read it).
export const isMultiChoice = (group) => String(group?.type || '').toLowerCase() === 'addon';

// Must be answered: a pick-one group from the product editor ("Customer picks exactly one"),
// or an older flat list of sizes, colours or flavours. An older flat list of extras was never
// a choice buyers had to make, so it stays optional; a group with nothing in it never blocks.
const PICK_ONE_LISTS = new Set(['size', 'color', 'colour', 'flavour', 'flavor', 'type', 'option', 'variant']);
export function isRequiredChoice(group) {
  if (isMultiChoice(group) || !Array.isArray(group?.options) || group.options.length === 0) return false;
  if (group.type) return true;
  return PICK_ONE_LISTS.has(String(group.name || '').toLowerCase());
}

// Tapping a choice: a pick-one group takes it in place of the last one; an add-on
// group adds it, or takes it off again.
export function pickOption(picks, groups, groupIndex, option) {
  if (isMultiChoice(groups?.[groupIndex])) {
    const current = Array.isArray(picks?.[groupIndex]) ? picks[groupIndex] : [];
    const exists = current.some(v => v.label === option.label);
    return { ...picks, [groupIndex]: exists ? current.filter(v => v.label !== option.label) : [...current, option] };
  }
  return { ...picks, [groupIndex]: option };
}

export function isPicked(picks, groups, groupIndex, option) {
  const picked = picks?.[groupIndex];
  if (isMultiChoice(groups?.[groupIndex])) return Array.isArray(picked) && picked.some(v => v.label === option.label);
  return !!picked && !Array.isArray(picked) && picked.label === option.label;
}

// The picks as the cart line's option: { label, price_modifier }, or null for none.
export function combineChoices(picks) {
  const all = Object.values(picks || {}).flatMap(v => (Array.isArray(v) ? v : (v ? [v] : [])));
  return all.length > 0
    ? { label: all.map(v => v.label).join(', '), price_modifier: all.reduce((sum, v) => sum + (v.price_modifier || 0), 0) }
    : null;
}

// The pick-one groups still waiting for a choice.
export function missingChoices(groups, picks) {
  return (groups || []).filter((group, gi) => {
    if (!isRequiredChoice(group)) return false;
    const picked = picks?.[gi];
    return !picked || Array.isArray(picked);
  });
}

// "Choose a size", "Choose an ice level", or "Choose an option" for a group with no name.
export function chooseLabel(group) {
  const name = String(group?.name || '').trim();
  if (!name) return 'Choose an option';
  const lower = name.toLowerCase();
  if (!/^[a-z]/.test(lower)) return `Choose ${name}`;
  return `Choose ${/^[aeiou]/.test(lower) ? 'an' : 'a'} ${lower}`;
}
