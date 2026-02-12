import { MessageBuilder } from '../shared/message-side'

const messageBuilder = new MessageBuilder()

// Lightweight console capture - filter out verbose messages
const logBuffer = [];
const MAX_LOGS = 100;
const MAX_MSG_LENGTH = 300;

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;


// Enhanced merge: merge both flat and nested keys into a single nested structure
// Flatten nested and flat mood data to flat YYYY-MM-DD keys
function flattenMoodHistory(obj) {
  let flat = {};
  for (const key in obj) {
    if (/^\d{4}$/.test(key) && typeof obj[key] === 'object' && obj[key] !== null) {
      for (const m in obj[key]) {
        for (const d in obj[key][m]) {
          const ymd = `${key}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          flat[ymd] = obj[key][m][d];
        }
      }
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      flat[key] = obj[key];
    }
  }
  return flat;
}

// Convert flat YYYY-MM-DD keys to nested
function toNested(obj) {
  let nested = {};
  for (const key in obj) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      const [y, m, d] = key.split('-');
      if (!nested[y]) nested[y] = {};
      if (!nested[y][String(Number(m))]) nested[y][String(Number(m))] = {};
      nested[y][String(Number(m))][String(Number(d))] = obj[key];
    }
  }
  return nested;
}

const captureLog = function(prefix, ...args) {
  try {
    // Check if any argument contains filtered strings
    const hasFiltered = args.some(a => {
      const str = typeof a === 'object' ? JSON.stringify(a) : String(a);
      return str.includes('Sync log') || str.includes('sync_log') || str.includes('SYNC_LOG') || str.includes('[w-proc-p');
    });
    
    if (hasFiltered) {
      return; // Skip this message entirely
    }
    
    let msg = prefix + args.map(a => {
      if (typeof a === 'object') {
        if (JSON.stringify(a).length > 200) {
          return '[Large Object]';
        }
        return JSON.stringify(a);
      }
      return String(a);
    }).join(' ');
    
    if (msg.length > MAX_MSG_LENGTH) {
      msg = msg.substring(0, MAX_MSG_LENGTH) + '...';
    }
    
    logBuffer.push(msg);
    if (logBuffer.length > MAX_LOGS) logBuffer.shift();
    
    try {
      const logsJson = JSON.stringify(logBuffer);
      settings.settingsStorage.setItem('consoleLogs', logsJson);
    } catch (e) {
      // Storage write failed
    }
  } catch (e) {
    // Ignore logging errors
  }
};

console.log = function(...args) {
  originalLog.apply(console, args);
  captureLog('', ...args);
};

console.error = function(...args) {
  originalError.apply(console, args);
  captureLog('❌ ', ...args);
};

console.warn = function(...args) {
  originalWarn.apply(console, args);
  captureLog('⚠️ ', ...args);
};

AppSideService({
  onInit() {
    console.log('[APP-SIDE] Service initialized');
  },
  
  onRun() {
    console.log('[APP-SIDE] Service running');
    
    messageBuilder.listen(() => {
      console.log('[APP-SIDE] Connected to watch');
    });
    
    // Listen for reminder settings changes
    try {
      settings.settingsStorage.addListener('change', ({ key, newValue }) => {
        console.log('[APP-SIDE] Storage change:', key);


        if (key === 'generateSampleData') {
          try {
            if (!newValue) return;
            const payload = JSON.parse(newValue);
            if (payload && payload.data) {
              console.log('[APP-SIDE] Original payload:', payload);
              payload.data = toNested(payload.data);
            }
            console.log('[APP-SIDE] 🚀 GENERATE_SAMPLE_DATA requested (nested):', payload);
            messageBuilder.request({
              method: 'GENERATE_SAMPLE_DATA',
              params: payload
            }, { timeout: 5000 })
            .then(() => console.log('[APP-SIDE] ✅ GENERATE_SAMPLE_DATA sent to watch'))
            .catch((e) => console.log('[APP-SIDE] ❌ GENERATE_SAMPLE_DATA failed:', e));
          } catch (e) {
            console.log('[APP-SIDE] ❌ GENERATE_SAMPLE_DATA parse failed:', e);
          }
        }

        if (key === 'clearMoodAll') {
          console.log('[APP-SIDE] 🧹 Clear all mood data requested');
          settings.settingsStorage.setItem('moodData', '{}');
          messageBuilder.request({
            method: 'CLEAR_MOOD_DATA_ALL',
            params: { timestamp: Date.now() }
          }, { timeout: 5000 })
          .then(() => console.log('[APP-SIDE] ✅ Clear all sent to watch'))
          .catch((e) => console.log('[APP-SIDE] ❌ Clear all failed:', e));
        }

        if (key === 'clearMoodRange') {
          try {
            const payload = settings.settingsStorage.getItem('clearMoodRange');
            if (!payload) return;
            const parsed = JSON.parse(payload);
            console.log('[APP-SIDE] 🧹 Clear mood range requested');
            const updatedData = settings.settingsStorage.getItem('moodData') || '{}';
            messageBuilder.request({
              method: 'CLEAR_MOOD_DATA_RANGE',
              params: parsed
            }, { timeout: 5000 })
            .then(() => console.log('[APP-SIDE] ✅ Clear range sent to watch'))
            .catch((e) => console.log('[APP-SIDE] ❌ Clear range failed:', e));
          } catch (e) {
            console.log('[APP-SIDE] ❌ Clear range parse failed:', e);
          }
        }
      });
      console.log('[APP-SIDE] Listening for settings changes');
    } catch (e) {
      console.log('[APP-SIDE] ❌ Settings listener failed:', e);
    }
    
    messageBuilder.on('request', (ctx) => {
      try {
        const payload = messageBuilder.buf2Json(ctx.request.payload);
        const receivedTime = new Date().toISOString();
        console.log('[APP-SIDE] ← Request:', payload.method);
        if (payload.method === 'SYNC_MOOD_DATA_SINGLE') {
          let oldData = settings.settingsStorage.getItem('moodData') || '{}';
          let incomingStr = payload.params || '{}';
          let merged = '{}';
          try {
            let oldObj = JSON.parse(oldData);
            let newObj = typeof incomingStr === 'string' ? JSON.parse(incomingStr) : incomingStr;
            // Always flatten both old and new data, then merge
            let flatOld = flattenMoodHistory(oldObj);
            let flatNew = flattenMoodHistory(newObj);
            let mergedFlat = { ...flatOld, ...flatNew };
            // Remove all 0 values from mergedFlat
            for (const key in mergedFlat) {
              if (mergedFlat[key] === 0) {
                delete mergedFlat[key];
              }
            }
            let mergedObj = toNested(mergedFlat);
            merged = JSON.stringify(mergedObj);
          } catch (e) {
            merged = incomingStr;
          }
          settings.settingsStorage.setItem('moodData', merged);
          settings.settingsStorage.setItem('moodDataBackup', oldData);
          settings.settingsStorage.setItem('moodDataSingle', incomingStr);
          settings.settingsStorage.setItem('lastSync', receivedTime);
          ctx.response({
            data: { success: true, time: receivedTime }
          });
        } else if (payload.method === 'SYNC_MOOD_DATA') {
          let oldData = settings.settingsStorage.getItem('moodData') || '{}';
          let incomingStr = payload.params || '{}';
          let merged = '{}';
          try {
            let oldObj = JSON.parse(oldData);
            let newObj = typeof incomingStr === 'string' ? JSON.parse(incomingStr) : incomingStr;
            // Always flatten both old and new data, then merge
            let flatOld = flattenMoodHistory(oldObj);
            let flatNew = flattenMoodHistory(newObj);
            let mergedFlat = { ...flatOld, ...flatNew };
            let mergedObj = toNested(mergedFlat);
            merged = JSON.stringify(mergedObj);
          } catch (e) {
            merged = incomingStr;
          }
          settings.settingsStorage.setItem('moodData', merged);
          ctx.response({
            data: { success: true, time: receivedTime }
          });
        } else if (payload.method === 'SYNC_LOG') {
          settings.settingsStorage.setItem('sync_log', payload.params);
          // Don't log sync_log - contains too much data
        } else if (payload.method === 'REQUEST_PHONE_DATA') {
          const phoneData = settings.settingsStorage.getItem('moodData');
          if (phoneData && phoneData !== '{}') {
            console.log('[APP-SIDE] ✅ Sending mood data to watch');
            ctx.response({
              data: { success: true, moodData: phoneData }
            });
          } else {
            console.log('[APP-SIDE] ⚠️ No mood data available');
            ctx.response({
              data: { success: false, error: 'No phone data available' }
            });
          }
        } else if (payload.method === 'PING') {
          ctx.response({ data: { success: true } });
        } else if (payload.method === 'REQUEST_CONSOLE_LOGS') {
          console.log('[APP-SIDE] Sending console logs');
          ctx.response({
            data: { success: true, logs: logBuffer }
          });
        } else {
          console.log('[APP-SIDE] ⚠️ Unknown method:', payload.method);
          ctx.response({ data: { success: false, error: 'Unknown method' } });
        }
      } catch (e) {
        console.log('[APP-SIDE] ❌ Error:', e.message);
        try {
          ctx.response({ data: { success: false, error: e.message } });
        } catch (respErr) {
          console.log('[APP-SIDE] ❌ Response failed:', respErr);
        }
      }
    });
    
    console.log('[APP-SIDE] Ready for messages');
  },
  
  onDestroy() {
    // Service destroyed
  }
})
