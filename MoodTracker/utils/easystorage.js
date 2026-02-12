import * as globals from '../globals.js';
import { EasyStorage, AsyncStorage } from '@silver-zepp/easy-storage';
import * as state from '../functions/state.js';

const json_mood = 'moodData.json';

// --- Initialization ---

    let easyStorageInstance = null;
    function ensureEasyStorageInstance() {
        if (easyStorageInstance) return easyStorageInstance;
        try {
            if (typeof EasyStorage === 'function') {
                easyStorageInstance = new EasyStorage();
                if (typeof globalThis !== 'undefined') globalThis.easyStorageInstance = easyStorageInstance;
                console.log('[storager] EasyStorage instantiated at load time');
                return easyStorageInstance;
            }
        } catch (e) { /* ignore */ }
        return null;
    }
    const easyStorage = ensureEasyStorageInstance();


/* CHANGE HISTORY */

    let _changeLog = (typeof globalThis !== 'undefined' && globalThis.__mood_change_log instanceof Map) ? globalThis.__mood_change_log : new Map();
    if (typeof globalThis !== 'undefined') globalThis.__mood_change_log = _changeLog;
    function normalizeKeyForStorageLocal(k) {
        if (!k || typeof k !== 'string') return k;
        if (k.startsWith('mood_')) return k;
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(k)) return 'mood_' + k;
        if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return 'mood_' + k;
        return k;
    }

    function recordChange(key, value) {
        try {
            const nk = normalizeKeyForStorageLocal(key);
            const action = (value == null || value === '' || value === undefined) ? 'delete' : 'save';
            const entry = { key: nk, value: value == null ? null : String(value), ts: Date.now(), action };
            console.log('[storage] Recording change for key:', nk, 'action:', action, 'value:', entry.value);
            _changeLog.set(nk, entry);
            try { console.log('[storage] _changeLog size after record:', _changeLog.size); } catch (e) {}
            // Keep changes in-memory only until commit; do NOT persist here.
            // Persisting on every change caused unwanted writes and potential data
            // loss when `saveAll()` was used. The `commitData()` path will persist
            // the aggregate `_changeLog` when the app exits or explicitly requested.
        } catch (e) { }
    }

