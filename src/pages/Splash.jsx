import { Navigate, useLocation } from 'react-router-dom';

// Preserve existing /Splash links, but start the real session check immediately.
// The app's start no longer comes here: its splash is LaunchSplash (lib/appLaunch.js).
export default function Splash() {
  const location = useLocation();
  return <Navigate to={{ pathname: '/Auth', search: location.search, hash: location.hash }} replace />;
}
