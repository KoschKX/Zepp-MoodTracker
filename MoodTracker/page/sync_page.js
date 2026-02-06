import { createWidget, widget, align, prop } from '@zos/ui';
import { px } from '@zos/utils';
import { push } from '@zos/router';
import { localStorage } from '@zos/storage';
import { requestMoodDataFromPhone, pingPhone } from '../utils/sync';

Page({
  syncLog: [],
  
  logAndSend(message) {
    // Logging disabled to keep the console quiet
    // const timestamp = new Date().toISOString();
    // const logEntry = `[${timestamp}] ${message}`;
    // this.syncLog.push(logEntry);
    
    // // Send log to phone
    // try {
    //   const app = getApp();
    //   const messageBuilder = app?._options?.globalData?.messageBuilder;
    //   
    //   if (messageBuilder && messageBuilder.request) {
    //     messageBuilder.request({ 
    //       method: 'SYNC_LOG', 
    //       params: this.syncLog.join('\n') 
    //     });
    //   }
    // } catch (e) {
    //   // Can't send log yet
    // }
  },
  
  onInit() {
    this.syncLog = [];
  },
  
  build() {
    this.logAndSend('Sync page loaded');
    
    // Check watch data first (before showing UI)
    try {
      const storedData = localStorage.getItem('mood_history');
      const moodHistory = storedData ? JSON.parse(storedData) : {};
      const dataCount = Object.keys(moodHistory).length;
      
      this.logAndSend(`Watch has ${dataCount} entries`);
      
      if (dataCount === 0) {
        // Watch is empty: show sync UI and ask the phone
        this.logAndSend('Watch empty, requesting from phone...');
        
        // Only show loading UI if we need to sync
        const statusText = createWidget(widget.TEXT, {
          x: 0,
          y: px(180),
          w: px(416),
          h: px(60),
          color: 0xffffff,
          text_size: px(24),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text: 'Syncing from phone...'
        });
          
          setTimeout(() => {
            try {
              const result = requestMoodDataFromPhone((msg) => this.logAndSend(msg));

              if (result) {
                this.logAndSend('MessageBuilder ready, sending request');
                
                if (result?.then) {
                  result.then(response => {
                    const responseStr = JSON.stringify(response || {});
                    this.logAndSend(`Got response: ${responseStr.substring(0, 100)}`);
                    
                    if (response?.success && response?.moodData) {
                      this.logAndSend(`Phone has data! Length: ${response.moodData.length}`);
                      
                      try {
                        const copiedData = JSON.parse(response.moodData);
                        this.logAndSend(`✅ Successfully copied ${Object.keys(copiedData).length} entries`);
                        
                        // Give the UI a beat, then save + navigate
                        setTimeout(() => {
                          try {
                            // Save phone data to watch (must happen before nav)
                            localStorage.setItem('mood_history', response.moodData);
                            
                            // Navigate after save completes
                            push({ url: 'page/mood_select' });
                          } catch (e) {
                            // Storage write failed
                            statusText.setProperty(prop.MORE, { 
                              text: 'Storage error',
                              color: 0xff0000
                            });
                            
                            setTimeout(() => {
                              push({ url: 'page/mood_select' });
                            }, 1500);
                          }
                        }, 100);
                        
                      } catch (parseError) {
                        this.logAndSend(`❌ Parse error: ${parseError}`);
                        statusText.setProperty(prop.MORE, { 
                          text: 'Sync failed',
                          color: 0xff0000
                        });
                        
                        // Navigate anyway after a short delay
                        setTimeout(() => {
                          push({ url: 'page/mood_select' });
                        }, 1500);
                      }
                    } else {
                      this.logAndSend('Phone has no data');
                      statusText.setProperty(prop.MORE, { 
                        text: 'No phone data',
                        color: 0xff9900
                      });
                      
                      // Navigate after showing the error
                      setTimeout(() => {
                        push({ url: 'page/mood_select' });
                      }, 1500);
                    }
                  }).catch(error => {
                    this.logAndSend(`❌ Request failed: ${error}`);
                    statusText.setProperty(prop.MORE, { 
                      text: 'Sync error',
                      color: 0xff0000
                    });
                    
                    // Navigate anyway
                    setTimeout(() => {
                      push({ url: 'page/mood_select' });
                    }, 1500);
                  });
                } else {
                  this.logAndSend('❌ No promise returned');
                  statusText.setProperty(prop.MORE, { text: 'No response' });
                  
                  setTimeout(() => {
                    push({ url: 'page/mood_select' });
                  }, 1500);
                }
              } else {
                this.logAndSend('❌ MessageBuilder not ready');
                statusText.setProperty(prop.MORE, { text: 'Connection not ready' });
                
                setTimeout(() => {
                  push({ url: 'page/mood_select' });
                }, 1500);
              }
            } catch (e) {
              this.logAndSend(`❌ Error: ${e}`);
              statusText.setProperty(prop.MORE, { 
                text: 'Error occurred',
                color: 0xff0000
              });
              
              setTimeout(() => {
                push({ url: 'page/mood_select' });
              }, 1500);
            }
          }, 1000);
          
        } else {
          // Watch already has data: skip straight through
          this.logAndSend(`Watch has data, skipping sync`);
          
          // Navigate immediately
          push({ url: 'page/mood_select' });
        }
        
      } catch (e) {
        this.logAndSend(`❌ Load error: ${e}`);
        
        // Navigate anyway (no error UI)
        push({ url: 'page/mood_select' });
      }
  }
});