// --- Adapter functions ---

    export function getSnapshot() {
        if(globals.ASYNC_DATA){
            return AsyncStorage.ReadJson(json_mood);
        }else{
            return easyStorage.getStorageSnapshot(true);
        }
    }

    export function commitData(){
        if(globals.ASYNC_DATA){
            AsyncStorage.SaveAndQuit();
        }else{
            // console.log('[storage] commitData called - processing change log of size', _changeLog.size);
            //try { if (_changeLog && _changeLog.size > 0) console.log('[storage] commit entries:', Array.from(_changeLog.keys()).slice(0,50).join(', ')); } catch (e) {}
            try {
                if (!_changeLog || _changeLog.size === 0) return true;
                const toSave = {};
                const toDelete = [];
                for (const [k, ent] of _changeLog.entries()) {
                    try {
                        // Use recorded value when present, otherwise consult in-memory state
                        let recordedVal = ent && ent.value !== undefined ? ent.value : null;
                        if (recordedVal == null) {
                            const dateKey = k.startsWith('mood_') ? k.slice(5) : k;
                            const memVal = state.getMoodHistoryByDate(dateKey);
                            recordedVal = (memVal == null) ? null : String(memVal);
                        }
                        if (recordedVal == null || recordedVal === '0' || recordedVal === '' || Number.isNaN(Number(recordedVal))) {
                            toDelete.push(k);
                        } else {
                            toSave[k] = String(recordedVal);
                        }
                    } catch (e) { /* skip on error */ }
                }
                console.log('[storage] commitData prepared toSave=', Object.keys(toSave).length, 'toDelete=', toDelete.length);
                // Attempt synchronous flush using easyStorage so writes complete before app exit.
                if (easyStorage && typeof easyStorage.setKey === 'function') {
                    try {
                        for (const k of Object.keys(toSave)) {
                            try { easyStorage.setKey(k, toSave[k]); } catch (e) { console.log('[storage] sync save error', k, e); }
                        }
                        for (const k of toDelete) {
                            try { easyStorage.removeKey(k); } catch (e) { console.log('[storage] sync delete error', k, e); }
                        }
                        // rebuild aggregated mood_history synchronously
                        try {
                            if (typeof easyStorage.getAllKeys === 'function') {
                                const keys = easyStorage.getAllKeys() || [];
                                const agg = {};
                                for (const k of keys) {
                                    try {
                                        if (!k || typeof k !== 'string') continue;
                                        if (!k.startsWith('mood_')) continue;
                                        const v = typeof easyStorage.getKey === 'function' ? easyStorage.getKey(k) : null;
                                        if (v == null) continue;
                                        const datePart = k.substr(5);
                                        const parts = datePart.split('-');
                                        if (parts.length !== 3) continue;
                                        const [y, m, d] = parts;
                                        if (!agg[y]) agg[y] = {};
                                        const mi = parseInt(m, 10);
                                        const di = parseInt(d, 10);
                                        if (!agg[y][mi]) agg[y][mi] = {};
                                        agg[y][mi][di] = v;
                                    } catch (e) { }
                                }
                                try { if (typeof easyStorage.setKey === 'function') easyStorage.setKey('mood_history', JSON.stringify(agg)); } catch (e) { console.log('[storage] mood_history rebuild error', e); }
                            }
                        } catch (e) { /* ignore */ }
                    } catch (e) { console.log('[storage] commitData sync flush error', e); }
                } else {
                    if (Object.keys(toSave).length > 0) processData('save', { data: toSave, log: true, onDone: null });
                    if (toDelete.length > 0) processData('delete', { data: toDelete, log: true, onDone: null });
                }
                // clear logs (and reset shared global reference)
                _changeLog = new Map();
                try { if (typeof globalThis !== 'undefined') globalThis.__mood_change_log = _changeLog; } catch (e) {}
                return true;
            } catch (e) { return false; }
        }
    }

    export function setItem(key, value) {
        if(!globals.IMMEDIATE_SAVE){ recordChange(key, value); return; }
        if(globals.ASYNC_DATA){
            AsyncStorage.WriteJson(json_mood, key, value);
        }else{
            try { easyStorage.setKey(key, value); } catch (e) {}
        }
    }
    
    export function removeItem(key) {
        if(!globals.IMMEDIATE_SAVE){ recordChange(key, null); return; }
        if(globals.ASYNC_DATA){
            AsyncStorage.WriteJson(json_mood, key, null);
        }else{
            try { easyStorage.removeKey(key); } catch (e) {}
        }
    }

    export function getItem(key) {
        if(globals.ASYNC_DATA){
            return AsyncStorage.ReadJson(json_mood, key);
        }else{
            return easyStorage.getKey(key);
        }
    }


    export function retrieveData( stringify = false, nested = true, opts = {}) {
        const onDone = typeof opts.onDone === 'function' ? opts.onDone : null;
        const log = opts.log === undefined ? false : opts.log;
        if (EasyStorage || AsyncStorage) {
            if(globals.ASYNC_DATA){
                result = AsyncStorage.ReadJson(json_mood, setTimeout(onDone, 0));
                if(stringify){ return JSON.stringify(result); }
            } else {
                result = easyStorage.getStorageSnapshot(true);
                setTimeout(onDone, 0);
            }
            if(nested){ result = toNested(result); }
            if(log){ console.log('[storage] Retrieved payload from storage: ', result); }
            return result;
        }
    }

    export function processData(action = '', opts = {}) {
        // normalize chunk size (prevent zero)
        const chunkSize = Math.max(1, typeof opts.chunkSize === 'number' ? opts.chunkSize : 200);
        const onDone = typeof opts.onDone === 'function' ? opts.onDone : null;
        const data = opts.data === undefined ? (opts || {}).data : opts.data;
        const log = opts.log === undefined ? false : opts.log;

        if(log){ console.log(`[storage] Received request to ${action}`); }

        // Internal chunked implementation
        let normalized = data;
        if (normalized && typeof normalized === 'object') {
            const firstKey = Object.keys(normalized)[0];
            if (firstKey && /^\d{4}$/.test(firstKey)) {
                try { normalized = buildItemsFromNested(normalized); } catch (e) { /* ignore */ }
            }
        }

        let entries = [];
        // Helper to ensure keys are in storage form (mood_YYYY-MM-DD)
        function normalizeKeyForStorage(k) {
            if (!k || typeof k !== 'string') return k;
            if (k.startsWith('mood_')) return k;
            // flat date formats
            if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(k)) return 'mood_' + k;
            // already flattened with padded month/day
            if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return 'mood_' + k;
            return k;
        }

        if (action === 'delete' && Array.isArray(normalized)) {
            entries = normalized.map(k => [normalizeKeyForStorage(k), null]);
        } else if (normalized && typeof normalized === 'object') {
            entries = Object.keys(normalized).map(k => [normalizeKeyForStorage(k), normalized[k]]);
        }

        if(log) { console.log('[storage] total entries ->', entries.length); }

        if (action === '') { if (onDone) onDone(); return false; }
        
        // If there are no entries to process, normally we can finish early.
        // However, for the special 'clear' action we must still run the clear logic
        // below (which operates independently of `entries`), so only short-circuit
        // when action is not 'clear'.
        if (entries.length === 0 && action !== 'clear') { if (onDone) setTimeout(onDone, 0); return true; }

        if(log){ console.log(`[storage] Starting ${action} of ${entries.length} items in chunks of ${chunkSize}...`); }

        let i = 0;

        if (EasyStorage || AsyncStorage) {

            try {

                if (action === 'clear') {
                    if(globals.ASYNC_DATA){
                        AsyncStorage.WriteJson(json_mood, {}, () => {});
                        if (onDone) setTimeout(onDone, 0);
                    }else{
                        console.log('[storage] Clearing all data from easyStorage');
                        easyStorage.deleteAll();
                    }
                    if (onDone) setTimeout(onDone, 0);
                    return true;
                }

                let idx = 0;
                function processEasyStorageChunk() {
                    const end = Math.min(idx + chunkSize, entries.length);
                    try { if(log){  console.log('[storage] easyStorage chunk start idx=', idx, 'end=', end);} } catch (e) {}
                    for (; idx < end; idx++) {
                        const key = entries[idx][0];
                        const val = entries[idx][1];
                        try { if(log){ console.log('[storage] easyStorage processing[' + action + '] ' + String(key));} } catch (e) {}
                        if(globals.ASYNC_DATA){
                            if (action == 'save') {
                                try { AsyncStorage.WriteJson(json_mood, key, val); } catch (e) {if(log){ console.log('[storage] AsyncStorage WriteJson error', e);} }
                            }
                            if (action == 'delete') {
                                try { AsyncStorage.WriteJson(json_mood, key, null); } catch (e) { if(log){ console.log('[storage] AsyncStorage WriteJson error', e); } }
                            }
                        } else {
                            if (action == 'save') {
                                try { easyStorage.setKey(key, val); } catch (e) { if(log){ console.log('[storage] easyStorage setKey error', e); } }
                            }
                            if (action == 'delete') {
                               
                                try { easyStorage.removeKey(key); } catch (e) { if(log){ console.log('[storage] easyStorage removeKey error', e); } }
                            }
                        }
                    }
                    if (idx < entries.length) {
                        setTimeout(processEasyStorageChunk, 0);
                    } else {
                        try { if(log){ console.log('[storage] all chunks complete');} } catch (e) {}
                        try {
                            if (typeof easyStorage.getAllKeys === 'function') {
                                const keys = easyStorage.getAllKeys() || [];
                                const agg = {};
                                for (const k of keys) {
                                    try {
                                        if (!k || typeof k !== 'string') continue;
                                        if (!k.startsWith('mood_')) continue;
                                        const v = typeof easyStorage.getKey === 'function' ? easyStorage.getKey(k) : null;
                                        if (v == null) continue;
                                        const datePart = k.substr(5);
                                        const parts = datePart.split('-');
                                        if (parts.length !== 3) continue;
                                        const [y, m, d] = parts;
                                        if (!agg[y]) agg[y] = {};
                                        const mi = parseInt(m, 10);
                                        const di = parseInt(d, 10);
                                        if (!agg[y][mi]) agg[y][mi] = {};
                                        agg[y][mi][di] = v;
                                    } catch (e) { }
                                }
                                try { if (typeof easyStorage.setKey === 'function') easyStorage.setKey('mood_history', JSON.stringify(agg)); } catch (e) {}
                            }
                        } catch (e) { }
                        if (onDone) setTimeout(onDone, 0);
                    }
                }
                if (entries.length === 0) { if (onDone) onDone(); return true; }
                setTimeout(processEasyStorageChunk, 0);
                return true;
            } catch (e) {
                if(log){ console.log('[storage] easyStorage delegation error', e) };
            }
        }
        return true;
    }

    // Build flat items from nested Y->{M->{D:val}}
    export function buildItemsFromNested(nested) {
        const out = {};
        if (!nested || typeof nested !== 'object') return out;
        for (const y in nested) {
            for (const m in nested[y]) {
                for (const d in nested[y][m]) {
                    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    out['mood_' + key] = nested[y][m][d];
                }
            }
        }
        return out;
    }

