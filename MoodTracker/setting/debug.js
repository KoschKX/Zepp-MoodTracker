const initDebug = ({ props, safeGet, getBool }) => {
  const storage = props.settingsStorage;

  const consoleLogs = safeGet('consoleLogs', [], (stored) => {
    try {
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  const showRegularLogs = getBool('consoleShowRegular', true);
  const showWarnings = getBool('consoleShowWarnings', true);
  const showErrors = getBool('consoleShowErrors', true);

  const filteredConsoleLogs = consoleLogs.filter(log => !(log.includes('❌') ? !showErrors : log.includes('⚠️') ? !showWarnings : !showRegularLogs));

  let isDebugExpanded = getBool('debugExpanded', false);
  let debugInfo = '';
  let rawMoodDataForCopy = '';
  let syncLogText = 'No sync attempts logged yet';
  // Show full mood data and last single mood entry
  let tempMoodDataBackup = safeGet('moodDataBackup') || '{}';
  let tempMoodDataSingle = safeGet('moodDataSingle') || '{}';
  let fullMoodData = safeGet('moodData', '{}');

  const log = (msg) => {
    debugInfo += msg;
  };

  const setRawMoodData = (raw) => {
    rawMoodDataForCopy = raw;
  };

  const readSyncLog = () => {
    try {
      const syncLogValue = storage.getItem('sync_log');
      if (syncLogValue) {
        syncLogText = syncLogValue;
        debugInfo += `\nSync log found: ${syncLogValue.length} chars`;
      }
    } catch (e) {
      syncLogText = `Error reading sync log: ${e}`;
    }
  };

  const listKeys = () => {
    const allKeys = [];
    try {
      const testKeys = ['moodData', 'mood_history', 'sync_log', 'appSideActive', 'lastSync', 'lastSyncTrigger', 'lastMessageReceived', 'infoExpanded', 'debugExpanded', '_tempMoodDataInput'];
      testKeys.forEach(key => {
        const value = storage.getItem(key);
        if (value !== null && value !== undefined) {
          const valueStr = String(value);
          const preview = valueStr.length > 50 ? valueStr.substring(0, 50) + '...' : valueStr;
          allKeys.push(`${key}=${preview}`);
        }
      });
      debugInfo += `\nFound ${allKeys.length} keys`;
    } catch (e) {
      debugInfo += `\nKey error: ${e.message}`;
    }
  };

  const buildDebugUI = ({ viewMode, getReferenceDate, getViewDays, formatDateKey, advanced }) => [
    // Toggle Button for Debug Info
    View(
      {
        style: {
          margin: '30px 20px 10px 20px'
        }
      },
      [
        Button({
          label: isDebugExpanded ? '▼ Debug' : '▶ Debug',
          style: {
            width: '100%',
            backgroundColor: '#660000',
            color: '#ffcccc',
            border: 'none',
            borderRadius: '8px',
            padding: '15px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            textAlign: 'center'
          },
          onClick: () => {
            isDebugExpanded = !isDebugExpanded;
            storage.setItem('debugExpanded', String(isDebugExpanded));
            // Reload page manually to see changes
          }
        })
      ]
    ),

    // Conditionally render debug section
    ...(isDebugExpanded ? [
      // Debug Section
      View(
        {
          style: {
            backgroundColor: '#330000',
            margin: '0 20px',
            padding: '20px',
            borderLeft: '3px solid #660000',
            borderRight: '3px solid #660000',
            borderRadius: '0 0 12px 12px'
          }
        },
        [
          Text({
            style: {
              fontSize: '16px',
              fontWeight: '600',
              color: '#ff6666',
              marginBottom: '10px',
              display: 'block'
            }
          }, "Debug"),
          
          // Console Logs
          View(
            {
              style: {
                backgroundColor: '#1a0000',
                margin: '15px 0',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid #660000'
              }
            },
            [
              Text({
                style: {
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#ff6666',
                  marginBottom: '8px',
                  display: 'block'
                }
              }, "Console Logs (last 100):"),
              
              // Filter toggles
              View({
                style: {
                  marginBottom: '12px',
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'space-around',
                  alignItems: 'center'
                }
              }, [
                View({
                  style: {
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: '5px'
                  }
                }, [
                  Text({
                    style: {
                      fontSize: '16px'
                    }
                  }, '✅'),
                  Toggle({
                    value: showRegularLogs,
                    onChange: (value) => {
                      storage.setItem('consoleShowRegular', String(value));
                    }
                  })
                ]),
                View({
                  style: {
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: '5px'
                  }
                }, [
                  Text({
                    style: {
                      fontSize: '16px',
                      color: '#ffaa00'
                    }
                  }, '⚠️'),
                  Toggle({
                    value: showWarnings,
                    onChange: (value) => {
                      storage.setItem('consoleShowWarnings', String(value));
                    }
                  })
                ]),
                View({
                  style: {
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: '5px'
                  }
                }, [
                  Text({
                    style: {
                      fontSize: '16px'
                    }
                  }, '❌'),
                  Toggle({
                    value: showErrors,
                    onChange: (value) => {
                      storage.setItem('consoleShowErrors', String(value));
                    }
                  })
                ])
              ]),
              
              Text({
                style: {
                  fontSize: '11px',
                  color: '#888',
                  marginBottom: '8px',
                  display: 'block',
                  fontStyle: 'italic'
                }
              }, "Close and reopen settings to refresh"),
              View({
                style: {
                  backgroundColor: '#000',
                  padding: '10px',
                  borderRadius: '4px',
                  height: '300px',
                  overflowY: 'scroll',
                  fontFamily: 'monospace',
                  fontSize: '11px'
                }
              }, filteredConsoleLogs.length > 0 ? filteredConsoleLogs.map(log => 
                Text({
                  style: {
                    color: log.includes('✅') ? '#0f0' : 
                           log.includes('❌') ? '#f00' : 
                           log.includes('🔔') ? '#ff0' : 
                           log.includes('⚠️') ? '#fa0' : '#888',
                    display: 'block',
                    marginBottom: '4px',
                    wordBreak: 'break-all'
                  }
                }, log)
              ) : [
                Text({
                  style: {
                    color: '#666',
                    display: 'block'
                  }
                }, 'No logs yet')
              ])
            ]
          ),
          
          // Storage Status
          View(
            {
              style: {
                backgroundColor: '#1a0000',
                margin: '15px 0',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid #660000'
              }
            },
            [
              Text({
                style: {
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#ff6666',
                  marginBottom: '8px',
                  display: 'block'
                }
              }, "Storage Status:"),
              Text({
                style: {
                  fontSize: '12px',
                  color: '#ffcccc',
                  fontFamily: 'monospace',
                  display: 'block',
                  marginBottom: '6px',
                  wordBreak: 'break-all'
                }
              }, `Full Data: ${fullMoodData}`),
              Text({
                style: {
                  fontSize: '12px',
                  color: '#ffcccc',
                  fontFamily: 'monospace',
                  display: 'block',
                  marginBottom: '6px',
                  wordBreak: 'break-all'
                }
              }, `Temp Data: ${tempMoodDataBackup}`),
              Text({
                style: {
                  fontSize: '12px',
                  color: '#ffcccc',
                  fontFamily: 'monospace',
                  display: 'block',
                  marginBottom: '6px',
                  wordBreak: 'break-all'
                }
              }, `Single Data: ${tempMoodDataSingle}`),
              Text({
                style: {
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  display: 'block',
                  marginBottom: '1em',
                  whiteSpace: 'pre-wrap'
                }
              }, ``),
              
              View({
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px'
                }
              }, debugInfo.split('\n').map((line, idx) => 
                Text({
                  style: {
                    fontSize: '12px',
                    color: '#ffcccc',
                    fontFamily: 'monospace',
                    display: 'block'
                  }
                }, line || ' ')
              ))
            ]
          ),
          
          // Sync Log Section
          View(
            {
              style: {
                backgroundColor: '#1a0000',
                margin: '15px 0',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid #660000'
              }
            },
            [
              Text({
                style: {
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#ff6666',
                  marginBottom: '8px',
                  display: 'block'
                }
              }, "Phone → Watch Sync Log:"),
              View({
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  maxHeight: '200px',
                  overflowY: 'auto'
                }
              }, syncLogText.split('\n').map((line, idx) => 
                Text({
                  style: {
                    fontSize: '11px',
                    color: line.includes('✅') ? '#66ff66' : line.includes('❌') ? '#ff6666' : '#ffcccc',
                    fontFamily: 'monospace',
                    display: 'block'
                  }
                }, line || ' ')
              ))
            ]
          ),

          ...(advanced ? advanced.buildAdvancedUI({ props, viewMode, getReferenceDate, getViewDays, formatDateKey, getBool }) : []),
          
        ]
      )
    ] : [])
  ];

  return {
    log,
    setRawMoodData,
    readSyncLog,
    listKeys,
    buildDebugUI
  };
};

module.exports = { initDebug };
