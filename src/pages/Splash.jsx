import { Navigate, useLocation } from 'react-router-dom';
import { useAppUser } from '@/lib/AppUserContext';
import { homeFor } from '@/lib/staffAccess';

// Where Sellio added to a home screen opens (manifest.json's start_url), and old /Splash
// links. Someone signed in goes straight to their first screen, as when they open
// sellio.sg (Explore; staff: their shop); everyone else signs in. The splash while it
// opens is LaunchSplash (lib/appLaunch.js; index.html starts it).
export default function Splash() {
  const location = useLocation();
  const { appUser } = useAppUser();
  if (appUser && !location.search && !location.hash) return <Navigate to={homeFor(appUser)} replace />;
  return <Navigate to={{ pathname: '/Auth', search: location.search, hash: location.hash }} replace />;
}
