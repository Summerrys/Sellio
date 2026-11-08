import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
		},
		// A change made offline fails at once and says so (lib/plainError.js), rather than
		// waiting unseen and going through later: Sellio doesn't queue changes.
		mutations: {
			networkMode: 'always',
		},
	},
});
