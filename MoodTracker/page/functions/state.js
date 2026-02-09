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
export function setMoodHistoryByDateAll(dat) { _moodDataByDate = dat; }
export function getMoodHistoryByDate(key) { return _moodDataByDate[key]; }
export function setMoodHistoryByDate(key, val) { _moodDataByDate[key] = val; }
export function getMoodHistoryStringByDate() { return JSON.stringify(_moodDataByDate); }
export function setMoodHistoryStringByDate(str) { _moodDataByDate = str; }
export function unsetMoodHistoryByDate(key) { delete _moodDataByDate[key]; }

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