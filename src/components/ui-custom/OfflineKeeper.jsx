import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppUser } from '@/lib/AppUserContext';
import { isOffline } from '@/lib/network';
import { pruneSnapshots } from '@/lib/offlineStore';
import { keepQueriesOffline, restoreKeptQueries } from '@/lib/offlineQueries';

// Keeps the app's own records on the phone for when there's no connection, and puts them
// back when the app opens offline (lib/offlineQueries.js). Renders nothing. It sits above
// the pages, so the records are back before any page asks for them.
export default function OfflineKeeper() {
  const queryClient = useQueryClient();
  const { appUser } = useAppUser() || {};
  const owner = appUser?.id || null;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;

  // Opening offline: the last copies, during this first render (before the pages').
  useState(() => {
    if (owner && isOffline()) {
      const restored = restoreKeptQueries(queryClient, owner);
      if (restored) console.info(`Sellio offline: ${restored} saved records restored`);
    }
    return null;
  });

  useEffect(() => keepQueriesOffline(queryClient, () => ownerRef.current), [queryClient]);

  // Signed out, or someone else signed in: the copies that aren't theirs go.
  useEffect(() => { pruneSnapshots(owner); }, [owner]);

  return null;
}
