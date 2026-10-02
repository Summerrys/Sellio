import { createContext, useContext, useEffect, useRef } from 'react';

export const AppRefreshContext = createContext(null);

// Non-query pages join the same refresh. Their latest handler is used without
// tearing down the shared gesture listener when page state changes.
export function useAppRefreshHandler(handler) {
  const register = useContext(AppRefreshContext)?.registerRefresh;
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!register) return;
    return register(() => latest.current());
  }, [register]);
}

export function useAppReloadGuard(guard) {
  const register = useContext(AppRefreshContext)?.registerReloadGuard;
  const latest = useRef(guard);
  latest.current = guard;
  useEffect(() => {
    if (!register) return;
    return register(() => latest.current());
  }, [register]);
}
