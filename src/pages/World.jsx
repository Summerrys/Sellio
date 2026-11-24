import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useWorldAccess } from '@/lib/worldAccess';
import { useAppText } from '@/lib/appText';
import { getSupabase } from '@/lib/supabaseClient';
import { goBack } from '@/lib/goBack';
import { createSupabaseBackend, toWorldError } from '@/world/api';
import { createIslandHost, ISLAND_URL } from '@/world/islandHost';
import WorldGame from '@/world/WorldGame';

// Sellio World: an island of Sellio's shops to walk around. Sellio Plaza sits in the middle, with
// Pop-up Street, the F&B District, Retail Avenue and Services Garden leading off it.
//
// The game itself is public/assets/world/island.html, shown here in a frame so its own styles and
// 3D engine stay apart from the rest of Sellio; src/world/islandHost.js answers what it asks for
// from Supabase. The earlier map version (src/world/WorldGame.jsx) is still at /World?classic=1.
//
// Until Alvin opens it (lib/worldAccess.js), it's for Sellio's admins: everyone else is told it's
// coming soon.
export default function World() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const access = useWorldAccess();
  const backend = useMemo(() => createSupabaseBackend(getSupabase), []);
  // Links to a section of the landing page (like /#pricing) need a full page load.
  const go = useCallback((url) => (url.startsWith('/#') ? window.location.assign(url) : navigate(url)), [navigate]);
  if (access === 'checking') return <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#2a1252' }} />;
  if (access !== 'yes') return <WorldSoon />;
  if (params.get('classic') === '1') return <WorldGame backend={backend} navigate={go} />;
  return <Island backend={backend} go={go} />;
}

// Before Sellio World opens (lib/worldAccess.js): also the Wallet page's, since coins come with it.
export function WorldSoon() {
  const { t } = useAppText('explore');
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'linear-gradient(160deg, #1e3a8a 0%, #6b21a8 100%)' }} data-testid="world-soon">
      <div className="max-w-sm text-center text-white flex flex-col items-center gap-3">
        <span aria-hidden="true" className="w-16 h-16 rounded-full flex items-center justify-center text-[32px] font-bold"
          style={{ background: 'radial-gradient(circle at 35% 30%, #fff3b0 0 16%, #ffc23d 46%, #d88e0c 100%)', color: '#6b3f00' }}>S</span>
        <h1 className="m-0 text-[26px] leading-8 font-extrabold">{t('Sellio World is coming soon')}</h1>
        <p className="m-0 text-[15px] leading-[22px] text-white/85">{t('Walk Sellio’s streets, collect coins and style your stall. It opens soon.')}</p>
        <Link to="/explore" className="mt-2 h-11 px-6 rounded-full bg-white text-[15px] font-bold text-indigo-900 inline-flex items-center">{t('Back to Explore')}</Link>
      </div>
    </div>
  );
}

function Island({ backend, go }) {
  const navigate = useNavigate();
  const frame = useRef(null);
  const [round, setRound] = useState(0);

  useEffect(() => createIslandHost({
    backend,
    navigate: go,
    leave: () => goBack(navigate),
    frame: () => frame.current?.contentWindow,
    toError: toWorldError,
  }), [backend, go, navigate]);

  // Signing in or out (here or in another tab) starts the game again, with that person's coins.
  useEffect(() => {
    let known;
    let off = null;
    let gone = false;
    backend.getUser().then((u) => { if (!gone) known = u?.id || null; }).catch(() => { if (!gone) known = null; });
    Promise.resolve(backend.onAuthChange((u) => {
      const id = u?.id || null;
      if (known === undefined || id === known) return;
      known = id;
      setRound((n) => n + 1);
    })).then((fn) => { if (gone) fn?.(); else off = fn; }).catch(() => {});
    return () => { gone = true; off?.(); };
  }, [backend]);

  return (
    <div
      data-pull-refresh-block
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: '#2a1252',
        paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <iframe
        key={round}
        ref={frame}
        title="Sellio World"
        src={ISLAND_URL}
        allow="autoplay"
        style={{ display: 'block', width: '100%', height: '100%', border: 0, background: '#2a1252' }}
      />
    </div>
  );
}
