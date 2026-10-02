import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import PullToRefresh from './PullToRefresh';
import { AppRefreshContext } from '@/lib/AppRefreshContext';
import { fetchPublishedAppVersion, getAppAssetVersion, getAppReloadUrl } from '@/lib/appUpdates';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function AppRefreshProvider({ children }) {
  const queryClient = useQueryClient();
  const handlers = useRef(new Set());
  const guards = useRef(new Set());
  const runningVersion = useRef(getAppAssetVersion(document, window.location.href));
  const checking = useRef(null);
  const [newVersion, setNewVersion] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);

  const registerRefresh = useCallback(handler => {
    handlers.current.add(handler);
    return () => handlers.current.delete(handler);
  }, []);
  const registerReloadGuard = useCallback(guard => {
    guards.current.add(guard);
    return () => guards.current.delete(guard);
  }, []);
  const context = useMemo(() => ({ registerRefresh, registerReloadGuard }), [registerRefresh, registerReloadGuard]);

  const checkVersion = useCallback(async (showAgain = false) => {
    // Development previews use /src/main.jsx rather than published assets.
    if (!runningVersion.current) return;
    if (!checking.current) {
      checking.current = fetchPublishedAppVersion(window.location.origin)
        .finally(() => { checking.current = null; });
    }
    const version = await checking.current;
    setNewVersion(version !== runningVersion.current ? version : null);
    if (showAgain) setDismissed(false);
  }, []);

  const getReloadState = useCallback(() => {
    let dirty = false;
    let busy = queryClient.isMutating() > 0;
    guards.current.forEach(guard => {
      const state = guard();
      dirty ||= !!state?.dirty;
      busy ||= !!state?.busy;
    });
    return { dirty, busy };
  }, [queryClient]);

  const refresh = useCallback(async () => {
    if (getReloadState().busy) throw new Error('Please wait for the current action to finish.');
    // Invalidate the whole cache: active data refetches now; other pages fetch
    // fresh data when opened. Local form drafts are not cleared.
    const results = await Promise.allSettled([
      queryClient.invalidateQueries({}, { throwOnError: true }),
      ...[...handlers.current].map(handler => Promise.resolve().then(handler)),
      checkVersion(true),
    ]);
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  }, [checkVersion, getReloadState, queryClient]);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') void checkVersion().catch(() => {});
    };
    check();
    const timer = setInterval(check, 120000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [checkVersion]);

  const reload = useCallback((discard = false) => {
    if (getReloadState().busy) {
      toast.info('Please wait for the current action to finish.');
      return;
    }
    if (!discard) {
      // Finish or close an active editor, scanner or checkout before reloading.
      const dialog = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
        .some(el => getComputedStyle(el).display !== 'none' && el.getAttribute('aria-hidden') !== 'true');
      if (dialog) {
        toast.info('Close the current window before reloading.');
        return;
      }
      if (getReloadState().dirty) {
        setConfirmReload(true);
        return;
      }
    }
    window.location.replace(getAppReloadUrl(window.location.href));
  }, [getReloadState]);

  return (
    <AppRefreshContext.Provider value={context}>
      <PullToRefresh onRefresh={refresh} appWide>{children}</PullToRefresh>
      {newVersion && !dismissed && (
        <div role="status" data-pull-refresh-block
          className="fixed inset-x-3 z-[190] mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-lg"
          style={{ top: 'calc(64px + env(safe-area-inset-top, 0px))' }}>
          <RefreshCw className="h-5 w-5 shrink-0" style={{ color: 'rgb(var(--color-primary, 59 130 246))' }} aria-hidden="true" />
          <span className="min-w-0 flex-1 text-sm font-semibold">Update available</span>
          <button type="button" onClick={() => reload()}
            className="min-h-11 rounded-xl px-4 text-sm font-semibold text-white active:opacity-80"
            style={{ background: 'var(--color-primary-gradient, #3b82f6)' }}>Reload</button>
          <button type="button" onClick={() => setDismissed(true)} aria-label="Update later"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <AlertDialog open={confirmReload} onOpenChange={setConfirmReload}>
        <AlertDialogContent className="z-[221] max-w-sm rounded-2xl" overlayClassName="z-[220]">
          <AlertDialogHeader>
            <AlertDialogTitle>Reload with unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>Your unfinished changes or order will be cleared. Save or finish them first, or reload anyway.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction onClick={event => { event.preventDefault(); reload(true); }}
              style={{ background: 'var(--color-primary-gradient, #3b82f6)' }}>Reload anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppRefreshContext.Provider>
  );
}
