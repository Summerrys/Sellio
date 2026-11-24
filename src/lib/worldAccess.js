import { useEffect, useState } from 'react';
import { useAppUser } from '@/lib/AppUserContext';
import { amISellioAdmin } from '@/lib/appFeedback';

// Who can go into Sellio World. Alvin, 25 Nov 2026: "in the production, users won't be seeing
// Sellio World until I give it a go", and "me as an admin, I will still need to access it to test
// out in real mobile app environment". So until it opens, only Sellio's admins get a way in (the Me
// row, the Refer page's link) and /World tells everyone else it's coming soon. To open it to
// everyone, set WORLD_FOR_EVERYONE to true.
export const WORLD_FOR_EVERYONE = false;

// 'checking' | 'yes' | 'no', for the signed-in person (asked again when they change).
export function useWorldAccess() {
  const { appUser } = useAppUser() || {};
  const account = String(appUser?.email || '').trim().toLowerCase();
  const [access, setAccess] = useState(WORLD_FOR_EVERYONE ? 'yes' : 'checking');
  useEffect(() => {
    if (WORLD_FOR_EVERYONE) return undefined;
    if (!account) { setAccess('no'); return undefined; }
    let gone = false;
    setAccess('checking');
    amISellioAdmin().then((yes) => { if (!gone) setAccess(yes ? 'yes' : 'no'); });
    return () => { gone = true; };
  }, [account]);
  return access;
}
