import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAppUser } from '@/lib/AppUserContext';
import { rememberReturnPath } from '@/lib/authNavigation';
import { likeErrorMessage, myLikedListings, needsSignIn, setListingLike } from '@/lib/likes';
import ExploreTabBar, { TAB_BAR_SPACE } from './ExploreTabBar';
import { BRAND_GRADIENT, ExploreTabHeader, ItemImage, formatPrice, listingUrl } from './shared';

// Me → My likes: the listings this buyer has liked (the heart on a listing), newest
// first. The heart on each takes it off the list again.

const PAGE = 40;
const LIKE_RED = '#e11d48';

function SignInCard() {
  return (
    <section className="bg-white rounded-2xl border border-slate-100 p-6 text-center" data-testid="likes-signin">
      <Heart className="w-8 h-8 mx-auto text-slate-300" />
      <p className="mt-3 text-base font-bold text-slate-900">Your likes</p>
      <p className="mt-1 text-sm text-slate-500">Log in to keep the listings you like in one place.</p>
      <Link to="/Auth" onClick={() => rememberReturnPath('/explore/me')} className="mt-4 h-10 px-5 rounded-full text-sm font-semibold text-white inline-flex items-center" style={{ background: BRAND_GRADIENT }}>
        Log in
      </Link>
    </section>
  );
}

function LikedCard({ row, onUnlike }) {
  const off = !row.available;
  return (
    <div className="relative bg-white rounded-2xl border border-slate-100 overflow-hidden" data-testid="liked-card">
      <Link to={listingUrl(row.product_id)} className="block">
        <div className={off ? 'opacity-50 grayscale' : ''}>
          <ItemImage src={row.image_url} name={row.product_name} className="w-full aspect-square text-4xl" />
        </div>
        <span className="block px-2.5 pt-2 pb-2.5">
          <span className="block text-[13px] leading-snug text-slate-900 line-clamp-2 break-words">{row.product_name}</span>
          <span className="block mt-1 text-sm font-bold text-slate-900">{formatPrice(row.price, row.currency)}</span>
          <span className="block mt-0.5 text-xs text-slate-500 truncate">
            {off ? 'Not available now' : row.sold_out ? `Sold out · ${row.shop_name}` : row.shop_name}
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => onUnlike(row)}
        aria-label={`Unlike ${row.product_name}`}
        className="absolute top-1.5 right-1.5 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.94)', boxShadow: '0 1px 6px rgba(15,23,42,0.18)' }}
      >
        <Heart className="w-5 h-5" fill={LIKE_RED} color={LIKE_RED} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function ExploreLikes() {
  const { appUser } = useAppUser() || {};
  const [rows, setRows] = useState([]);
  const [state, setState] = useState('loading'); // loading | ready | error | signin
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const previous = document.title;
    document.title = 'My likes · Sellio';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    if (!appUser) { setState('signin'); return undefined; }
    let cancelled = false;
    setState((s) => (s === 'ready' ? s : 'loading'));
    myLikedListings(0, PAGE)
      .then((list) => {
        if (cancelled) return;
        setRows(list || []);
        setHasMore((list || []).length === PAGE);
        setState('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('Likes failed to load:', e?.message || e);
        // Signed out, or the sign-in has run out: ask to log in again.
        const signedOut = e?.code === '42501' || needsSignIn(e) || /^PGRST30/.test(String(e?.code || ''));
        setState(signedOut ? 'signin' : 'error');
      });
    return () => { cancelled = true; };
  }, [appUser, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const list = (await myLikedListings(rows.length, PAGE)) || [];
      setRows((prev) => [...prev, ...list.filter((r) => !prev.some((p) => p.product_id === r.product_id))]);
      setHasMore(list.length === PAGE);
    } catch { /* the button stays for another try */ }
    setLoadingMore(false);
  };

  const relike = async (row) => {
    try {
      await setListingLike(row.product_id, true);
      reload();
    } catch (e) {
      toast.error(likeErrorMessage(e, 'Couldn’t put it back. Like it again from its listing.'));
    }
  };

  const unlike = async (row) => {
    setRows((prev) => prev.filter((r) => r.product_id !== row.product_id));
    try {
      await setListingLike(row.product_id, false);
      toast('Removed from My likes', { action: { label: 'Undo', onClick: () => relike(row) } });
    } catch (e) {
      reload();
      if (needsSignIn(e)) setState('signin');
      else toast.error(likeErrorMessage(e));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50" data-testid="likes-page">
      <ExploreTabHeader
        title={<>My likes{state === 'ready' && rows.length > 0 && <span className="ml-2 text-[13px] font-medium text-slate-500">{rows.length}{hasMore ? '+' : ''} {rows.length === 1 && !hasMore ? 'listing' : 'listings'}</span>}</>}
      />
      <main className="max-w-3xl mx-auto px-3 pt-3" style={{ paddingBottom: TAB_BAR_SPACE }}>
        {state === 'signin' && <SignInCard />}
        {state === 'loading' && (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>
        )}
        {state === 'error' && (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <p className="text-sm text-slate-600">We couldn’t load your likes just now.</p>
            <button type="button" onClick={reload} className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        )}
        {state === 'ready' && rows.length === 0 && (
          <section className="mt-16 text-center px-6" data-testid="likes-empty">
            <span className="mx-auto w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center">
              <Heart className="w-[26px] h-[26px]" color={LIKE_RED} />
            </span>
            <p className="mt-3.5 text-base font-bold text-slate-900">No likes yet</p>
            <p className="mt-1 text-sm text-slate-500">Tap the heart on any listing to keep it here.</p>
            <Link to="/explore" className="mt-5 h-10 px-5 rounded-full text-sm font-semibold text-white inline-flex items-center" style={{ background: BRAND_GRADIENT }}>
              Browse Explore
            </Link>
          </section>
        )}
        {state === 'ready' && rows.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {rows.map((row) => <LikedCard key={row.product_id} row={row} onUnlike={unlike} />)}
            </div>
            {hasMore && (
              <button type="button" onClick={loadMore} disabled={loadingMore} className="mt-3 w-full h-10 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5">
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />} Show more
              </button>
            )}
          </>
        )}
      </main>
      <ExploreTabBar active="me" />
    </div>
  );
}
