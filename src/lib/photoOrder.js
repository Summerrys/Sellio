// Putting a product's photos in order (components/ui-custom/PhotoOrderGrid.jsx). The first
// photo is the cover.

// The list with one item moved to another place, the others shifting along one place
// (Alvin, 16 Nov 2026: "Others shift along"): moveItem(['a', 'b', 'c'], 2, 0) → ['c', 'a', 'b'].
// A place outside the list leaves it as it is.
export function moveItem(list, from, to) {
  const next = [...list];
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return next;
  if (from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// The place ({ x, y, w, h }) whose middle is nearest the point, or -1 when even that one is
// further than `reach` from it (a photo dragged well away from the others stays where it is).
export function nearestPlace(places, x, y, reach = Infinity) {
  let best = -1;
  let bestDistance = Infinity;
  places.forEach((place, i) => {
    const distance = Math.hypot(x - (place.x + place.w / 2), y - (place.y + place.h / 2));
    if (distance < bestDistance) { bestDistance = distance; best = i; }
  });
  return bestDistance <= reach ? best : -1;
}
