import './shared/device-polyfill'
import { MessageBuilder } from './shared/message'
import { getPackageInfo } from '@zos/app'
import * as ble from '@zos/ble'

import { compress, decompress, deepMergeNoZero } from './utils/compression.js';
import * as globals from './globals.js';
import * as storage from './functions/storage.js';
import * as ui from './functions/ui.js';
import {toNested} from './functions/data.js';
import * as state from './functions/state.js';

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
    
    this.globalData.messageBuilder = messageBuilder;
    let mb = messageBuilder;
    //if (!mb || typeof mb.isConnected !== 'function' || !mb.isConnected()) { return;}

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
      // Log every incoming payload and method
      // console.log('[App] Incoming request:', payload && payload.method, payload);
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
        return;
      }
      try {
        console.log('[App] ← Request:', payload.method)

        if (payload.method === 'GENERATE_SAMPLE_DATA') {
          setTimeout(() => {
            ui.navigateToPage('page/sync_page', { targetPage: 'page/mood_page', targetAction: 'save', payload: payload, forceSync: true, text: "Syncing. . ." });
          }, 0);
          try { ctx.response({ data: { success: true } }); } catch (e) {}
          return;
        }

        if (payload.method === 'CLEAR_MOOD_DATA_RANGE') {
          setTimeout(() => {
            ui.navigateToPage('page/sync_page', { targetPage: 'page/mood_page', targetAction: 'delete', payload: payload, forceSync: true, text: "Syncing. . ." });
          }, 0);
          try { ctx.response({ data: { success: true } }); } catch (e) {}
          return;
        }

        if (payload.method === 'CLEAR_MOOD_DATA_ALL') {
          setTimeout(() => {
            ui.navigateToPage('page/sync_page', { targetPage: 'page/mood_page', targetAction: 'clear', forceSync: true, text: "Syncing. . ." });
          }, 0);
          try { ctx.response({ data: { success: true } }) } catch (e) {}
          return
        }

        if (payload.method === 'SYNC_MOOD_DATA' || payload.method === 'SYNC_MOOD_DATA_SINGLE') {
          // Offload processing to avoid blocking the request handler for large payloads
          try { ctx.response({ data: { success: true } }); } catch (e) {}
          setTimeout(() => {
            try {
              let incoming = payload.params;
              if (globals.ENABLE_COMPRESSION_INCOMING) {
                if (payload.method === 'SYNC_MOOD_DATA' && typeof incoming === 'string') {
                  try {
                    incoming = decompress(incoming);
                    incoming = JSON.parse(incoming);
                  } catch {}
                }
              } else {
                if (typeof incoming === 'string') {
                  try { incoming = JSON.parse(incoming); } catch {}
                }
              }
              let minTs = null, maxTs = null;
              for (const key in incoming) {
                const moodKey = `mood_${key}`;
                try { storage.setItem(moodKey, String(incoming[key])); } catch (e) {}
                const [y, m, d] = key.split('-');
                const dt = new Date(Number(y), Number(m)-1, Number(d));
                const ts = dt.setHours(0,0,0,0);
                if (minTs === null || ts < minTs) minTs = ts;
                if (maxTs === null || ts > maxTs) maxTs = ts;
              }
              if (minTs !== null && maxTs !== null) {
                try { console.log('[App] Derived range (ignored persistence):', new Date(minTs).toISOString(), new Date(maxTs).toISOString()); } catch (e) {}
              }
            } catch (e) { try { console.log('[App] SYNC_MOOD_DATA background error:', e); } catch (ee) {} }
            const clearedAt = Date.now();
            try { storage.setItem('mood_history_cleared_at', String(clearedAt)); } catch (e) {}
            this.globalData.moodDataClearedAt = clearedAt;
            const cb = this.globalData.onMoodDataCleared;
            if (cb && typeof cb === 'function') {
              try { cb(clearedAt); } catch (e) {}
            }
          }, 0);
          return;
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
    if(!globals.IMMEDIATE_SAVE){
      storage.commitMoodData();
    }
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