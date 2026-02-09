import { MessageBuilder } from '../shared/message-side'

const messageBuilder = new MessageBuilder()

// Lightweight console capture - filter out verbose messages
const logBuffer = [];
const MAX_LOGS = 100;
const MAX_MSG_LENGTH = 300;

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

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

        // Forward GENERATE_SAMPLE_DATA to the watch
        if (key === 'generateSampleData') {
          try {
            if (!newValue) return;
            const payload = JSON.parse(newValue);
            console.log('[APP-SIDE] 🚀 GENERATE_SAMPLE_DATA requested:', payload);
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
        
        if (key === 'reminderEnabled' || key === 'reminderTime') {
          const enabled = settings.settingsStorage.getItem('reminderEnabled') || 'false';
          const time = settings.settingsStorage.getItem('reminderTime') || '09:00';
          
          messageBuilder.request({
            method: 'UPDATE_REMINDER_SETTINGS',
            params: {
              enabled: enabled === 'true',
              time: time
            }
          }, { timeout: 5000 })
          .then(() => console.log('[APP-SIDE] ✅ Reminder synced'))
          .catch((e) => console.log('[APP-SIDE] ❌ Reminder sync failed:', e));
        }
        
        if (key === 'testNotification') {
          console.log('[APP-SIDE] 🔔 TEST NOTIFICATION BUTTON CLICKED');
          
          const timestamp = new Date().toISOString();
          settings.settingsStorage.setItem('lastTestNotificationTrigger', timestamp);
          console.log('[APP-SIDE] Trigger time saved:', timestamp);
          
          console.log('[APP-SIDE] Sending notification request...');
          
          messageBuilder.request({
            method: 'LAUNCH_TEST_NOTIFICATION',
            params: {
              timestamp: timestamp,
              message: 'Test notification from settings'
            }
          }, { timeout: 5000 })
          .then((response) => {
            console.log('[APP-SIDE] ✅ Raw response:', JSON.stringify(response));
            
            // MessageBuilder capitalizes keys: Success, Message, etc.
            const success = response.Success !== undefined ? response.Success : response.success;
            const message = response.Message || response.message || '';
            const hour = response.Hour !== undefined ? response.Hour : response.hour;
            const minute = response.Minute !== undefined ? response.Minute : response.minute;
            const waitSeconds = response.WaitSeconds !== undefined ? response.WaitSeconds : response.waitSeconds;
            const alarmId = response.AlarmId !== undefined ? response.AlarmId : response.alarmId;
            
            console.log('[APP-SIDE] Parsed values:', { success, message, hour, minute, waitSeconds, alarmId });
            
            const alarmTime = hour !== undefined ? `${hour}:${String(minute).padStart(2, '0')}` : 'unknown';
            const waitTime = waitSeconds !== undefined ? waitSeconds : 'unknown';
            
            const resultMsg = success 
              ? `SUCCESS: Alarm at ${alarmTime} (wait ${waitTime}s) - ID: ${alarmId !== undefined ? alarmId : 'null'}` 
              : `ERROR: ${message}`;
            
            console.log('[APP-SIDE] Result:', resultMsg);
            settings.settingsStorage.setItem('lastTestNotificationResult', resultMsg);
          })
          .catch((e) => {
            console.log('[APP-SIDE] ❌ Test notification failed:', e);
            settings.settingsStorage.setItem('lastTestNotificationResult', 'ERROR: ' + e.message);
          });
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

          messageBuilder.request({
            method: 'SYNC_MOOD_DATA',
            params: '{}'
          }, { timeout: 5000 })
          .then(() => console.log('[APP-SIDE] ✅ Sent empty mood data to watch'))
          .catch((e) => console.log('[APP-SIDE] ❌ Empty mood sync failed:', e));
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

            messageBuilder.request({
              method: 'SYNC_MOOD_DATA',
              params: updatedData
            }, { timeout: 5000 })
            .then(() => console.log('[APP-SIDE] ✅ Sent updated mood data to watch'))
            .catch((e) => console.log('[APP-SIDE] ❌ Updated mood sync failed:', e));
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
            Object.keys(newObj).forEach(function(dateKey) {
              oldObj[dateKey] = typeof newObj[dateKey] === 'string' ? Number(newObj[dateKey]) : newObj[dateKey];
            });
            merged = JSON.stringify(oldObj);
          } catch (e) {
            merged = incomingStr;
          }
          settings.settingsStorage.setItem('moodData', merged);
          settings.settingsStorage.setItem('moodDataBackup', oldData);
          settings.settingsStorage.setItem('moodDataSingle', payload.params);
          settings.settingsStorage.setItem('lastSync', receivedTime);
          ctx.response({
            data: { success: true, time: receivedTime }
          });
        } else if (payload.method === 'SYNC_MOOD_DATA') {
          let incomingStr = payload.params || '{}';
          settings.settingsStorage.setItem('moodData', incomingStr);
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
