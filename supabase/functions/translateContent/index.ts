// translateContent — v2 (guarded). Deploy with verify_jwt: false (unchanged; the
// public storefront calls it without a login).
// Change vs v1: only text that is really on an open store's menu gets translated
// (product names/descriptions, category names, featured-section titles, checked
// by storefront_texts_allowed), so the function can't be used as a free
// translator; at most 500 texts per call, each up to 2,000 characters. Other
// texts are simply left out of the reply, and the storefront shows them in the
// original language, as it already does when a translation is missing.
// Caching and translation are unchanged from v1.
// Indonesia (Alvin, 12 Nov 2026): Bahasa Indonesia joins Chinese and Malay, and English too,
// for a menu an Indonesian shop writes in Indonesian (the store page asks for the visitor's
// language, never the menu's own). Nothing else changes.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LANG_NAMES: Record<string, string> = {
  zh: 'Simplified Chinese',
  ms: 'Bahasa Melayu (Malay)',
  id: 'Bahasa Indonesia (Indonesian)',
  en: 'English',
};
const MAX_TEXTS = 500;
const MAX_TEXT_CHARS = 2000;

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { texts, language } = await req.json();

    if (!Array.isArray(texts) || texts.length === 0 || !language) {
      return new Response(JSON.stringify({ error: 'texts (array) and language are required' }), {
        status: 400, headers: corsHeaders,
      });
    }
    if (typeof language !== 'string' || !Object.hasOwn(LANG_NAMES, language)) {
      return new Response(JSON.stringify({ error: `Unsupported language: ${language}` }), {
        status: 400, headers: corsHeaders,
      });
    }
    if (texts.length > MAX_TEXTS) {
      return new Response(JSON.stringify({ error: `At most ${MAX_TEXTS} texts per request` }), {
        status: 400, headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── NEW: keep only text that is on an open store's menu (exact match) ──
    const candidates = [...new Set(texts.filter((t: unknown): t is string =>
      typeof t === 'string' && t.trim() !== '' && t.length <= MAX_TEXT_CHARS))];
    const { data: allowedTexts, error: allowError } = candidates.length
      ? await supabase.rpc('storefront_texts_allowed', { p_texts: candidates })
      : { data: [], error: null };
    if (allowError) throw allowError;
    const allowed = new Set<string>(allowedTexts || []);
    const skipped = candidates.length - allowed.size;
    if (skipped > 0) console.log(`translateContent: skipped ${skipped} text(s) not on any open store's menu`);
    // ── end NEW ────────────────────────────────────────────────────────────

    // Dedupe + trim, keep empty strings out of the pipeline
    const uniqueTexts = [...new Set(candidates.filter((t) => allowed.has(t)).map((t) => t.trim()).filter(Boolean))];
    if (uniqueTexts.length === 0) {
      return new Response(JSON.stringify({ translations: {} }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const hashes = await Promise.all(uniqueTexts.map(sha256));
    const hashToText: Record<string, string> = {};
    uniqueTexts.forEach((t, i) => { hashToText[hashes[i]] = t; });

    // Step 1: Check cache for all texts at once
    const { data: cached } = await supabase
      .from('translations')
      .select('source_hash, translated_text')
      .eq('language', language)
      .in('source_hash', hashes);

    const result: Record<string, string> = {};
    const cachedHashes = new Set<string>();
    (cached || []).forEach((row: any) => {
      const original = hashToText[row.source_hash];
      if (original) {
        result[original] = row.translated_text;
        cachedHashes.add(row.source_hash);
      }
    });

    // Step 2: Translate whatever wasn't cached
    const missingTexts = uniqueTexts.filter((_, i) => !cachedHashes.has(hashes[i]));

    if (missingTexts.length > 0) {
      const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
      const numbered = missingTexts.map((t, i) => `${i + 1}. ${t}`).join('\n');

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `Translate each numbered line into ${LANG_NAMES[language]}. This is for a food/retail ordering app menu, so keep translations natural, concise, and appropriate for a storefront (not overly literal). Reply with ONLY the translations, one per line, in the exact same numbered format, nothing else:\n\n${numbered}`,
          }],
        }),
      });

      const claudeData = await claudeRes.json();
      const responseText = claudeData.content?.[0]?.text || '';

      // Parse numbered response back into translations, matching by index
      const lines = responseText.split('\n').map((l: string) => l.trim()).filter(Boolean);
      const translatedMap: Record<number, string> = {};
      for (const line of lines) {
        const match = line.match(/^(\d+)\.\s*(.+)$/);
        if (match) translatedMap[parseInt(match[1]) - 1] = match[2].trim();
      }

      const rowsToInsert = [];
      for (let i = 0; i < missingTexts.length; i++) {
        const original = missingTexts[i];
        const translated = translatedMap[i] || original; // fallback to original if parsing failed
        result[original] = translated;
        const hash = hashes[uniqueTexts.indexOf(original)];
        rowsToInsert.push({ source_hash: hash, source_text: original, language, translated_text: translated });
      }

      if (rowsToInsert.length > 0) {
        const { error: insertError } = await supabase.from('translations').upsert(rowsToInsert, { onConflict: 'source_hash,language' });
        if (insertError) console.warn('translateContent: cache insert warning:', insertError.message);
      }

      console.log(`translateContent: translated ${missingTexts.length} new strings, ${cachedHashes.size} from cache | lang=${language}`);
    } else {
      console.log(`translateContent: all ${uniqueTexts.length} strings served from cache | lang=${language}`);
    }

    return new Response(JSON.stringify({ translations: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('translateContent error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: corsHeaders,
    });
  }
});
