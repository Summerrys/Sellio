import React from 'react';
import AccountDeletionForm from '@/components/profile/AccountDeletionForm';

export default function AccountDeletion() {
  return (
    <main className="min-h-screen bg-background text-foreground px-5 py-12">
      <section className="mx-auto max-w-lg space-y-6 rounded-xl border bg-card p-6">
        <a href="/" className="font-bold text-xl">Sellio</a>
        <h1 className="text-2xl font-semibold">Delete your Sellio account</h1>
        <AccountDeletionForm />
        <a className="block text-sm underline" href="/privacy">Privacy policy</a>
      </section>
    </main>
  );
}
