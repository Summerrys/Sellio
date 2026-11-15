// The order helpers behind putting product photos in order (src/lib/photoOrder.js).
//   node verification/photo-order.test.mjs
import assert from 'node:assert/strict';
import { moveItem, nearestPlace } from '../src/lib/photoOrder.js';

let passes = 0;
const passed = (name) => { passes++; console.log('PASS ' + name); };

const list = ['a', 'b', 'c', 'd'];
assert.deepEqual(moveItem(list, 2, 0), ['c', 'a', 'b', 'd'], 'to the front: the others shift along');
assert.deepEqual(moveItem(list, 0, 3), ['b', 'c', 'd', 'a'], 'to the end');
assert.deepEqual(moveItem(list, 1, 2), ['a', 'c', 'b', 'd'], 'one place later');
assert.deepEqual(moveItem(list, 3, 1), ['a', 'd', 'b', 'c'], 'from the end, one place from the front');
assert.deepEqual(list, ['a', 'b', 'c', 'd'], 'the list given is left as it is');
for (const [from, to] of [[1, 1], [-1, 0], [0, 4], [4, 0], [0.5, 1], [undefined, 1]]) {
  assert.deepEqual(moveItem(list, from, to), list, `${from} → ${to} changes nothing`);
}
assert.notEqual(moveItem(list, 1, 1), list, 'always a new list');
passed('moveItem: one photo moves, the others shift along; places outside the list change nothing');

const places = [0, 1, 2, 3].map((i) => ({ x: (i % 2) * 100, y: Math.floor(i / 2) * 100, w: 90, h: 90 }));
assert.equal(nearestPlace(places, 45, 45), 0);
assert.equal(nearestPlace(places, 150, 40), 1);
assert.equal(nearestPlace(places, 60, 140), 2, 'second row');
assert.equal(nearestPlace(places, 500, 500, 112), -1, 'too far from every place');
assert.equal(nearestPlace(places, 190, 190, 112), 3, 'near enough');
assert.equal(nearestPlace([], 0, 0), -1);
passed('nearestPlace: the place nearest the finger, or none when it is too far');

console.log(`\n${passes} photo order checks passed`);
