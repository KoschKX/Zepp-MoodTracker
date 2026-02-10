import { createWidget, widget, align, prop } from '@zos/ui';
import { px } from '@zos/utils';
import { push } from '@zos/router';
import { localStorage } from '@zos/storage';
import { requestMoodDataFromPhone, pingPhone } from '../utils/sync';
import * as funcs from './functions/funcs';
import * as data from './functions/data';

let targetPage = 'page/mood_select';
let forceSync = false;

Page({
  syncLog: [],

  logAndSend(message) {},

  onInit(params) {

    data.removeAllZeroMoods();

    this.syncLog = [];
    let target = 'page/mood_select';
    let force = false;
    if (params && typeof params === 'object' && params.targetPage) {
      target = params.targetPage;
      force = params.forceSync;
    } else if (params && typeof params === 'string') {
      try {
        const parsed = JSON.parse(params);
        if (parsed && parsed.targetPage) {
          target = parsed.targetPage;
        }
        if (parsed && parsed.forceSync) {
          force = parsed.forceSync;
        }
      } catch (e) {
        
      }
    }
    targetPage = target;
    forceSync = force;
  },

  build() {
    this.logAndSend('Sync page loaded');

    // Check watch data first (before showing UI)
    try {
      const storedData = localStorage.getItem('mood_history');
      const moodHistory = storedData ? JSON.parse(storedData) : {};
      const dataCount = Object.keys(moodHistory).length;

      this.logAndSend(`Watch has ${dataCount} entries`);

      if (dataCount === 0 || forceSync) {
        // Watch is empty or forceSync: show sync UI and ask the phone
        this.logAndSend(forceSync ? 'Force sync requested, bypassing local storage.' : 'Watch empty, requesting from phone...');
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
          let finished = false;
          const timeoutMs = 10000; // 10 seconds
          try {
            const result = requestMoodDataFromPhone((msg) => this.logAndSend(msg));
            if (result) {
              this.logAndSend('MessageBuilder ready, sending request');
              if (result?.then) {
                // Timeout handler
                const timeoutId = setTimeout(() => {
                  if (!finished) {
                    finished = true;
                    this.logAndSend('❌ Sync timed out');
                    statusText.setProperty(prop.MORE, {
                      text: 'Sync timed out',
                      color: 0xff0000
                    });
                    setTimeout(() => {
                      funcs.navigateToPage({ targetPage: targetPage, fromNav: true });
                    }, 1500);
                  }
                }, timeoutMs);
                result.then(response => {
                  if (finished) return;
                  finished = true;
                  clearTimeout(timeoutId);
                  const responseStr = JSON.stringify(response || {});
                  this.logAndSend(`Got response: ${responseStr.substring(0, 100)}`);
                  if (response?.success && response?.moodData) {
                    this.logAndSend(`Phone has data! Length: ${response.moodData.length}`);
                    try {
                      const copiedData = JSON.parse(response.moodData);
                      this.logAndSend(`✅ Successfully copied ${Object.keys(copiedData).length} entries`);
                      setTimeout(() => {
                        try {
                          localStorage.setItem('mood_history', response.moodData);
                          push({ url: targetPage });
                        } catch (e) {
                          statusText.setProperty(prop.MORE, {
                            text: 'Storage error',
                            color: 0xff0000
                          });
                          setTimeout(() => {
                            push({ url: targetPage });
                          }, 1500);
                        }
                      }, 100);
                    } catch (parseError) {
                      this.logAndSend(`❌ Parse error: ${parseError}`);
                      statusText.setProperty(prop.MORE, {
                        text: 'Sync failed',
                        color: 0xff0000
                      });
                      setTimeout(() => {
                        push({ url: targetPage });
                      }, 1500);
                    }
                  } else {
                    this.logAndSend('Phone has no data');
                    statusText.setProperty(prop.MORE, {
                      text: 'No phone data',
                      color: 0xff9900
                    });
                    setTimeout(() => {
                      push({ url: targetPage });
                    }, 1500);
                  }
                }).catch(error => {
                  if (finished) return;
                  finished = true;
                  clearTimeout(timeoutId);
                  this.logAndSend(`❌ Request failed: ${error}`);
                  statusText.setProperty(prop.MORE, {
                    text: 'Sync error',
                    color: 0xff0000
                  });
                  setTimeout(() => {
                    push({ url: targetPage });
                  }, 1500);
                });
              } else {
                this.logAndSend('❌ No promise returned');
                statusText.setProperty(prop.MORE, { text: 'No response' });
                setTimeout(() => {
                  push({ url: targetPage });
                }, 1500);
              }
            } else {
              this.logAndSend('❌ MessageBuilder not ready');
              statusText.setProperty(prop.MORE, { text: 'Connection not ready' });
              setTimeout(() => {
                push({ url: targetPage });
              }, 1500);
            }
          } catch (e) {
            finished = true;
            this.logAndSend(`❌ Error: ${e}`);
            statusText.setProperty(prop.MORE, {
              text: 'Error occurred',
              color: 0xff0000
            });
            setTimeout(() => {
              push({ url: targetPage });
            }, 1500);
          }
        }, 1000);
      } else {
        // Watch already has data: skip straight through
        this.logAndSend(`Watch has data, skipping sync`);
        // Navigate immediately
        push({ url: targetPage });
      }
    } catch (e) {
      this.logAndSend(`❌ Load error: ${e}`);
      // Navigate anyway (no error UI)
      push({ url: targetPage });
    }
  }
});
