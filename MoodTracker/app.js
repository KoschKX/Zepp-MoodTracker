import './shared/device-polyfill'
import { MessageBuilder } from './shared/message'
import { getPackageInfo } from '@zos/app'
import * as ble from '@zos/ble'
import { LocalStorage } from '@zos/storage'

App({
  globalData: {
    messageBuilder: null
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