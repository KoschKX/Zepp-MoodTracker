import * as globals from '../globals';
import { compress } from './compression';

const getMessageBuilder = () => {
  try {
    const app = getApp();
    return app?._options?.globalData?.messageBuilder || app?.globalData?.messageBuilder || null;
  } catch (e) {
    return null;
  }
};

export const sendMoodDataToPhone = (data, single = true, log = '') => {
  console.log('[Sync test]', JSON.stringify({ data }));
  try {
    
    const messageBuilder = getMessageBuilder();
    if (!messageBuilder?.request) {
      log && console.log('MessageBuilder not found!', true);
      return null;
    }

    let method = 'SYNC_MOOD_DATA';
	  if(single) { method = 'SYNC_MOOD_DATA_SINGLE'; }	

    // if (globals.ENABLE_COMPRESSION_OUTGOING && single) { data = compress(data); }

    const result = messageBuilder.request({ method: method, params: data });
    
    if (result?.then) {
      result
        .then((response) => {
          if (response?.success) {
            log && log('SYNCED at ' + response.time);
          } else {
            log && log('Sync failed!', true);
            response?.error && log && console.log('Error: ' + response.error, true);
          }
        })
        .catch((error) => log && console.log('Promise error: ' + String(error), true));
    }
    
    return result;
  } catch (e) {
    log && log('Caught error: ' + String(e), true);
    return null;
  }
};

export const requestMoodDataFromPhone = (log) => {
  try {
    const messageBuilder = getMessageBuilder();
    if (!messageBuilder?.request) {
      log && console.log('MessageBuilder not ready');
      return null;
    }

    return messageBuilder.request({ method: 'REQUEST_PHONE_DATA' });
  } catch (e) {
    log && console.log('Error: ' + String(e));
    return null;
  }
};

export const pingPhone = (log) => {
  try {
    const messageBuilder = getMessageBuilder();
    if (!messageBuilder?.request) {
      log && console.log('MessageBuilder not ready');
      return null;
    }

    return messageBuilder.request({ method: 'PING' });
  } catch (e) {
    log && console.log('Error: ' + String(e));
    return null;
  }
};
