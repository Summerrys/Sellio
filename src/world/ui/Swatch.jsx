import React from 'react';
import { LOOKS } from '../engine/catalog';
import { rng } from '../engine/kit';

// A small picture of a stall item for the style panel.
export function Swatch({ slot, code }) {
  if (slot === 'awning') {
    const look = LOOKS.awning[code];
    if (!look) return <span className="pw-sw"><span className="pw-none">New item</span></span>;
    if (look.kind === 'pagoda') return <span className="pw-sw dark"><span className="pw-sw-roof" /></span>;
    if (look.kind === 'glow') return <span className="pw-sw dark"><span className="pw-sw-arch" /></span>;
    const [a, b] = look.colors;
    return (
      <span className="pw-sw" style={{ background: `repeating-linear-gradient(90deg,${a} 0 16px,${b} 16px 32px)` }}>
        {look.scallop && <span className="pw-sw-scallop" style={{ '--a': a, '--b': b }} />}
      </span>
    );
  }
  if (slot === 'sign') return <span className="pw-sw dark"><span className={`pw-board ${LOOKS.sign[code] ? code : 'wood'}`}>Aa</span></span>;
  if (slot === 'lights') {
    if (code === 'none') return <span className="pw-sw dark"><span className="pw-none">No lights</span></span>;
    const dots = [];
    if (code === 'bulbs') for (let i = 0; i < 7; i++) dots.push(<i key={i} className="bulb" style={{ left: `${10 + i * 13}%`, top: 18 + 14 * (1 - ((i - 3) / 3) ** 2) }} />);
    if (code === 'fairy') { const r = rng(5); for (let i = 0; i < 22; i++) dots.push(<i key={i} className={`fairy${i % 2 ? ' y' : ''}`} style={{ left: `${6 + r() * 88}%`, top: 8 + r() * 48 }} />); }
    if (code === 'lanterns') for (let i = 0; i < 3; i++) dots.push(<i key={i} className="lantern" style={{ left: `calc(${22 + i * 28}% - 8px)`, top: i === 1 ? 26 : 18 }} />);
    return <span className="pw-sw dark"><span className="pw-dots">{dots}</span></span>;
  }
  if (code === 'none') return <span className="pw-sw"><span className="pw-none">Nothing</span></span>;
  const bits = [];
  if (code === 'plants') [28, 64].forEach((l, k) => bits.push(
    <i key={`a${k}`} className="leaf" style={{ left: `calc(${l}% - 13px)`, bottom: 20, width: 26, height: 26 }} />,
    <i key={`b${k}`} className="leaf" style={{ left: `calc(${l}% - 2px)`, bottom: 34, width: 16, height: 16, background: '#57b77f' }} />,
    <i key={`c${k}`} className="pot" style={{ left: `calc(${l}% - 10px)` }} />,
  ));
  if (code === 'bunting') { const c = ['#fb923c', '#e0449a', '#8b2fc9', '#ffc23d', '#2fbf95']; for (let i = 0; i < 7; i++) bits.push(<i key={i} className="flag" style={{ left: `${4 + i * 13.5}%`, background: c[i % 5], top: 20 + 6 * (1 - ((i - 3) / 3) ** 2) }} />); }
  if (code === 'balloons') [['#e0449a', 30, 22], ['#fb923c', 48, 10], ['#8b2fc9', 64, 24]].forEach(([c, l, t], i) => bits.push(
    <i key={i} className="balloon" style={{ left: `${l}%`, top: t, background: `radial-gradient(circle at 35% 30%,rgba(255,255,255,.55),${c} 45%)` }} />,
  ));
  return <span className="pw-sw"><span className="pw-dots">{bits}</span></span>;
}
