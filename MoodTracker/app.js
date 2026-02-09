import './shared/device-polyfill'
import { MessageBuilder } from './shared/message'
import { getPackageInfo } from '@zos/app'
import * as ble from '@zos/ble'
import { localStorage } from '@zos/storage'

App({
  globalData: {
    messageBuilder: null,
    moodDataClearedAt: 0,
    onMoodDataCleared: null
  },
  onCreate(options) {
    console.log('[App] MoodTracker Starting...')
    
    // Spin up MessageBuilder right away so sendDataToPhone can use it
    const { appId } = getPackageInfo()
    console.log('[App] App ID: ' + appId)
    
    const messageBuilder = new MessageBuilder({
      appId,
      appDevicePort: 20,
      appSidePort: 0,
      ble
    })
    
    this.globalData.messageBuilder = messageBuilder
    
    // Connect now so messages are ready to go
    messageBuilder.connect((builder) => {
      console.log('[App] MessageBuilder connected!')
    })

    messageBuilder.on('request', (ctx) => {
      let payload;
      try {
        payload = messageBuilder.buf2Json(ctx.request.payload);
      } catch (e) {
        ctx.response({ data: { success: false, error: 'Invalid payload' } });
        return;
      }
      // Handle request to open sync page from phone
      if (payload.method === 'OPEN_SYNC_PAGE') {
        try {
          const { push } = require('@zos/router');
          push({ url: 'page/sync_page' });
          ctx.response({ data: { success: true } });
        } catch (e) {
          ctx.response({ data: { success: false, error: e.message } });
        }
        return;
      }
      // --- CHUNKED MOOD DATA SYNC ---
      if (payload.method === 'SYNC_MOOD_DATA_CHUNK') {
        try {
          // payload.params should be an object: { "2026-02-01": 3, "2026-02-02": 2, ... }
          const chunk = payload.params || {};
          let count = 0;
          for (const [dateKey, mood] of Object.entries(chunk)) {
            // Store each day as a separate key for fast access
            const key = `mood_${dateKey}`;
            if (mood == null) {
              try { localStorage.removeItem(key); } catch (e) {}
            } else {
              try { localStorage.setItem(key, String(mood)); } catch (e) {}
            }
            count++;
          }
          // After chunked sync, reload all per-day keys into memory for UI
          try {
            require('./page/functions/loadAllPerDayMoodKeys').loadAllPerDayMoodKeys();
          } catch (e) { console.error('Failed to reload mood data after chunked sync:', e); }
          ctx.response({ data: { success: true, processed: count } });
        } catch (e) {
          ctx.response({ data: { success: false, error: e.message } });
        }
        return;
      }
      try {
        console.log('[App] ← Request:', payload.method)

        if (payload.method === 'GENERATE_SAMPLE_DATA') {
          // Generate and save sample data for the given range, merging with existing data
          try {
            let { data, startDate, endDate } = payload.params || {};
            if (!startDate || !endDate) {
              ctx.response({ data: { success: false, error: 'Missing startDate/endDate' } });
            } else {
              let sample = {};
              if (data) {
                sample = typeof data === 'string' ? JSON.parse(data) : data;
              } else {
                // If no data provided, generate random data for the range
                let date = new Date(startDate);
                const end = new Date(endDate);
                while (date <= end) {
                  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                  sample[key] = Math.random() < 0.7 ? Math.floor(Math.random() * 5) + 1 : 0;
                  date.setDate(date.getDate() + 1);
                }
              }
              // Merge with existing mood_history
              let existing = {};
              try {
                const stored = localStorage.getItem('mood_history');
                if (stored && stored !== '{}' && stored !== 'null') {
                  existing = JSON.parse(stored);
                }
              } catch (e) {}
              // Overwrite only the window keys
              for (const key in sample) {
                existing[key] = sample[key];
              }
              localStorage.setItem('mood_history', JSON.stringify(existing));
              // If on week_page or mood_select, refresh UI as after clear
              const cb = this.globalData.onMoodDataCleared;
              if (cb && typeof cb === 'function') {
                try { cb(Date.now()); } catch (e) {}
              }
              ctx.response({ data: { success: true } });
            }
          } catch (e) {
            ctx.response({ data: { success: false, error: e.message } });
          }
          return;
        }

        if (payload.method === 'SYNC_MOOD_DATA' || payload.method === 'SYNC_MOOD_DATA_SINGLE') {
          try {
            const dataStr = typeof payload.params === 'string' ? payload.params : JSON.stringify(payload.params || {})
            localStorage.setItem('mood_history', dataStr || '{}')
          } catch (e) {
            localStorage.setItem('mood_history', '{}')
          }
          let data = {}
          try {
            const stored = localStorage.getItem('mood_history')
            data = stored ? JSON.parse(stored) : {}
          } catch (e) {
            data = {}
          }
          // ...existing code...
          const clearedAt = Date.now()
          localStorage.setItem('mood_history_cleared_at', String(clearedAt))
          this.globalData.moodDataClearedAt = clearedAt
          const cb = this.globalData.onMoodDataCleared
          if (cb && typeof cb === 'function') {
            try { cb(clearedAt) } catch (e) {}
          }
          ctx.response({ data: { success: true } })
          return
        }

        if (payload.method === 'CLEAR_MOOD_DATA_ALL') {
          const clearedAt = Date.now()
          try { localStorage.removeItem('mood_history') } catch (e) {}
          localStorage.setItem('mood_history', '{}')
          localStorage.setItem('mood_history_cleared_at', String(clearedAt))
          this.globalData.moodDataClearedAt = clearedAt
          const cb = this.globalData.onMoodDataCleared
          if (cb && typeof cb === 'function') {
            try { cb(clearedAt) } catch (e) {}
          }
          ctx.response({ data: { success: true } })
          return
        }

        if (payload.method === 'CLEAR_MOOD_DATA_RANGE') {
          const { referenceDate, days } = payload.params || {}
          // ...existing code...
          if (!referenceDate || !days) {
            ctx.response({ data: { success: false, error: 'Invalid params' } })
            return
          }
          let data = {}
          try {
            const stored = localStorage.getItem('mood_history')
            data = stored ? JSON.parse(stored) : {}
          } catch (e) {
            data = {}
          }
          // ...existing code...
          const refDate = new Date(referenceDate)
          for (let i = Number(days) - 1; i >= 0; i--) {
            const d = new Date(refDate)
            d.setDate(d.getDate() - i)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            if (data[key]) delete data[key]
          }
          // ...existing code...
          const clearedAt = Date.now()
          localStorage.setItem('mood_history', JSON.stringify(data))
          localStorage.setItem('mood_history_cleared_at', String(clearedAt))
          this.globalData.moodDataClearedAt = clearedAt
          const cb = this.globalData.onMoodDataCleared
          if (cb && typeof cb === 'function') {
            try { cb(clearedAt) } catch (e) {}
          }
          // ...existing code...
          ctx.response({ data: { success: true } })
          return
        }

        ctx.response({ data: { success: false, error: 'Unknown method' } })
      } catch (e) {
        try {
          ctx.response({ data: { success: false, error: e.message } })
        } catch (respErr) {}
      }
    })
  },
  onDestroy(options) {
    console.log('[App] App Destroy')
    if (this.globalData.messageBuilder) {
      try {
        this.globalData.messageBuilder.disConnect()
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }
})