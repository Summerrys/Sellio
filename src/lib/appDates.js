import { format, formatDistanceToNow } from 'date-fns';
import { id as indonesian } from 'date-fns/locale';
import { appLanguage } from './appText';

// Dates and times in the owner app's language (lib/appText.js). In English a date keeps the
// pattern it was written with. In Bahasa Indonesia the day comes first, months and days have
// their Indonesian names (date-fns' id locale) and times use the 24-hour clock: 14 Nov 2026,
// Sabtu, 14.30. For toLocaleString and the like, pass appLocale() (id-ID or en-SG).
const INDONESIAN_ORDER = {
  'MMM d, yyyy': 'd MMM yyyy',
  'MMM dd, yyyy HH:mm': 'dd MMM yyyy HH.mm',
  'MMM dd': 'dd MMM',
  'MMM d': 'd MMM',
  'EEE, MMM d': 'EEE, d MMM',
  'h:mm a': 'HH.mm',
  'HH:mm': 'HH.mm',
  'MMM d, h:mm a': 'd MMM, HH.mm',
};

export function formatAppDate(date, pattern) {
  if (appLanguage() !== 'id') return format(date, pattern);
  return format(date, INDONESIAN_ORDER[pattern] ?? pattern, { locale: indonesian });
}

// "5 minutes ago" / "5 menit yang lalu".
export function appTimeAgo(date) {
  return formatDistanceToNow(date, appLanguage() === 'id' ? { addSuffix: true, locale: indonesian } : { addSuffix: true });
}
