import * as globals from '../globals';
import * as state from './state';

import { push } from '@zos/router';

// --- PAGE NAV ----
export function navigateToPage(url, params) {
	if (typeof url === 'string' && url.length > 0) {
		try {
			console.log('[navigateToPage] Attempting navigation to:', url);
			push({  url: url, params: params  });
		} catch (e) {
			console.log('[navigateToPage] Navigation error:', e);
		}
	} else {
		console.log('[navigateToPage] Invalid URL:', url);
	}
}