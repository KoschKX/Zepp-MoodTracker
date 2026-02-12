import * as state from './state';
import * as calc from './calc';
import * as easystorage from '../utils/easystorage.js'

export const getItem = (key) => { return easystorage.getItem(key); }
export const setItem = (key, value) => { easystorage.setItem(key, value); }
export const removeItem = (key) => { easystorage.removeItem(key); }

//export const saveMoodData = () => storage.setItem('mood_history', state.getMoodHistoryStringByDate());
export const saveMoodData = (dateKey = null) => {
	const all = state.getMoodHistoryByDateAll();
	if (dateKey) {
		// Save just one day
		const [y, m, d] = dateKey.split('-');
		if (all[y] && all[y][m]) {
			const key = 'mood_' + dateKey;
			const val = String(all[y][m][d]);
			state.setMoodHistoryByDate(key, val);
			if(val == 0 || !val || isNaN(Number(val)) ) {
				easystorage.processData('delete', { data: { [key]: 0}, log: false, onDone: function(){
					const data = easystorage.retrieveData(false, true, {onDone: null } );
					console.log('MOOD KEYS (storage):', data);
				}}); 
			}else{
				easystorage.processData('save', { data: { [key]: val }, log: false , onDone: function(){
					const data = easystorage.retrieveData(false, true, {onDone: null } );
					console.log('MOOD KEYS (storage):', data);
				}}); 
			}
		}
	} else {
		//easystorage.processPayload(action = 'save', opts = {data: { [key]: value }}); 
	}
};

export const loadMoodData = () => {
	const data = easystorage.retrieveData(false, true, {onDone: null } );
	state.setMoodHistoryCache(null);
	state.setMoodHistoryByDateAll(JSON.parse(data));
				// Update in-memory state using the unprefixed date key
				try { state.setMoodHistoryByDate(dateKey, all[y][m][d]); } catch (e) {}
	return data;
};

export const commitMoodData = () => {
	easystorage.commitData();
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