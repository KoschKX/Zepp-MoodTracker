const getMessageBuilder = () => {
  try {
    const app = getApp();
    return app?._options?.globalData?.messageBuilder || app?.globalData?.messageBuilder || null;
  } catch (e) {
    return null;
  }
};

export const sendMoodDataToPhone = (data, log) => {
  try {
    const messageBuilder = getMessageBuilder();
    if (!messageBuilder?.request) {
      log && log('MessageBuilder not found!', true);
      return null;
    }

    const result = messageBuilder.request({ method: 'SYNC_MOOD_DATA', params: data });

    if (result?.then) {
      result
        .then((response) => {
          if (response?.success) {
            log && log('SYNCED at ' + response.time);
          } else {
            log && log('Sync failed!', true);
            response?.error && log && log('Error: ' + response.error, true);
          }
        })
        .catch((error) => log && log('Promise error: ' + String(error), true));
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
      log && log('MessageBuilder not ready');
      return null;
    }

    return messageBuilder.request({ method: 'REQUEST_PHONE_DATA' });
  } catch (e) {
    log && log('Error: ' + String(e));
    return null;
  }
};

export const pingPhone = (log) => {
  try {
    const messageBuilder = getMessageBuilder();
    if (!messageBuilder?.request) {
      log && log('MessageBuilder not ready');
      return null;
    }

    return messageBuilder.request({ method: 'PING' });
  } catch (e) {
    log && log('Error: ' + String(e));
    return null;
  }
};
