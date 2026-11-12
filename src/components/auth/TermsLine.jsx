import React from 'react';
import { useAppText } from '@/lib/appText';

const LINK = 'font-semibold text-orange-500 hover:text-orange-600 underline underline-offset-2';

// "By continuing, you agree to Sellio’s Terms and Conditions and Privacy Policy." under the
// sign-in and sign-up forms. One sentence with the links as blanks, so a translation can put
// the words in its own order.
export default function TermsLine() {
  const { t } = useAppText();
  return t('By continuing, you agree to Sellio’s{br}{terms} and {privacy}.', {
    br: <br />,
    terms: <a href="/terms" className={LINK}>{t('Terms and Conditions')}</a>,
    privacy: <a href="/privacy" className={LINK}>{t('Privacy Policy')}</a>,
  });
}
