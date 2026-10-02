// Monthly AI allowance of a store (my_ai_allowance) and the last AI suggestion.
// Free personal shops: 3 AI photo analyses and 3 stock-photo searches a calendar
// month (Singapore time). Business plans: no monthly limit (limit null).
// Plain functions with no imports, so they can be tested without a browser.

// '1 Nov' (Singapore time).
export function resetDayLabel(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' });
}

// { limit, used, left } for 'ai_analysis' or 'photo_search', or null when the
// plan has no monthly limit (or the allowance hasn't loaded).
export function allowanceFor(allowance, kind) {
  const entry = allowance && typeof allowance === 'object' ? allowance[kind] : null;
  if (!entry || entry.limit === null || entry.limit === undefined) return null;
  const limit = Number(entry.limit);
  const used = Math.max(0, Number(entry.used) || 0);
  if (!Number.isFinite(limit)) return null;
  return { limit, used, left: Math.max(0, limit - used) };
}

const NOUNS = {
  ai_analysis: ['AI analysis', 'AI analyses'],
  photo_search: ['photo search', 'photo searches'],
};

// "2 of 3 AI analyses left this month" / "No AI analyses left this month · resets 1 Nov".
// Empty string when the plan has no monthly limit.
export function allowanceLine(allowance, kind) {
  const a = allowanceFor(allowance, kind);
  if (!a) return '';
  const [one, many] = NOUNS[kind] || ['use', 'uses'];
  if (a.left === 0) {
    const day = resetDayLabel(allowance?.resets_at);
    return `No ${many} left this month${day ? ` · resets ${day}` : ''}`;
  }
  return `${a.left} of ${a.limit} ${a.limit === 1 ? one : many} left this month`;
}

export function allowanceSpent(allowance, kind) {
  const a = allowanceFor(allowance, kind);
  return !!a && a.left === 0;
}

// The last AI suggestion (my_ai_allowance.last_analysis) in the shape the product
// form's AI panel uses, or null.
export function lastSuggestion(allowance) {
  const last = allowance?.last_analysis;
  const r = last?.result;
  if (!r || typeof r !== 'object' || !r.name) return null;
  return {
    name: String(r.name),
    description: String(r.description || ''),
    suggested_category: String(r.category || ''),
    estimated_price: Number(r.price) > 0 ? Number(r.price) : 0,
    suggested_tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    confidence: Number(r.confidence) || 0,
    imagePath: typeof last.image_path === 'string' && last.image_path ? last.image_path : null,
    createdAt: last.created_at || null,
  };
}

// The message an edge function sent with a non-2xx answer (supabase-js puts the
// Response in error.context), or the fallback.
export async function functionErrorMessage(error, fallback) {
  try {
    const response = error?.context;
    if (response && typeof response.json === 'function') {
      const body = await response.clone().json();
      if (body && typeof body.error === 'string' && body.error) return body.error;
    }
  } catch {
    // not JSON: use the fallback
  }
  return fallback;
}
