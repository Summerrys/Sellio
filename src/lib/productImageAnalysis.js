import { getSupabase } from '@/lib/supabaseClient';

export async function requestProductImageAnalysis(imageBase64, tenantId) {
  const client = await getSupabase();
  const { data, error } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error('Your session has expired. Please sign in again.');
  return fetch('https://selliosg.base44.app/api/functions/analyzeProductImage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ imageBase64, ...(tenantId ? { tenantId } : {}) }),
  });
}
