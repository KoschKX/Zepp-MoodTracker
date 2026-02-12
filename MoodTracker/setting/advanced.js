const buildAdvancedUI = ({ props, viewMode, referenceDate, getReferenceDate, getViewDays, formatDateKey, getBool, getCurrentViewRange, getCurrentViewData, sampleDataGenerator }) => {
  const storage = props.settingsStorage;
  let isAdvancedExpanded = getBool('advancedExpanded', false);

  function sampleDataGenerator(sDate = null, eDate = null) {
    if (!sDate || !eDate) { return null;}
    // Merge
    let parsed = {};
    const storedData = storage.getItem('moodData');
    if (storedData && storedData !== '{}' && storedData !== 'null') {
      try { parsed = JSON.parse(storedData); } catch (e) {}
    }
    date = new Date(sDate);
    const sample = {};
    while (date <= eDate) {
      const key = formatDateKey(date);
      // Always generate a non-zero mood so sample windows are fully populated
      const value = Math.floor(Math.random() * 5) + 1;
      sample[key] = value;
      parsed[key] = value;
      date.setDate(date.getDate() + 1);
    }
    // Save merged data to settingsStorage (phone)
    storage.setItem('moodData', JSON.stringify(parsed));
    return { sample, startDate: sDate, endDate: eDate };
  }

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
              const range = getCurrentViewRange();
              const { startDate, endDate } = range;
              const sample = getCurrentViewData();
              const msPerDay = 24 * 60 * 60 * 1000;
              const days = Math.round((endDate - startDate) / msPerDay) + 1;
              const payload = {
                data: sample,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                days
              };
              storage.setItem('clearMoodRange', JSON.stringify(payload));
              console.log('[PhoneData] Clear payload set:', payload);
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
              const range = getCurrentViewRange();
              const result = sampleDataGenerator(range.startDate, range.endDate);
              if (!result) return;
              const { sample, startDate, endDate } = result;
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
