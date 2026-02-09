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

export function clearStorageWriteTimeout(){ clearTimeout(state._storageWriteTimeout); }
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