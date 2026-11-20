// deno test --no-check --no-config --allow-all supabase/functions/scanMenu/index.test.ts
// (--no-check: index.ts has three type warnings from before v22 that Supabase's deploy ignores.)
// scanMenu v22 (Alvin, 20 Nov 2026: "enhance the keyword searches for those images for Pixabay so
// that it encompasses all possible food choices as well as for the hawker or even the F&B line"):
// each item read from a menu also gets photo_search, a few English words for its sample photo,
// from what the menu shows. No AI is called here: the format, the instructions and the clean-up.
import { deepStrictEqual as assertEquals, ok as assert } from 'node:assert/strict';

Object.defineProperty(Deno, 'serve', { value: () => ({ finished: Promise.resolve() }), configurable: true });
const { MENU_TOOL, menuPrompt, menuItems, answerFromText, cleanPhotoWords } = await import('./index.ts');

Deno.test('The AI is asked for photo_search on each item, with what the menu shows deciding the dish', () => {
  const item = (MENU_TOOL as any).input_schema.properties.sections.items.properties.items.items;
  assertEquals(item.properties.photo_search.type, 'string');
  assert(!item.required.includes('photo_search'), 'not required: an answer without it still reads');
  const prompt = menuPrompt({ currency: 'SGD', country: 'Singapore', width: 1000, height: 1400 });
  assert(prompt.includes('- photo_search: 2 to 4 plain English words'));
  assert(prompt.includes('"fried radish cake" for a hawker stall\'s "Carrot Cake" (a cafe\'s "Carrot Cake" is "carrot cake")'));
  assert(prompt.includes('Use what the menu shows (the kind of shop, the section, the item\'s picture) to tell which dish it is.'));
  assert(menuPrompt({ currency: 'SGD', asText: true }).includes('"photo_search": "milk coffee"'), 'the text answer\'s example has it too');
});

Deno.test('photo_search is kept as at most 5 plain English words', () => {
  assertEquals(cleanPhotoWords('Iced milk-tea!'), 'Iced milk-tea');
  assertEquals(cleanPhotoWords('  fried   radish cake '), 'fried radish cake');
  assertEquals(cleanPhotoWords('one two three four five six seven'), 'one two three four five');
  assertEquals(cleanPhotoWords('chicken rice 鸡饭 (S$5)'), 'chicken rice S');
  assertEquals(cleanPhotoWords(42), '');
  assertEquals(cleanPhotoWords(undefined), '');
  const items = menuItems({ sections: [{ title: 'Drinks', items: [
    { name: 'Teh C Peng', price: 2, photo_search: 'iced milk tea' },
    { name: 'Kopi', price: 1.8 },
    { name: 'Carrot Cake', price: 4, photo_search: 'fried radish cake' },
  ] }] });
  assertEquals(items.map((i: any) => [i.name, i.photoSearch]), [['Teh C Peng', 'iced milk tea'], ['Kopi', ''], ['Carrot Cake', 'fried radish cake']]);
});

Deno.test('An answer given as text keeps photo_search too', () => {
  const answer = answerFromText('```json\n{"sections": [{"title": "Mains", "items": [{"name": "Classic Club Sandwich", "price": 10.99, "photo_search": "club sandwich"}]}]}\n```');
  assertEquals(menuItems(answer).map((i: any) => [i.name, i.price, i.photoSearch]), [['Classic Club Sandwich', 10.99, 'club sandwich']]);
});
