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
      try {
        const payload = messageBuilder.buf2Json(ctx.request.payload)
        console.log('[App] ← Request:', payload.method)

        if (payload.method === 'SYNC_MOOD_DATA') {
          try {
            const dataStr = typeof payload.params === 'string' ? payload.params : JSON.stringify(payload.params || {})
            localStorage.setItem('mood_history', dataStr || '{}')
          } catch (e) {
            localStorage.setItem('mood_history', '{}')
          }
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

          const refDate = new Date(referenceDate)
          for (let i = Number(days) - 1; i >= 0; i--) {
            const d = new Date(refDate)
            d.setDate(d.getDate() - i)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            if (data[key]) delete data[key]
          }

          const clearedAt = Date.now()
          localStorage.setItem('mood_history', JSON.stringify(data))
          localStorage.setItem('mood_history_cleared_at', String(clearedAt))
          this.globalData.moodDataClearedAt = clearedAt
          const cb = this.globalData.onMoodDataCleared
          if (cb && typeof cb === 'function') {
            try { cb(clearedAt) } catch (e) {}
          }
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