// --- Helpers --- 

    export function parseMoodKeyToTs(key) {
        if (typeof key !== 'string') return null;
        if (!key || !key.startsWith('mood_')) return null;
        const parts = key.slice(5).split('-');
        if (parts.length !== 3) return null;
        const [y, m, d] = parts;
        const dt = new Date(Number(y), Number(m) - 1, Number(d));
        return dt.setHours(0, 0, 0, 0);
    }

    export function toNested(obj) {
        const wasString = typeof obj === 'string';
        if (wasString) {
            try { obj = JSON.parse(obj); } catch (e) { return '{}'; }
        }
        if (!obj || typeof obj !== 'object') return (wasString ? '{}' : {});
        const nested = {};
        for (const key in obj) {
            let useKey = key;
            if (typeof useKey === 'string' && useKey.startsWith('mood_')) useKey = useKey.slice(5);
            if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(useKey)) {
                const [y, mRaw, dRaw] = useKey.split('-');
                const m = mRaw.padStart(2, '0');
                const d = dRaw.padStart(2, '0');
                if (!nested[y]) nested[y] = {};
                if (!nested[y][m]) nested[y][m] = {};
                nested[y][m][d] = obj[key];
            } else if (/^\d{4}$/.test(useKey) && typeof obj[key] === 'object') {
                nested[useKey] = toNested(obj[key]);
            }
        }
        return wasString ? JSON.stringify(nested) : nested;
    }
    
    export function toFlattened(nested) {
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