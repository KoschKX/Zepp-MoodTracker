import { sendMoodDataToPhone, requestMoodDataFromPhone, pingPhone } from '../utils/sync.js';

import * as globals from '../globals.js';
import * as state from './state.js';
import * as calc from './calc.js';
import * as storage from './storage.js';
import { compress } from '../utils/compression.js';

export const getTodayMood = (date = state.getDebugDate()) => state.getMoodHistoryByDate(calc.formatDateKey(date)) || null;
export const setTodayMood = (v) => {
    const dateKey = calc.formatDateKey(state.getDebugDate());
	if (v == null) {
		state.unsetMoodHistoryByDate(dateKey);
	} else {
		state.setMoodHistoryByDate(dateKey, v);
	}
    setTimeout(() => {
    	const lastMoodData = JSON.stringify({ [dateKey]: state.getMoodHistoryByDate(dateKey) });
		if(globals.IMMEDIATE_SAVE){
			storage.saveMoodData(dateKey);
		}
    	sendDataToPhone(lastMoodData);
	}, 0);
	return;
};
export const unsetTodayMood = () => {
	const dateKey = calc.formatDateKey(state.getDebugDate());
	state.unsetMoodHistoryByDate(dateKey);
	setTimeout(() => {
		try {
			storage.saveMoodData(dateKey);
		} catch (e) {}
		// SINGLE
		try { sendDataToPhone(JSON.stringify({ [dateKey]: null })); } catch (e) {}
	}, 0);
};

export function sendDataToPhone(dt = null) {
	const vis = getVis();
	const log = (msg, isError) => globals.DEBUG_MODE && (isError ? vis.error(msg) : vis.log(msg));
	log('=== SYNC START ===');
	if (dt != null) {
		sendMoodDataToPhone(dt, true, log);
		return;
	}
	try {
		const payload = storage.loadMoodData(); 
		sendMoodDataToPhone(payload, false, log);
	} catch (e) {
		const data = getItem();
		sendMoodDataToPhone(data, false, log);
	}
}

export const syncToSettingsStorage = (data, params, single=false) => {
	let method = 'SYNC_MOOD_DATA';
	if(single) { method = 'SYNC_MOOD_DATA_SINGLE'; }
	try {
		const app = getApp && getApp();
		if (app && app.globalData && app.globalData.messageBuilder) {
			const moodHistory = typeof data === 'object' ? data : {};
			let finalParams = params;
			if (typeof finalParams === 'object') {
				finalParams = JSON.stringify(finalParams);
			}
			if (globals.ENABLE_COMPRESSION_OUTGOING && single && typeof finalParams === 'string') {
				finalParams = compress(finalParams);
			}
			app.globalData.messageBuilder.request({
				method: method,
				params: finalParams
			});
		}
	} catch (e) {}
	// --- Robust getApp fallback ---
	function getAppFallback() {
	  if (typeof getApp === 'function') return getApp();
	  if (typeof globalThis !== 'undefined' && globalThis.app) return globalThis.app;
	  if (typeof window !== 'undefined' && window.app) return window.app;
	  if (typeof app !== 'undefined') return app;
	  return null;
	}
	try {
		const app = (typeof getApp === 'function' ? getApp() : getAppFallback());
		const debugLog = (msg) => { try { console.log('['+method+']', msg); } catch {} };
		debugLog('Attempting to sync to settings storage...');
		if (app && app.globalData && app.globalData.messageBuilder) {
			debugLog('Found app.globalData.messageBuilder, sending request...');
			const moodHistory = typeof data === 'object' ? data : {};
			app.globalData.messageBuilder.request({
				method: method,
				params:params
			});
			debugLog('Request sent via messageBuilder.');
		} else if (typeof window !== 'undefined' && window.parent && window.parent.postMessage) {
			debugLog('Falling back to window.parent.postMessage...');
			window.parent.postMessage({ method: method, params: params }, '*');
		} else {
			debugLog('No valid sync method found.');
		}
	} catch (e) {
		try { console.log('['+method+'] Error:', e); } catch {}
	}
};

