import * as state from './state';
import * as calc from './calc';
import * as easystorage from '../utils/easystorage.js'

export const getItem = (key) => { return easystorage.getItem(key); }
export const setItem = (key, value) => { easystorage.setItem(key, value); }
export const removeItem = (key) => { easystorage.removeItem(key); }


export const saveMoodData = (dateKey = null) => {
	const all = state.getMoodHistoryByDateAll();
	if (dateKey) {
		// Save just one day
		const [y, m, d] = dateKey.split('-');
		if (all[y] && all[y][m]) {
			const key = 'mood_' + dateKey;
			const val = String(all[y][m][d]);
			if(val == 0 || !val || isNaN(Number(val)) ) {
				easystorage.removeItem(key);
				state.unsetMoodHistoryByDate(key);
			}else{
				state.setMoodHistoryByDate(key, val);
				easystorage.setItem(key, val);
			}
		}
	} 
};

export const loadMoodData = (startDate = null, endDate = null, opts = {}) => {
	// If explicit request to load all data, keep existing behavior
	if (opts.loadAll) {
		const data = easystorage.retrieveData(false, true, { onDone: null });
		state.setMoodHistoryCache(null);
		try { state.setMoodHistoryByDateAll(JSON.parse(data)); } catch (e) { state.setMoodHistoryByDateAll({}); }
		return data;
	}

	// Accept Date objects or ISO date strings (YYYY-MM-DD) for startDate/endDate
	try {
		state.setMoodHistoryCache(null);
		let sDate, eDate;
		if (startDate instanceof Date) sDate = new Date(startDate.getTime());
		else if (typeof startDate === 'string' && startDate.trim()) sDate = new Date(startDate);
		if (endDate instanceof Date) eDate = new Date(endDate.getTime());
		else if (typeof endDate === 'string' && endDate.trim()) eDate = new Date(endDate);

		// Default to 7-day window centered on debug date if no range provided
		if (!sDate || !eDate) {
			const view = state.getDebugDate();
			const numDays = 7;
			const startOffset = -Math.floor(numDays / 2);
			const msPerDay = getMsPerDay();
			sDate = new Date(view.getTime() + startOffset * msPerDay);
			eDate = new Date(view.getTime() + (startOffset + numDays - 1) * msPerDay);
		}

		// Normalize to midnight
		sDate.setHours(0,0,0,0); eDate.setHours(0,0,0,0);
		const msPerDay = getMsPerDay();
		// Ensure window is center +/- 3 days when defaulting
		// (sDate/eDate already computed accordingly by caller or default logic)
		for (let ts = sDate.getTime(); ts <= eDate.getTime(); ts += msPerDay) {
			const d = new Date(ts);
			const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			try {
				const stored = easystorage.getItem('mood_' + k);
				if (stored !== undefined && stored !== null) {
					let parsed = stored;
					if (typeof parsed === 'string' && parsed.trim().length) {
						try { parsed = JSON.parse(parsed); } catch (e) { /* leave as-is */ }
					}
					state.setMoodHistoryByDate(k, parsed);
				}
			} catch (e) { /* ignore per-key errors */ }
		}
		// Also ensure today's entry is loaded (in case it's outside the center window)
		try {
			const today = new Date(); today.setHours(0,0,0,0);
			const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
			if (state.getMoodHistoryByDate(todayKey) === undefined) {
				const stored = easystorage.getItem('mood_' + todayKey);
				if (stored !== undefined && stored !== null) {
					let parsed = stored;
					if (typeof parsed === 'string' && parsed.trim().length) {
						try { parsed = JSON.parse(parsed); } catch (e) { /* leave as-is */ }
					}
					state.setMoodHistoryByDate(todayKey, parsed);
				}
			}
		} catch (e) { /* ignore */ }
		return true;
	} catch (e) {
		return false;
	}
};

export const commitMoodData = () => {
	easystorage.commitData();
}

// Load a whole month from storage (returns flat map of 'YYYY-MM-DD' -> value)
export const loadMoodMonth = (year, monthIndex) => {
	try {
		const snapshot = easystorage.getSnapshot();
		const nested = easystorage.toNested(snapshot);
		const y = String(year);
		const m = String(Number(monthIndex) + 1).padStart(2, '0');
		const out = {};
		if (nested && nested[y] && nested[y][m]) {
			const days = nested[y][m];
			for (const d in days) {
				const key = `${y}-${m}-${String(d).padStart(2, '0')}`;
				out[key] = days[d];
			}
		}
		return out;
	} catch (e) {
		return {};
	}
}

// Helper: parse mood_YYYY-MM-DD key to timestamp
export function parseMoodKeyToTs(key) {
	if (typeof key !== 'string') return null;
	if (!key || !key.startsWith('mood_')) return null;
	const parts = key.slice(5).split('-');
	if (parts.length !== 3) return null;
	const [y, m, d] = parts;
	const dt = new Date(Number(y), Number(m)-1, Number(d));
	return dt.setHours(0,0,0,0);
}