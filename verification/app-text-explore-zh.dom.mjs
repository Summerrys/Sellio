// verification/app-text-explore.dom.mjs in 中文: the same screens with the Chinese words, no English left on them.
// Run: node verification/app-text-explore-zh.dom.mjs   (jsdom installed in /tmp/sellio-verification)
process.env.APP_TEXT_LANGUAGE = 'zh';
await import('./app-text-explore.dom.mjs');
