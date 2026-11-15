import { format, formatDistanceToNow } from 'date-fns';
import { id as indonesian, zhCN as chinese, ms as malay } from 'date-fns/locale';
import { appLanguage } from './appText';

// Dates and times in the owner app's language (lib/appText.js). In English a date keeps the
// pattern it was written with. In Bahasa Indonesia the day comes first, months and days have
// their Indonesian names (date-fns' id locale) and times use the 24-hour clock: 14 Nov 2026,
// Sabtu, 14.30. In 中文 and Malay they read as Intl writes them for zh-SG and ms-MY, so they
// match the times the app formats with appLocale(): 2026年11月14日, 11月14日 下午2:30;
// 14 Nov 2026, 2:30 PTG. For toLocaleString and the like, pass appLocale().
const INDONESIAN_ORDER = {
  'MMM d, yyyy': 'd MMM yyyy',
  'MMM dd, yyyy HH:mm': 'dd MMM yyyy HH.mm',
  'MMM dd': 'dd MMM',
  'MMM d': 'd MMM',
  'EEE, MMM d': 'EEE, d MMM',
  'h:mm a': 'HH.mm',
  'HH:mm': 'HH.mm',
  'MMM d, h:mm a': 'd MMM, HH.mm',
  'MMM d, HH:mm': 'd MMM, HH.mm',
};

const CHINESE_ORDER = {
  'MMM d, yyyy': 'yyyy年M月d日',
  'MMM dd, yyyy HH:mm': 'yyyy年M月d日 HH:mm',
  'MMM dd': 'M月d日',
  'MMM d': 'M月d日',
  'EEE, MMM d': 'M月d日 EEE',
  'h:mm a': 'ah:mm',
  'HH:mm': 'HH:mm',
  'MMM d, h:mm a': 'M月d日 ah:mm',
  'MMM d, HH:mm': 'M月d日 HH:mm',
};
const MALAY_ORDER = {
  'MMM d, yyyy': 'd MMM yyyy',
  'MMM dd, yyyy HH:mm': 'd MMM yyyy, HH:mm',
  'MMM dd': 'd MMM',
  'MMM d': 'd MMM',
  'EEE, MMM d': 'EEE, d MMM',
  'h:mm a': 'h:mm a',
  'HH:mm': 'HH:mm',
  'MMM d, h:mm a': 'd MMM, h:mm a',
  'MMM d, HH:mm': 'd MMM, HH:mm',
};

export function formatAppDate(date, pattern) {
  const language = appLanguage();
  if (language === 'id') return format(date, INDONESIAN_ORDER[pattern] ?? pattern, { locale: indonesian });
  if (language === 'zh') return format(date, CHINESE_ORDER[pattern] ?? pattern, { locale: chinese });
  if (language === 'ms') {
    // PG / PTG as Intl writes them for ms-MY (date-fns' ms locale says AM / PM).
    const when = new Date(date);
    const period = when.getHours() < 12 ? "'PG'" : "'PTG'";
    return format(when, (MALAY_ORDER[pattern] ?? pattern).replace(/(^|[^a'])a(?![a'])/g, `$1${period}`), { locale: malay });
  }
  return format(date, pattern);
}

// "5 minutes ago" / "5 menit yang lalu" / "5 分钟前" / "5 minit yang lalu".
const TIME_AGO_LOCALE = { id: indonesian, zh: chinese, ms: malay };
export function appTimeAgo(date) {
  const locale = TIME_AGO_LOCALE[appLanguage()];
  return formatDistanceToNow(date, locale ? { addSuffix: true, locale } : { addSuffix: true });
}