export function checkSyncToWatch(precall = null, callback = null) {
 	const app = getApp && getApp();
	const token = app?.globalData?.moodDataClearedAt || 0;
	if (app && app.globalData) {
		app.globalData.onMoodSyncToWatch = (token) => {
			state.setLastClearToken(token);
			if(precall)	precall();
		}
		state.handleToken(token);
	}
}
export function checkDataChange(precall = null, callback = null) {
	const app = getApp && getApp();
	if (app && app.globalData) {
	const token = app?.globalData?.moodDataClearedAt || 0;
	app.globalData.onMoodDataCleared = (token) => {
		try {
			if (token && token !== state.getLastClearToken()) {
				state.setLastClearToken(token);
				if(precall)	precall();
				/*
				const result = requestMoodDataFromPhone();
				if (result?.then) {
					// --- Keep screen awake workaround ---
					result.then(response => {
						clearInterval(keepAliveInterval);
						const moodData = response?.moodData || '{}';
						state.setMoodHistoryCache(null);
						storage.setItem('mood_history', moodData);
						reloadMoodDataFromStorage();
						if (callback) callback();
					})
				}
				*/
			}
		} catch (e) { console.error('Error in onMoodDataCleared callback:', e); }
	};
	state.handleToken(token);
	}
}

export function checkMoodParam(params) {
	// Mood from mood_select: update data before render
	let moodValue = null;
	try {
	  if (params && typeof params === 'string') {
		if (params.startsWith('{')) {
		  const parsed = JSON.parse(params);
		  moodValue = parsed?.mood ?? null;
		} else {
		  moodValue = params;
		}
	  } else if (params && typeof params === 'object') {
		moodValue = params.mood ?? null;
	  }
	  if (moodValue == null) {
		const app = getApp && getApp();
		if (app?.globalData?.selectedMood) {
		  moodValue = app.globalData.selectedMood;
		  app.globalData.selectedMood = null;
		}
	  }
	} catch (e) {}
	if (moodValue != null && `${moodValue}`.length) {
		const moodNum = Number(moodValue);
		const today = new Date();
		if (!Number.isNaN(moodNum)) {
			setTodayMood(moodNum);
		} 
	}
}

// CALC



// HELPERS 
export function toNested(obj) {
	if (!obj || typeof obj !== 'object') return {};
	const nested = {};
	for (const key in obj) {
		if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(key)) {
			const [y, mRaw, dRaw] = key.split('-');
			const m = mRaw.padStart(2, '0');
			const d = dRaw.padStart(2, '0');
			if (!nested[y]) nested[y] = {};
			if (!nested[y][m]) nested[y][m] = {};
			nested[y][m][d] = obj[key];
		} else if (/^\d{4}$/.test(key) && typeof obj[key] === 'object') {
			nested[key] = toNested(obj[key]);
		}
	}
	return nested;
}
export function flattenMoodHistory(nested) {
	const flat = {};
	if (!nested || typeof nested !== 'object') return flat;
	for (const y in nested) {
		if (!/^[0-9]{4}$/.test(y)) continue;
		const months = nested[y];
		for (const m in months) {
			if (!/^[0-9]{2}$/.test(m)) continue;
			const days = months[m];
			for (const d in days) {
				if (!/^[0-9]{2}$/.test(d)) continue;
				flat[`${y}-${m}-${d}`] = days[d];
			}
		}
	}
	return flat;
}

// CONSTANTS
export const msPerDay = 24 * 60 * 60 * 1000;
export const getMsPerDay = () => { return msPerDay; };
export const getDateStr = (m) => m === 1 ? `${globals.monthNamesAbv[state.getDebugDate().getMonth()]} ${state.getDebugDate().getFullYear()}` : `${state.getDebugDate().getMonth() + 1}/${state.getDebugDate().getDate()}/${state.getDebugDate().getFullYear()}`;

export const getVis = () => { try { const app = getApp(); if (app?.globalData?.vis) return app.globalData.vis; } catch (e) {} const noop = () => {}; return { log: noop, info: noop, warn: noop, error: noop, initSideRelay: noop, updateSettings: noop, handleSideServiceCall: () => false }; };