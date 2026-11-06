// A public page's own title, description, canonical address and robots rule while it is shown,
// put back as they were when it goes (the same as LandingPage, LegalPage and Storefront do
// inline). Search engines read them after running the page (Explore and its item pages are
// client-rendered; see public/_worker.js and src/App.jsx RouteIndexingGuard).
export const SITE = 'https://sellio.sg';

// Returns the undo, for a useEffect cleanup.
export function applyPageMeta({ title, description, canonical, robots } = {}, doc = document) {
  const undo = [];

  if (title) {
    const previous = doc.title;
    doc.title = title;
    undo.push(() => { doc.title = previous; });
  }

  const set = (selector, make, attribute, value) => {
    let node = doc.head.querySelector(selector);
    const created = !node;
    if (created) {
      node = make();
      doc.head.appendChild(node);
    }
    const previous = node.getAttribute(attribute);
    node.setAttribute(attribute, value);
    undo.push(() => {
      if (created) node.remove();
      else if (previous === null) node.removeAttribute(attribute);
      else node.setAttribute(attribute, previous);
    });
  };
  const meta = (key, name, value) => set(`meta[${key}="${name}"]`, () => {
    const node = doc.createElement('meta');
    node.setAttribute(key, name);
    return node;
  }, 'content', value);

  if (description) {
    meta('name', 'description', description);
    meta('property', 'og:description', description);
  }
  if (title) meta('property', 'og:title', title);
  if (canonical) {
    set('link[rel="canonical"]', () => {
      const node = doc.createElement('link');
      node.setAttribute('rel', 'canonical');
      return node;
    }, 'href', canonical);
    meta('property', 'og:url', canonical);
  }
  if (robots) meta('name', 'robots', robots);

  return () => { undo.reverse().forEach((step) => step()); };
}

// One line of an item's own description for search results: its words, at most `max`
// characters, cut at a word.
export function snippet(text, max = 155) {
  const words = String(text || '').replace(/\s+/g, ' ').trim();
  if (words.length <= max) return words;
  const cut = words.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}
