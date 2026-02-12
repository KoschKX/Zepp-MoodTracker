import { createWidget, widget, align, prop } from '@zos/ui';
import { px } from '@zos/utils';
import { push } from '@zos/router';
import { requestMoodDataFromPhone, pingPhone } from '../utils/sync';
import * as data from '../functions/data';
import * as state from '../functions/state';
import * as storage from '../functions/storage';
import * as easyStorage from '../utils/easystorage.js';

let targetPage = 'page/mood_select';
let forceSync = false;
let targetAction = '';
let syncText = 'Syncing. . .';
let syncTextProvided = false;

Page({
  syncLog: [],

  logAndSend(message) {
      try {
        if (!this.syncLog) this.syncLog = [];
        this.syncLog.push(message);
      } catch (e) {}
  },

  onInit(params) {

    this.syncLog = [];
    let target = 'page/mood_select';
    let force = false;
    let action = '';
    let text = syncText;
    syncTextProvided = false;
    // allow an explicit payload and action to be passed in params
    this.pendingPayload = null;
    this.pendingAction = null; // 'save' or 'delete'
    if (params && typeof params === 'object') {
      if (params.targetPage) { target = params.targetPage; }
      // accept either `targetAction` or `action` as the requested operation
      if (params.targetAction) { action = params.targetAction; }
      if (params.action) { action = params.action; }
      if (params.forceSync) { force = params.forceSync; }

      // accept a payload under several common names
      if (params.payload) this.pendingPayload = params.payload;
      else if (params.moodData) this.pendingPayload = params.moodData;
      else if (params.data) this.pendingPayload = params.data;
      if (params.action) this.pendingAction = params.action;
      if (typeof params.text === 'string') {
        text = params.text;
        syncTextProvided = true;
      }
    } else if (params && typeof params === 'string') {
      try {
        const parsed = JSON.parse(params);
        if (parsed && parsed.targetPage) { target = parsed.targetPage; }
        if (parsed && parsed.forceSync) { force = parsed.forceSync; }
        if (parsed && parsed.targetAction) { action = parsed.targetAction; }
        if (parsed && parsed.action) { action = parsed.action; }

        if (parsed && parsed.payload) this.pendingPayload = parsed.payload;
        else if (parsed && parsed.moodData) this.pendingPayload = parsed.moodData;
        else if (parsed && parsed.data) this.pendingPayload = parsed.data;
        if (parsed && parsed.action) this.pendingAction = parsed.action;
        if (parsed && typeof parsed.text === 'string') {
          text = parsed.text;
          syncTextProvided = true;
        }
      } catch (e) {
        
      }
    }
    if(target){ targetPage = target; }
    if(action){ targetAction = action; }
    forceSync = force;
    syncText = text;
  },

  build() {

    this.logAndSend('Sync page loaded');

    console.log('[sync_page] Params - targetPage:', targetPage, 'forceSync:', forceSync, 'targetAction:', targetAction, 'syncText:', syncText);

    try {
      //data.removeAllZeroMoods();
    } catch (e) {
      this.logAndSend(`Error cleaning data: ${e}`);
    }

    try {
      const mb = (this && this.globalData && this.globalData.messageBuilder) ? this.globalData.messageBuilder : null;
      if (!mb || typeof mb.isConnected !== 'function' || !mb.isConnected()) {
        this.logAndSend('❌ MessageBuilder not connected');
      }

      const storedData = storage.loadMoodData();
      console.log('[sync_page] storage.mood_history:', storedData);
      const moodHistory = storedData ? JSON.parse(storedData) : {};
      const dataCount = Object.keys(moodHistory).length;

      this.logAndSend(`Watch has ${dataCount} entries`);

      if (dataCount === 0 || forceSync) {

        // console.log('[sync_page] Mood Range in storage:', moodKeys);
        if (!syncTextProvided && storageData.length && !forceSync) {
          console.log('[sync_page] Existing mood keys in storage:', JSON.stringify(moodKeys));
          this.logAndSend('Local mood data already exists, skipping phone request.');
          setTimeout(() => {
            push({ url: targetPage });
          }, 1000);
          return;
        }

        // Only show loading UI if we need to sync
        const displayText = syncText || '';
       
        this.logAndSend(forceSync ? 'Force sync requested, bypassing local storage.' : 'Watch empty, requesting from phone...');
        const statusText = createWidget(widget.TEXT, {
          x: 0,
          y: px(180),
          w: px(416),
          h: px(60),
          color: 0xffffff,
          text_size: px(24),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text: displayText
        });
        setTimeout(() => {
          let finished = false;
          const timeoutMs = 10000; // 10 seconds
          try {

            if (forceSync && targetAction) {

              this.logAndSend('Processing provided payload in chunks...');
              
              try {

                
                let payloadObj = this.pendingPayload || {};
                if (typeof payloadObj === 'string') {
                  payloadObj = JSON.parse(payloadObj);
                }

                // Normalize shapes: payload may be flat YYYY-MM-DD -> convert to nested
                let nested = {};
                if (payloadObj && typeof payloadObj === 'object') {
                
                  let { data, startDate, endDate } = payloadObj.params || {};
                  let chunkSize = 500;
                  
                  // Determine the effective action (pendingAction -> targetAction
                  if (targetAction === 'save') {
                    easyStorage.processData('save', {data: data, chunkSize: chunkSize, log: true, 
                      onDone: function(){
                        //try { easyStorage.debugDumpStorage(); } catch (e) {}
                        setTimeout(() => { push({ url: targetPage }); }, 0);
                      }
                    });
                    return;
                  }

                  if (targetAction === 'delete') {
                    easyStorage.processData('delete', {data: data, chunkSize: 200, log: true, 
                      onDone: function(){
                        //try { easyStorage.debugDumpStorage(); } catch (e) {}
                        setTimeout(() => { push({ url: targetPage }); }, 0);
                      }
                    });
                    return;
                  }

                  if (targetAction === 'clear') {
                    
                    easyStorage.processData('clear', {log: true, 
                      onDone: function(){
                        //try { easyStorage.debugDumpStorage(); } catch (e) {}
                        setTimeout(() => { push({ url: targetPage }); }, 0);
                      }
                    });
                    return;
                  }
                }

                // Default: save/apply nested data in background chunks
                /*
                storage.applyNestedInBackground(nested, { chunkSize: 150, onDone: () => {
                  try {
                    try { storage.setItem('mood_history', JSON.stringify(nested)); } catch (e) {}
                    this.logAndSend('✅ Payload applied in background');
                  } catch (e) { this.logAndSend('❌ apply done error: ' + e); }
                  setTimeout(() => { push({ url: targetPage }); }, 100);
                }});
                */
                
                return;

              } catch (e) {
                this.logAndSend('❌ Failed to process provided payload: ' + e);
                console.log('Error processing payload:', e);
                setTimeout(() => { push({ url: targetPage }); }, 1000);
                return;
              }
            }
            
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
                      ui.navigateToPage(targetPage, { fromNav: true });
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
                          storage.setItem('mood_history', response.moodData);
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
