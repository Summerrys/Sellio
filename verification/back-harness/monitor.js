// Imported first by app.jsx, so it sits under Sellio's history guard: records every
// history entry the page really adds, with whether the browser would honour it — a real
// tap or key press since the page loaded and since the person's last Back / Forward (the
// page's own history.back()/forward() don't reset that). An entry added without one makes
// Android skip the page's whole history, and Back finds nothing.
window.__pushes = [];
let lastTap = 0;
let lastPersonsTraversal = 0;
let ownTraversals = 0;
for (const type of ['pointerup', 'mousedown', 'keydown']) {
  window.addEventListener(type, (event) => {
    if (event.isTrusted && !(type === 'keydown' && event.key === 'Escape')) lastTap = performance.now();
  }, true);
}
for (const name of ['back', 'forward', 'go']) {
  const original = history[name];
  history[name] = function traverse(...args) { ownTraversals += 1; return original.apply(this, args); };
}
window.addEventListener('popstate', () => {
  if (ownTraversals > 0) ownTraversals -= 1;
  else lastPersonsTraversal = performance.now();
}, true);
const push = history.pushState;
history.pushState = function pushState(state, ...rest) {
  window.__pushes.push({
    ours: !!state?.sellioOverlay,
    path: String(rest[1] ?? location.pathname),
    honoured: lastTap > 0 && lastTap > lastPersonsTraversal,
  });
  return push.call(this, state, ...rest);
};
