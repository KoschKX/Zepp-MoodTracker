import * as calc from './calc.js';
import { storage } from '@zos/storage';

// STATE 
let _moodDataByDate = {};
let _interpolationEnabled = false;
let _debugDayOffset = 0;
let _cachedDebugDate = null;
let _cachedDebugOffset = 0;
let _navDebounceTimer = null;
let _dateUpdateThrottle = null;
let _prevDisplayedMood = null;
let _prevDateStr = '';
let _graphNeedsRedraw = false;
let _isNavigating = false;
let _loadingText = null;
let _lastClearToken = 0;
let _lastMoodHistorySnapshot = '';
let _storageWriteTimeout = null;
let _lastDebugOffset = 0;

let _graphWindowMode = 0;

const _dateKeyCache = new Map();


// Declare missing local state
let lastDebugOffset = 0;

// --- GETTERS & SETTERS ---
export function getDebugDayOffset() { return _debugDayOffset; }
export function setDebugDayOffset(val) { _debugDayOffset = val;}
export function getCachedDebugDate() { return _cachedDebugDate; }
export function setCachedDebugDate(date) { _cachedDebugDate = date; }
export function getCachedDebugOffset() { return _cachedDebugOffset; }
export function setCachedDebugOffset(offset) { _cachedDebugOffset = offset; }

export function getMoodHistoryCache() { return _moodHistoryCache; }
export function setMoodHistoryCache(cache) { _moodHistoryCache = cache; }
export function getMoodHistoryCacheKey() { return _moodHistoryCacheKey; }
export function setMoodHistoryCacheKey(key) { _moodHistoryCacheKey = key; }
export function getMoodHistoryByDateAll() { return _moodDataByDate; }
export function setMoodHistoryByDateAll(dat) {
	// Accept either nested {YYYY: {MM: {DD: val}}} or flat {"YYYY-M-D": val}
	const normalize = (input) => {
		if (!input || typeof input !== 'object') return {};
		// Detect flat keys like 2026-2-3 or 2026-02-03
		const keys = Object.keys(input);
		if (keys.length === 0) return {};
		const isFlat = keys.every(k => /^\d{4}-\d{1,2}-\d{1,2}$/.test(k));
		if (isFlat) {
			const out = {};
			for (const k of keys) {
				const [y, mRaw, dRaw] = k.split('-');
				const m = String(mRaw).padStart(2, '0');
				const d = String(dRaw).padStart(2, '0');
				if (!out[y]) out[y] = {};
				if (!out[y][m]) out[y][m] = {};
				out[y][m][d] = input[k];
			}
			return out;
		}
		// Already nested but ensure month/day keys are zero-padded
		const out = {};
		for (const y of Object.keys(input)) {
			if (!/^\d{4}$/.test(y)) continue;
			out[y] = {};
			const months = input[y] || {};
			for (const mRaw of Object.keys(months)) {
				const m = String(mRaw).padStart(2, '0');
				out[y][m] = {};
				const days = months[mRaw] || months[m] || {};
				for (const dRaw of Object.keys(days)) {
					const d = String(dRaw).padStart(2, '0');
					out[y][m][d] = days[dRaw] ?? days[d] ?? days[Number(dRaw)] ?? days;
				}
			}
		}
		return out;
	};

	_moodDataByDate = normalize(dat);
	try { console.log(JSON.stringify(_moodDataByDate)); } catch (e) {}
}
/*
export function setMoodHistoryByDateAll(dat) {
	function padNestedKeys(nested) {
		if (!nested || typeof nested !== 'object') return {};
		const out = {};
		for (const y in nested) {
			if (!/^[0-9]{4}$/.test(y)) continue;
			out[y] = {};
			for (const m in nested[y]) {
				const mm = m.padStart(2, '0');
				out[y][mm] = {};
				for (const d in nested[y][m]) {
					const dd = d.padStart(2, '0');
					out[y][mm][dd] = nested[y][m][d];
				}
			}
		}
		return out;
	}
	if (dat && typeof dat === 'object' && Object.keys(dat).every(y => typeof dat[y] === 'object')) {
		// Already nested structure, but may need padding
		_moodDataByDate = padNestedKeys(dat);
	} else {
		// Flat structure, needs nesting and padding
		_moodDataByDate = padNestedKeys(toNested(dat));
	}
}
*/
export function getMoodHistoryByDate(key) {
	const [y, m, d] = key.split('-');
	return _moodDataByDate?.[y]?.[m]?.[d] ?? undefined;
}
export function setMoodHistoryByDate(key, val) {
	const [y, m, d] = key.split('-');
	if (!_moodDataByDate[y]) _moodDataByDate[y] = {};
	if (!_moodDataByDate[y][m]) _moodDataByDate[y][m] = {};
	_moodDataByDate[y][m][d] = val;
}
export function getMoodHistoryStringByDate() { return JSON.stringify(_moodDataByDate); }
export function setMoodHistoryStringByDate(str) { _moodDataByDate = toNested(JSON.parse(str)); }
export function unsetMoodHistoryByDate(key) {
	const [y, m, d] = key.split('-');
	if (_moodDataByDate?.[y]?.[m]) delete _moodDataByDate[y][m][d];
}

export function getInterpolationEnabled() { return _interpolationEnabled; }
export function setInterpolationEnabled(enabled) { _interpolationEnabled = enabled; }

