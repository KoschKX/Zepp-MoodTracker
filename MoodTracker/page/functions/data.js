import { localStorage } from '@zos/storage';
import { sendMoodDataToPhone, requestMoodDataFromPhone, pingPhone } from '../../utils/sync';

import * as globals from '../globals';
import * as state from './state';
import * as ui from './ui';

export const getTodayMood = (date = state.getDebugDate()) => state.getMoodHistoryByDate(formatDateKey(date)) || null;
export const setTodayMood = (v) => {
	const dateKey = formatDateKey(state.getDebugDate());
	if (v == null) {
		state.unsetMoodHistoryByDate(dateKey);
	} else {
		state.setMoodHistoryByDate(dateKey, v);
	}
	// Async: sync/send in background so UI updates instantly
	setTimeout(() => {
		try {
			const lastMoodData = JSON.stringify({ [dateKey]: state.getMoodHistoryByDate(dateKey) });
			//syncToSettingsStorage(lastMoodData, null, true);
			sendDataToPhone(lastMoodData);
		} catch {}
	}, 0);
};

export function sendDataToPhone(dt = null) {
    const vis = getVis();
    const log = (msg, isError) => globals.DEBUG_MODE && (isError ? vis.error(msg) : vis.log(msg));
    log('=== SYNC START ===');
    let data = getItem();
	if(dt != null) { data = dt; }
    log('Data size: ' + data.length);
    sendMoodDataToPhone(data, true, log);
}

export const syncToSettingsStorage = (data, params, single=false) => {
	let method = 'SYNC_MOOD_DATA';
	if(single) { method = 'SYNC_MOOD_DATA_SINGLE'; }	
    try {
        const app = getApp && getApp();
        if (app && app.globalData && app.globalData.messageBuilder) {
            const moodHistory = typeof data === 'object' ? data : {};
            app.globalData.messageBuilder.request({
                method: method,
                params:  params
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

export const scheduleMoodHistorySave = () => { if (state.getStorageWriteTimeout()) clearStorageWriteTimeout(); state.setStorageWriteTimeout( setTimeout(() => { saveMoodData(); state.setStorageWriteTimeout(null); }, 200) ); };
export const saveMoodData = () => localStorage.setItem('mood_history', getItem());

export const reloadMoodDataFromStorage = () => {
	try {
		const saved = localStorage.getItem('mood_history');
		setItem('mood_history', saved || '{}');
	} catch (e) {
		state.setMoodHistoryByDateAll({});
	}
	state.setCachedDebugDate(null);
};

export const getMoodHistorySnapshot = () => {
	try {
		return localStorage.getItem('mood_history') || '';
	} catch (e) {
		return '';
	}
};

export function getClearedAtToken() {
    try {  const v = localStorage.getItem('mood_history_cleared_at');  return v ? Number(v) : 0; } catch (e) { return 0; }
};

export const getItem = () => state.getMoodHistoryStringByDate();
export const setItem = (key, value) => {  if (key === 'mood_history') try { state.setMoodHistoryByDateAll(JSON.parse(value)); } catch { state.setMoodHistoryByDateAll({}); } };
try { const saved = localStorage.getItem('mood_history'); if (saved) setItem('mood_history', saved); } catch (e) {}

export function checkDataChange(precall = null, callback = null) {
	  const app = getApp && getApp();
	  if (app && app.globalData) {
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
							localStorage.setItem('mood_history', moodData);
							reloadMoodDataFromStorage();
							if (callback) callback();
						})
					}
					*/
				}
			} catch (e) { console.error('Error in onMoodDataCleared callback:', e); }
		};
		const token = app?.globalData?.moodDataClearedAt || 0;
		const storedToken = getClearedAtToken();
		const nextToken = token || storedToken;
		if (nextToken && nextToken !== state.getLastClearToken()) {
			state.setLastClearToken(nextToken);
			state.getLastMoodHistorySnapshot(getMoodHistorySnapshot());
     	}
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
	  if (!Number.isNaN(moodNum)) {
		const today = new Date();
		const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
		state.setMoodHistoryByDate(dateKey, moodNum);
		setTimeout(() => {
		  try {
			localStorage.setItem('mood_history', state.getMoodHistoryStringByDate());
			sendMoodDataToPhone(state.getMoodHistoryStringByDate(), true, log);
			console.log('[MoodPage] Mood saved successfully!');
		  } catch (e) {
			console.log('[MoodPage] Error saving mood:', e);
		  }
		}, 0);
	  }
	}
}

export const getMoodHistoryForDays = (numDays) => {
	const offset = state.getDebugDayOffset();
	const cacheKey = `${numDays}_${state.getGraphWindowMode()}_${offset}_${Object.keys(state.getMoodHistoryByDateAll()).length}`;
	if (state.getMoodHistoryCache() && state.getMoodHistoryCacheKey() === cacheKey) {
		console.log('[MoodHistory] Using cached mood data:', state.getMoodHistoryCache());
		return state.getMoodHistoryCache();
	}
	const view = state.getDebugDate(), today = new Date(), todayKey = formatDateKey(today);
	const base = state.getGraphWindowMode() ? new Date(view.getFullYear(), view.getMonth(), 1).getTime() : view.getTime(), start = state.getGraphWindowMode() ? 0 : -Math.floor(numDays / 2);
	state.setMoodHistoryCacheKey(cacheKey);
	const moodArr = Array.from({ length: numDays }, (_, i) => { const d = new Date(base + (start + i) * getMsPerDay()), k = formatDateKey(d); return { day: d.getDate(), mood: state.getMoodHistoryByDate(k), isToday: k === todayKey }; });
	console.log('[MoodHistory] Fresh mood data:', moodArr);
	state.setMoodHistoryCache(moodArr);
	return moodArr;
};


// CALC
export function swingPercentage(moodData) {
	let swingSum = 0, consecutivePairs = 0;
	for (let i = 1; i < moodData.length; i++) {
		if (moodData[i].mood && moodData[i-1].mood && moodData[i].day - moodData[i-1].day === 1) {
			swingSum += Math.abs(moodData[i].mood - moodData[i-1].mood);
			consecutivePairs++;
		}
	}
	if (consecutivePairs === 0) return '-';
	return ((swingSum / consecutivePairs) * 100).toFixed(1) + '%';
}
export const getMonthAverageMood = () => {
	const d = state.getDebugDate(), y = d.getFullYear(), m = d.getMonth(), days = new Date(y, m + 1, 0).getDate();
	let sum = 0, cnt = 0;
	for (let i = 1; i <= days; i++) { const mood = state.getMoodHistoryByDate(formatDateKey(new Date(y, m, i))); if (mood) sum += mood, cnt++; }
	return cnt ? Math.ceil(sum / cnt) : null;
};

// CONSTANTS
export const msPerDay = 24 * 60 * 60 * 1000;
export const getMsPerDay = () => { return msPerDay; };
export const getDateStr = (m) => m === 1 ? `${globals.monthNamesAbv[state.getDebugDate().getMonth()]} ${state.getDebugDate().getFullYear()}` : `${state.getDebugDate().getMonth() + 1}/${state.getDebugDate().getDate()}/${state.getDebugDate().getFullYear()}`;

export const getVis = () => { try { const app = getApp(); if (app?.globalData?.vis) return app.globalData.vis; } catch (e) {} const noop = () => {}; return { log: noop, info: noop, warn: noop, error: noop, initSideRelay: noop, updateSettings: noop, handleSideServiceCall: () => false }; };
export const formatDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

