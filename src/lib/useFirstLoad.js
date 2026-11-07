import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// Whether a page is still on its first load: any query in use whose key starts with one of
// keyPrefixes (e.g. ['recentOrders', tenantId]) has neither data nor an error yet. The
// page's own queries and those of the cards inside it count alike (the cards are mounted
// but hidden meanwhile), so the page can keep its loading state up until everything is
// there and then show it all at once. Done once, it stays done: a later refresh or a new
// query doesn't bring the loading state back.
//
// Starts as loading: on the first render the cards haven't made their queries yet.
export function useFirstLoad(keyPrefixes) {
  const queryClient = useQueryClient();
  const signature = JSON.stringify(keyPrefixes);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loading) return undefined;
    const prefixes = JSON.parse(signature);
    const cache = queryClient.getQueryCache();
    let unsubscribe = () => {};
    const check = () => {
      const inUse = cache.getAll().filter((query) => query.getObserversCount() > 0 &&
        prefixes.some((prefix) => prefix.every((part, i) => query.queryKey[i] === part)));
      if (!inUse.length) return; // not made yet: still loading
      if (inUse.some((query) => query.state.status === 'pending')) return;
      unsubscribe();
      setLoading(false);
    };
    unsubscribe = cache.subscribe(check);
    check();
    return () => unsubscribe();
  }, [queryClient, signature, loading]);

  return loading;
}
