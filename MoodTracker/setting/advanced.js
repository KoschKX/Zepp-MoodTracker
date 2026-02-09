const buildAdvancedUI = ({ props, viewMode, referenceDate, getReferenceDate, getViewDays, formatDateKey, getBool, getCurrentViewRange }) => {
  const storage = props.settingsStorage;
  let isAdvancedExpanded = getBool('advancedExpanded', false);

  return [
    // Advanced toggle
    View(
      {
        style: {
          margin: '30px 20px 10px 20px'
        }
      },
      [
        Button({
          label: isAdvancedExpanded ? '▼ Advanced' : '▶ Advanced',
          style: {
            width: '100%',
            backgroundColor: '#444',
            color: '#ccc',
            border: 'none',
            borderRadius: '8px',
            padding: '15px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            textAlign: 'center'
          },
          onClick: () => {
            isAdvancedExpanded = !isAdvancedExpanded;
            storage.setItem('advancedExpanded', String(isAdvancedExpanded));
            // Manually reload to see changes
          }
        })
      ]
    ),

    // Advanced section
    ...(isAdvancedExpanded ? [
      View(
        {
          style: {
            backgroundColor: '#1a1a1a',
            margin: '0 20px',
            padding: '20px',
            borderLeft: '3px solid #333',
            borderRight: '3px solid #333',
            borderRadius: '0 0 12px 12px'
          }
        },
        [
          Text({
            style: {
              fontSize: '16px',
              fontWeight: '600',
              color: '#ff6600',
              marginBottom: '10px',
              display: 'block'
            }
          }, "Advanced"),
          Text({
            style: {
              fontSize: '14px',
              color: '#ccc',
              lineHeight: '1.6',
              marginBottom: '8px'
            }
          }, "Destructive actions — use carefully"),
          Text({
            style: {
              fontSize: '14px',
              color: '#ccc',
              lineHeight: '1.6',
              display: 'inline-block',
              marginBottom: '10px'
            }
          }, `Clear all mood data for the ${viewMode} window currently shown in the graph`),
          Button({
            label: `Clear ${viewMode.charAt(0).toUpperCase() + viewMode.slice(1)} Data`,
            style: {
              width: '100%',
              backgroundColor: '#ff6600',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer'
            },
            onClick: () => {
              console.log('[ClearSection] Orange clear button pressed - handler is firing');
              try {
                // Only use settingsStorage (phone)
                let parsed = {};
                const storedData = storage.getItem('moodData');
                console.log('[ClearSection] settingsStorage.moodData (before):', storedData);
                if (storedData && storedData !== '{}' && storedData !== 'null') {
                  parsed = JSON.parse(storedData);
                }
                // Get the current view's start and end date from the graph context
                if (!getCurrentViewRange) {
                  console.log('[ClearSection] ERROR: getCurrentViewRange is not defined or not a function:', getCurrentViewRange);
                  return;
                }
                const range = typeof getCurrentViewRange === 'function' ? getCurrentViewRange() : {};
                console.log('[ClearSection] getCurrentViewRange result:', range);
                const startDate = range.startDate;
                const endDate = range.endDate;
                console.log('[ClearSection] startDate:', startDate, 'endDate:', endDate);
                if (!startDate || !endDate) {
                  console.log('[ClearSection] No start/end date:', startDate, endDate);
                  return;
                }
                let date = new Date(startDate);
                while (date <= endDate) {
                  const key = formatDateKey(date);
                  delete parsed[key];
                  console.log('[ClearSection] Deleting key:', key);
                  date.setDate(date.getDate() + 1);
                }
                storage.setItem('moodData', JSON.stringify(parsed));
                console.log('[ClearSection] settingsStorage.moodData (after):', JSON.stringify(parsed));
                // Calculate days between startDate and endDate (inclusive)
                const msPerDay = 24 * 60 * 60 * 1000;
                const days = Math.round((endDate - startDate) / msPerDay) + 1;
                const clearPayload = {
                  referenceDate: endDate.toISOString(),
                  days,
                  timestamp: Date.now()
                };
                storage.setItem('clearMoodRange', JSON.stringify(clearPayload));
                console.log('[ClearSection] clearMoodRange payload:', clearPayload);
                // Send clear command to watch (using referenceDate and days)
                if (window && window.postMessage) {
                  const msg = { type: 'CLEAR_MOOD_DATA_RANGE', referenceDate: endDate.toISOString(), days };
                  window.postMessage(msg, '*');
                  console.log('[ClearSection] postMessage:', msg);
                }
              } catch (e) {
                console.log('[ClearSection] Exception:', e);
              }
            }
          }),
          Button({
            label: 'Clear All Data',
            style: {
              width: '100%',
              backgroundColor: '#cc0000',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              marginTop: '10px'
            },
            onClick: () => {
              storage.removeItem('moodData');
              storage.setItem('clearMoodAll', String(Date.now()));
              // Manually refresh the page
            }
          }),
          // Debug label
          Text({
            style: {
              fontSize: '15px',
              fontWeight: '600',
              color: '#c00000',
              margin: '18px 0 8px 0',
              display: 'block',
              textAlign: 'left'
            }
          }, 'Debug'),
          // Generate Sample Data button (moved under Debug)
          Button({
            label: 'Generate Sample Data',
            style: {
              width: '100%',
              backgroundColor: '#0099ff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '10px'
            },
            onClick: () => {
              // Generate random mood data for the current view range
              const range = typeof getCurrentViewRange === 'function' ? getCurrentViewRange() : {};
              const { startDate, endDate } = range;
              if (!startDate || !endDate) {
                console.log('[SampleData] No start/end date:', startDate, endDate);
                return;
              }
              // Merge with existing moodData
              let parsed = {};
              const storedData = storage.getItem('moodData');
              if (storedData && storedData !== '{}' && storedData !== 'null') {
                try { parsed = JSON.parse(storedData); } catch (e) {}
              }
              let date = new Date(startDate);
              const sample = {};
              while (date <= endDate) {
                const key = formatDateKey(date);
                sample[key] = Math.random() < 0.7 ? Math.floor(Math.random() * 5) + 1 : 0;
                parsed[key] = sample[key];
                date.setDate(date.getDate() + 1);
              }
              // Save merged data to settingsStorage (phone)
              storage.setItem('moodData', JSON.stringify(parsed));
              // Also trigger sync to watch
              const msPerDay = 24 * 60 * 60 * 1000;
              const days = Math.round((endDate - startDate) / msPerDay) + 1;
              const payload = {
                data: sample,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                days
              };
              storage.setItem('generateSampleData', JSON.stringify(payload));
              console.log('[SampleData] generateSampleData payload set:', payload);
            }
          })
        ]
      )
    ] : [])
  ];
};

module.exports = { buildAdvancedUI };