export function setPrevDisplayedMood(mood) { _prevDisplayedMood = mood; };
export function getPrevDisplayedMood() { return _prevDisplayedMood; };

export function getGraphWindowMode() { return _graphWindowMode; }
export function setGraphWindowMode(mode) { _graphWindowMode = mode; }

export function getDateUpdateThrottle() { return _dateUpdateThrottle; }
export function setDateUpdateThrottle(throttle) { _dateUpdateThrottle = throttle; }

export function getIsNavigating () { return _isNavigating; }
export function setIsNavigating (navigating) { _isNavigating = navigating; }

export function getLastClearToken() { return _lastClearToken; }
export function setLastClearToken(token) { _lastClearToken = token; }
export function handleToken(token){
	const storedToken = getClearedAtToken();
	const nextToken = token || storedToken;
	if (nextToken && nextToken !== getLastClearToken()) {
		setLastClearToken(nextToken);
		// Avoid importing data.js here (circular dependency). Read snapshot directly.
		try {
			const snap = storage.getItem('mood_history') || '';
			setLastMoodHistorySnapshot(snap);
		} catch (e) {
			setLastMoodHistorySnapshot('');
		}
	}
}
export function getClearedAtToken() {
    try {  const v = storage.getItem('mood_history_cleared_at');  return v ? Number(v) : 0; } catch (e) { return 0; }
};


export function clearStorageWriteTimeout(){ clearTimeout(_storageWriteTimeout); }
export function setStorageWriteTimeout(timeout) { _storageWriteTimeout = timeout; }
export function getStorageWriteTimeout() { return _storageWriteTimeout; }

export function setNavDebounceTimer (timer) { _navDebounceTimer = timer; }
export function getNavDebounceTimer () { return _navDebounceTimer; }

export function getLastMoodHistorySnapshot  () { return _lastMoodHistorySnapshot; }
export function setLastMoodHistorySnapshot  (snapshot) { _lastMoodHistorySnapshot = snapshot; }

// --- DEBUG DATE ---
export const getDebugDate = () => { 
	const offset = getDebugDayOffset();
	const cachedDate = getCachedDebugDate();
	const cachedOffset = getCachedDebugOffset();
	if (cachedDate && cachedOffset === offset) return cachedDate;
	const date = new Date(); 
	date.setDate(date.getDate() + offset); 
	setCachedDebugDate(date);
	setCachedDebugOffset(offset);
	return date; 
};


export const getMoodHistoryForDays = (numDays, isMonthMode = false) => {
	const offset = getDebugDayOffset();
	const cacheKey = `${numDays}_${isMonthMode ? 1 : 0}_${offset}_${Object.keys(getMoodHistoryByDateAll()).length}`;
	if (getMoodHistoryCache() && getMoodHistoryCacheKey() === cacheKey) {
		return getMoodHistoryCache();
	}
	const view = getDebugDate(), today = new Date(), todayKey = calc.formatDateKey(today);
	const base = isMonthMode ? new Date(view.getFullYear(), view.getMonth(), 1).getTime() : view.getTime();
	const start = isMonthMode ? 0 : -Math.floor(numDays / 2);
	setMoodHistoryCacheKey(cacheKey);
	const _debugKeys = [];
	const moodArr = Array.from({ length: numDays }, (_, i) => {
		const d = new Date(base + (start + i) * getMsPerDay()), k = calc.formatDateKey(d);
		_debugKeys.push(k);
		let raw = getMoodHistoryByDate(k);
		// Normalize shapes: support { mood: X } objects, numeric strings, and plain numbers
		let moodVal = null;
		try {
			if (raw && typeof raw === 'object' && raw.mood !== undefined) {
				moodVal = raw.mood;
			} else {
				moodVal = raw;
			}
			if (typeof moodVal === 'string' && moodVal.trim().length) {
				const n = Number(moodVal);
				moodVal = Number.isNaN(n) ? moodVal : n;
			}
			if (typeof moodVal === 'number' && !Number.isFinite(moodVal)) moodVal = null;
		} catch (e) { moodVal = raw; }
		return { day: d.getDate(), mood: moodVal, isToday: k === todayKey };
	});
	setMoodHistoryCache(moodArr);
	return moodArr;
};

// DOT STATES 

export const getMoodState = () => state.getMoodHistoryStringByDate();
export const setMoodState = (key, value) => {
	if (key === 'mood_history') {
		try {
			state.setMoodHistoryByDate(JSON.parse(value));
		} catch {
			state.setMoodHistoryByDate({});
		}
	}
};
export const getMoodHistorySnapshot = () => {
	try {
		return storage.getItem('mood_history') || '';
	} catch (e) {
		return '';
	}
};

// CONSTANTS
export const msPerDay = 24 * 60 * 60 * 1000;
export const getMsPerDay = () => { return msPerDay; };
export const getDateStr = (m) => m === 1 ? `${globals.monthNamesAbv[state.getDebugDate().getMonth()]} ${state.getDebugDate().getFullYear()}` : `${state.getDebugDate().getMonth() + 1}/${state.getDebugDate().getDate()}/${state.getDebugDate().getFullYear()}`;

export const getVis = () => { try { const app = getApp(); if (app?.globalData?.vis) return app.globalData.vis; } catch (e) {} const noop = () => {}; return { log: noop, info: noop, warn: noop, error: noop, initSideRelay: noop, updateSettings: noop, handleSideServiceCall: () => false }; };
export const formatDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;