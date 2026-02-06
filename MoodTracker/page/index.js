import { createWidget, widget } from '@zos/ui'
import { push } from '@zos/router'
import { getApp } from '@zos/app'

// Pre-calc px values at module load
const PX = { x0: 0, y0: 0, w416: 416, h416: 416 };

Page({
  onInit(params) {
    // Check if launched from an alarm with params
    if (params) {
      try {
        console.log('[Index] Launched with params:', params)
        
        let launchParams
        // Handle both string and JSON params
        if (typeof params === 'string' && params.startsWith('{')) {
          launchParams = JSON.parse(params)
        } else if (typeof params === 'string') {
          // Simple string param (e.g. mood_reminder/test_notification)
          launchParams = { type: params }
        } else {
          launchParams = params
        }
        
        console.log('[Index] Parsed params:', JSON.stringify(launchParams))
        
        if (launchParams.type === 'mood_reminder' || launchParams.type === 'test_notification') {
          console.log('[Index] 🔔 Notification launch detected')
          // Store params in global so mood_select_page can read them
          const app = getApp()
          if (app && app.globalData) {
            app.globalData.launchParams = launchParams
          }
        }
      } catch (e) {
        console.log('[Index] Failed to parse params:', e)
      }
    }
  },
  
  build() {
    // Jump straight to mood_select_page
    push({ url: 'page/mood_select_page' })
  }
})

