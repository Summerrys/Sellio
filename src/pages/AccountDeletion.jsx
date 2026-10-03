import React, { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import AccountDeletionRequest from '@/components/profile/AccountDeletionRequest';

// Public page (linked from the Privacy page and the app store listings): how to ask
// for a Sellio account to be deleted. Deletion is done on request, by email.
export default function AccountDeletion() {
  const [email, setEmail] = useState('');

  useEffect(() => {
    let mounted = true;
    getSupabase()
      .then(client => client.auth.getUser())
      .then(({ data }) => { if (mounted && data?.user?.email) setEmail(data.user.email); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground px-5 py-12">
      <section className="mx-auto max-w-lg space-y-6 rounded-xl border bg-card p-6">
        <a href="/" className="font-bold text-xl">Sellio</a>
        <h1 className="text-2xl font-semibold">Delete your Sellio account</h1>
        <AccountDeletionRequest email={email} />
        <a className="block text-sm underline" href="/privacy">Privacy policy</a>
      </section>
    </main>
  );
}
