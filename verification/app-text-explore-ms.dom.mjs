// verification/app-text-explore.dom.mjs in Malay: the same screens with the Malay words, no English left on them.
// Run: node verification/app-text-explore-ms.dom.mjs   (jsdom installed in /tmp/sellio-verification)
process.env.APP_TEXT_LANGUAGE = 'ms';
await import('./app-text-explore.dom.mjs');
