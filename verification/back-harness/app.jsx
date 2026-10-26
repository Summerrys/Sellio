// A small app for verification/back-navigation.browser.mjs: windows, nested windows, a
// step-by-step screen and links, all on Sellio's useBackToClose, in a real browser.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { useBackToClose, handOverBackStep } from '../../src/lib/useBackToClose.js';

// Every history entry added, with whether the browser would count it as made by the
// person: a tap in the last few seconds AND one since the last Back / Forward.
window.__pushes = [];
let lastTap = 0;
let lastTraversal = 0;
for (const type of ['pointerup', 'touchend', 'mousedown', 'keydown', 'click']) {
  window.addEventListener(type, () => { lastTap = performance.now(); }, true);
}
window.addEventListener('popstate', () => { lastTraversal = performance.now(); }, true);
const push = history.pushState;
history.pushState = function pushState(state, ...rest) {
  window.__pushes.push({
    ours: !!state?.sellioOverlay,
    path: rest[1] ?? location.pathname,
    active: navigator.userActivation.isActive,
    tapSinceTraversal: lastTap > lastTraversal,
  });
  return push.call(this, state, ...rest);
};

function Start() {
  return <div><h1 id="page">start</h1><Link id="toHome" to="/home">home</Link></div>;
}

function Home() {
  const navigate = useNavigate();
  const [a, setA] = useState(false);
  const [b, setB] = useState(false);
  const [steps, setSteps] = useState(0);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  useBackToClose(a, () => { if (busy) return false; setA(false); });
  useBackToClose(b, () => setB(false));
  useBackToClose(steps > 0, () => { setSteps(s => Math.max(s - 1, 0)); if (steps > 1) return false; });
  useBackToClose(auto, () => setAuto(false));
  window.__home = { setAuto, setBusy };
  return (
    <div>
      <h1 id="page">home</h1>
      <button id="openA" onClick={() => setA(true)}>open A</button>
      <button id="next" onClick={() => setSteps(s => s + 1)}>next step</button>
      <span id="steps">{steps}</span>
      <Link id="toOther" to="/other">other</Link>
      {a && (
        <div id="A">
          A
          <button id="openB" onClick={() => setB(true)}>open B</button>
          <button id="closeA" onClick={() => setA(false)}>close A</button>
          <button id="linkInA" onClick={() => navigate('/other')}>other, no hand-over</button>
          <button id="handOverInA" onClick={() => { navigate('/other', { replace: handOverBackStep() }); setA(false); }}>other, hand-over</button>
        </div>
      )}
      {b && <div id="B">B</div>}
      {auto && <div id="AUTO">auto</div>}
    </div>
  );
}

function Other() {
  return <div><h1 id="page">other</h1></div>;
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Start />} />
      <Route path="/home" element={<Home />} />
      <Route path="/other" element={<Other />} />
    </Routes>
  </BrowserRouter>,
);
