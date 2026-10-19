import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import { useTenant } from '@/components/tenant/TenantContext';
import RequirePermission from '@/components/auth/RequirePermission';
import { ReportCommentSheet, StarIcon, Stars } from '@/components/ratings/RatingParts';
import { STAR_COLOR, ratingText, shopRatingOverview, shopRatings } from '@/lib/ratings';
import { timeAgo } from '@/components/explore/shared';

// Ratings: what buyers think of the shop. Its average and count (buyers see them once
// 3 buyers have rated), and each rating with the buyer's comment: public (on the shop
// page, which the shop can report) or only for the shop.

const PAGE = 30;

export default function ShopRatings() {
  const { tenantId, tenant } = useTenant();
  const [overview, setOverview] = useState(null);
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [reporting, setReporting] = useState(null);
  const home = tenant?.seller_type === 'individual';

  useEffect(() => {
    const previous = document.title;
    document.title = 'Ratings · Sellio';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    if (!tenantId) return undefined;
    let cancelled = false;
    setStatus('loading');
    Promise.all([shopRatingOverview(tenantId), shopRatings(tenantId, 0, PAGE)])
      .then(([o, list]) => {
        if (cancelled) return;
        setOverview(o);
        setRows(list);
        setHasMore(list.length === PAGE);
        setStatus('ready');
      })
      .catch((e) => {
        console.warn('Ratings failed to load:', e?.message || e);
        if (!cancelled) setStatus('error');
      });
    return () => { cancelled = true; };
  }, [tenantId, reloadKey]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const list = await shopRatings(tenantId, rows.length, PAGE);
      setRows((prev) => [...prev, ...list]);
      setHasMore(list.length === PAGE);
    } catch { /* the button stays for another try */ }
    setLoadingMore(false);
  };

  const count = Number(overview?.rating_count) || 0;
  const hiddenOnStore = !home && tenant?.settings?.show_rating_on_store === false;
  const doneWords = home ? 'Collected or Delivered' : 'Done';

  return (
    <RequirePermission permission="orders.view">
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ratings</h1>
          <p className="text-sm text-slate-500">What buyers think of {tenant?.name || 'your shop'}</p>
        </div>

        {status === 'loading' && (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>
        )}

        {status === 'error' && (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <p className="text-sm text-slate-600">We couldn't load your ratings just now.</p>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="mt-3 h-9 px-4 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        )}

        {status === 'ready' && (
          <>
            <section className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-4">
              <div className="text-center flex-shrink-0 min-w-[84px]">
                <div className="text-4xl font-extrabold text-slate-900 leading-none">{count ? ratingText(overview.rating) : '–'}</div>
                <div className="mt-1.5"><Stars value={count ? overview.rating : 0} size={13} /></div>
              </div>
              <div className="flex-1 min-w-0 text-sm text-slate-600 leading-relaxed">
                {count === 0 ? (
                  <p>No ratings yet. Buyers can rate an order once you mark it {doneWords}.</p>
                ) : (
                  <>
                    <p>{count} {count === 1 ? 'buyer has' : 'buyers have'} rated you{overview.last_7_days ? ` (${overview.last_7_days} this week)` : ''}.</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {overview.shown
                        ? hiddenOnStore
                          ? 'Shown on Explore and your listings. Hidden on your ordering page.'
                          : 'Shown on Explore, your listings and your shop page.'
                        : `Buyers see your average once 3 buyers have rated you (${count} so far).`}
                    </p>
                    {!home && (
                      <Link to="/TenantSettings" className="text-xs font-semibold mt-1 inline-block" style={{ color: 'rgb(var(--color-primary))' }}>
                        {hiddenOnStore ? 'Show it on your ordering page' : 'Hide it on your ordering page'}
                      </Link>
                    )}
                  </>
                )}
              </div>
            </section>

            {count > 0 && (
              <section className="bg-white rounded-2xl border border-slate-100 p-4">
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = Number(overview[`stars_${n}`]) || 0;
                  return (
                    <div key={n} className="flex items-center gap-2 text-xs text-slate-500 my-1">
                      <span className="w-3 text-right">{n}</span>
                      <StarIcon size={11} />
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(c / count) * 100}%`, background: STAR_COLOR }} />
                      </div>
                      <span className="w-6 text-right">{c}</span>
                    </div>
                  );
                })}
                <p className="text-[11px] text-slate-400 mt-2">Each buyer counts once: their latest rating.</p>
              </section>
            )}

            {rows.length > 0 && (
              <>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 pt-1">Latest</p>
                <section className="bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
                  {rows.map((r) => (
                    <div key={r.id} className="px-4 py-3" data-testid="shop-rating">
                      <div className="flex items-center justify-between gap-2">
                        <Stars value={r.stars} size={13} />
                        <span className="text-[11px] text-slate-400">{timeAgo(r.updated_at || r.created_at)}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 mt-1">
                        {r.rater_name || 'A buyer'}
                        {r.order_number && <span className="font-normal text-slate-400"> · {r.order_number}</span>}
                      </p>
                      {r.note && (
                        <p className="text-sm text-slate-600 mt-0.5 break-words">
                          “{r.note}”{' '}
                          {!r.note_public && <span className="text-[11px] text-slate-400">(only you see this)</span>}
                        </p>
                      )}
                      {r.note && r.note_public && r.note_state === 'visible' && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Shown on your shop page ·{' '}
                          <button type="button" onClick={() => setReporting({ id: r.id, note: r.note, rater_name: r.rater_name || 'A buyer' })} className="underline" data-testid="shop-report-comment">Report</button>
                        </p>
                      )}
                      {r.note && r.note_public && r.note_state === 'reported' && (
                        <p className="text-[11px] text-amber-700 mt-0.5">Hidden from your shop page while Sellio looks at a report</p>
                      )}
                      {r.note_state === 'removed' && (
                        <p className="text-[11px] text-slate-400 mt-0.5">Comment removed by Sellio</p>
                      )}
                    </div>
                  ))}
                </section>
                {hasMore && (
                  <div className="flex justify-center">
                    <button type="button" onClick={loadMore} disabled={loadingMore} className="h-10 px-5 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 inline-flex items-center gap-2 disabled:opacity-60">
                      {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />} Show more
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      <ReportCommentSheet
        open={!!reporting}
        comment={reporting}
        onClose={() => setReporting(null)}
        onReported={() => { setReporting(null); setReloadKey((k) => k + 1); }}
      />
    </RequirePermission>
  );
}
