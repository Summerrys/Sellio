import { Navigate, useLocation } from 'react-router-dom';

// Preserve existing /Splash links, but start the real session check immediately.
// AppLoader keeps the same branded splash visible until the destination is ready.
export default function Splash() {
  const location = useLocation();
  return <Navigate to={{ pathname: '/Auth', search: location.search, hash: location.hash }} replace />;
}
