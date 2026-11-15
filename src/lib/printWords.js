// The words a printed receipt or kitchen chit uses: the shop's own language (shopLanguage in
// appText.js: Bahasa Indonesia for a shop in Indonesia, else English), with its dates. The
// receipt builders (printerUtils.js, tableBill.js) take them, and fall back to English.
import { useEffect, useState } from 'react';
import { englishText, shopLanguage, wordsIn } from './appText';

export const ENGLISH_PRINT = { t: englishText, locale: 'en-SG', language: 'en' };

export async function printWords(tenant) {
  const language = shopLanguage(tenant);
  if (language === 'en') return ENGLISH_PRINT;
  return { t: await wordsIn(language), locale: 'id-ID', language };
}

// Words from usePrintWords below if they're the shop's already, else loaded now (a tap right
// after the screen opened).
export async function readyPrintWords(tenant, words) {
  return words?.language === shopLanguage(tenant) ? words : printWords(tenant);
}

// The same for a preview on screen (the receipt and chit previews): English until the shop's
// words have loaded, a moment later.
export function usePrintWords(tenant) {
  const language = shopLanguage(tenant);
  const [words, setWords] = useState(ENGLISH_PRINT);
  useEffect(() => {
    let current = true;
    printWords({ country: language === 'id' ? 'Indonesia' : '' })
      .then((next) => { if (current) setWords(next); })
      .catch(() => {});
    return () => { current = false; };
  }, [language]);
  return words.language === language ? words : ENGLISH_PRINT;
}
