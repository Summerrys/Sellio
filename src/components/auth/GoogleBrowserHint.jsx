import { isNativeAndroid } from '@/lib/mobileOAuth';
import { useAppText } from '@/lib/appText';

// Under the Google button in the Android app: Google opens in the phone's browser
// (the app first asks "Open External Link?"), then the app opens again.
export default function GoogleBrowserHint() {
  const { t } = useAppText();
  if (!isNativeAndroid()) return null;
  return (
    <p className="mt-2 text-center text-xs leading-snug text-slate-400" data-testid="google-browser-hint">
      {t('Google sign-in opens in your browser, then brings you back here.')}
    </p>
  );
}
