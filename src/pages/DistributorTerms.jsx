import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LOGO_URL } from '@/components/explore/shared';

// Where Refer & earn's "Sellio Distributor Terms" link goes. The terms themselves are Alvin's to
// supply, with a legal check, before joining opens to shops (build plan, 10 Nov 2026); until then
// this page says so. Not in search (RouteIndexingGuard keeps unlisted pages out). English, like the
// Terms and Privacy pages.
export default function DistributorTerms() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Sellio Distributor Terms · Sellio';
    return () => { document.title = previous; };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10" data-testid="distributor-terms">
      <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-100 p-6">
        <a href="/" aria-label="Sellio"><img src={LOGO_URL} alt="Sellio" className="h-11 w-auto object-contain" /></a>
        <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Sellio Distributor Terms</h1>
        <p className="mt-3 text-[15px] leading-6 text-slate-600">
          These are the terms for Refer &amp; earn, Sellio’s referral programme for shops. They are being finalised and will be
          published here before Refer &amp; earn opens to shops.
        </p>
        <p className="mt-3 text-[15px] leading-6 text-slate-600">
          Questions? Email <a href="mailto:sellio@apptelier.sg" className="font-semibold text-blue-600">sellio@apptelier.sg</a>.
        </p>
        <p className="mt-6 flex gap-4 text-sm">
          <Link to="/terms" className="font-semibold text-blue-600">Terms and Conditions</Link>
          <Link to="/privacy" className="font-semibold text-blue-600">Privacy Policy</Link>
        </p>
      </div>
    </main>
  );
}
