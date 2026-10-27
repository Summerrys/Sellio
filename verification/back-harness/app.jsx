// A small app for verification/back-navigation.browser.mjs: windows, nested windows, a
// step-by-step screen and links, all on Sellio's useBackToClose, in a real browser.
import './monitor.js'; // first: it records the entries the page really adds
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { useBackToClose, handOverBackStep } from '../../src/lib/useBackToClose.js';

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
  // setAuto: a window opens by itself; go: the page navigates by itself (no tap).
  window.__home = { setAuto, setBusy, go: (to) => navigate(to) };
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
          {/* Like a store's checkout sending a visitor to sign in: the window closes and the
              page goes to another document. */}
          <button id="leaveFromA" onClick={() => { setA(false); window.location.assign('/signin'); }}>sign in (another page)</button>
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

function SignIn() {
  return <div><h1 id="page">signin</h1></div>;
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Start />} />
      <Route path="/home" element={<Home />} />
      <Route path="/other" element={<Other />} />
      <Route path="/signin" element={<SignIn />} />
    </Routes>
  </BrowserRouter>,
);
