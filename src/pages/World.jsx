import React, { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '@/lib/supabaseClient';
import { createSupabaseBackend } from '@/world/api';
import WorldGame from '@/world/WorldGame';

// Sellio World: an island of Sellio shops to explore, with the F&B District's
// storefronts and Pop-up Street's stalls. The game lives in src/world; this
// page connects it to Supabase and the router.
export default function World() {
  const navigate = useNavigate();
  const backend = useMemo(() => createSupabaseBackend(getSupabase), []);
  // Links to a section of the landing page (like /#pricing) need a full page load.
  const go = useCallback((url) => (url.startsWith('/#') ? window.location.assign(url) : navigate(url)), [navigate]);
  return <WorldGame backend={backend} navigate={go} />;
}
