// Moving products within their section (Alvin, 20 Nov 2026: hold an item and drag it to
// rearrange). Lists sort by sort_order, then newest first, then id (storefrontCatalog.js,
// applyCanonicalProductOrder); a move saves new sort_order values for the rows that change.

// `list` with the item at `from` moved to `to` (a new array).
export function moveItem(list, from, to) {
  const next = list.slice();
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const orderOf = (p) => Number(p?.sort_order) || 0;

// The rows of one section to change so it lists in `ordered` (its products, in their new order):
// [{ id, sort_order, before }]. The section keeps the numbers it had (they must all be different),
// so it keeps its place among the shop's other numbers.
export function sectionSortOrders(ordered) {
  const next = ordered.map(orderOf).sort((a, b) => a - b);
  return ordered
    .map((p, i) => ({ id: p.id, sort_order: next[i], before: orderOf(p) }))
    .filter((change) => change.sort_order !== change.before);
}

// Every product numbered 1, 2, 3… in the order given: the rows to change.
export function renumberAll(ordered) {
  return ordered
    .map((p, i) => ({ id: p.id, sort_order: i + 1, before: orderOf(p) }))
    .filter((change) => change.sort_order !== change.before);
}

// A move in one section: `sections` are the shop's sections in menu order, each its products in
// their order; the item at `from` in sections[index] goes to `to`. The rows to change, as above.
// A section whose numbers are all different keeps them (a scanned menu or an imported list, or
// one already moved). One with numbers alike (items added one at a time are all 0, ordered newest
// first) can't be ordered by its own numbers, so the whole shop is numbered in menu order once:
// numbering that section alone would mix it in among the others where products show in one list
// (the storefront's All).
export function planMove(sections, index, from, to) {
  const section = sections[index] || [];
  const moved = moveItem(section, from, to);
  if (moved.every((p, i) => p === section[i])) return [];
  const values = section.map(orderOf);
  if (new Set(values).size === values.length) return sectionSortOrders(moved);
  return renumberAll(sections.flatMap((items, i) => (i === index ? moved : items)));
}

// The lists' order, for re-sorting products held on the phone after a move (as the database
// sorts them: sort_order, then newest first, then id).
export function compareProducts(a, b) {
  const byOrder = orderOf(a) - orderOf(b);
  if (byOrder) return byOrder;
  const newer = (Date.parse(b?.created_date) || 0) - (Date.parse(a?.created_date) || 0);
  if (newer) return newer;
  const ia = String(a?.id ?? '');
  const ib = String(b?.id ?? '');
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}

// `products` with the changes applied, in the lists' order.
export function withSortOrders(products, changes) {
  const byId = new Map(changes.map((c) => [String(c.id), c.sort_order]));
  return products
    .map((p) => (byId.has(String(p.id)) ? { ...p, sort_order: byId.get(String(p.id)) } : p))
    .sort(compareProducts);
}
