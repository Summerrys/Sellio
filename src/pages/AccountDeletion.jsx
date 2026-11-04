import React, { useEffect } from 'react';
import AccountDeletionRequest, { DELETION_EMAIL } from '@/components/profile/AccountDeletionRequest';

// Public page (sellio.sg/delete-account, linked from the Privacy page, the app stores' listings
// and Me → Delete account in the app): how to delete a Sellio account, and the request itself
// for a signed-in person. Google Play asks this page to name the app, give the steps, and say
// what is deleted and what is kept, and for how long.
export default function AccountDeletion() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Delete your account · Sellio';
    return () => { document.title = previous; };
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground px-5 py-12">
      <section className="mx-auto max-w-lg space-y-5 rounded-xl border bg-card p-6">
        <a href="/" className="font-bold text-xl">Sellio</a>
        <h1 className="text-2xl font-semibold">Delete your Sellio account</h1>
        <p className="text-sm text-slate-600">
          Ask in the Sellio app (Me → Delete account) or here: sign in, type DELETE and tap Request deletion.
          Can&apos;t sign in? Email <a className="underline" href={`mailto:${DELETION_EMAIL}`}>{DELETION_EMAIL}</a> from
          the email address on the account.
        </p>
        <AccountDeletionRequest />
        <a className="block text-sm underline" href="/privacy">Privacy policy</a>
      </section>
    </main>
  );
}
