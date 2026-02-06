const buildAdvancedUI = ({ props, viewMode, getReferenceDate, getViewDays, formatDateKey, getBool }) => {
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
              try {
                const storedData = storage.getItem('moodData');
                if (!storedData) {
                  return;
                }
                const parsed = JSON.parse(storedData);

                const referenceDate = getReferenceDate();
                const days = getViewDays(referenceDate);

                for (let i = days - 1; i >= 0; i--) {
                  const date = new Date(referenceDate);
                  date.setDate(date.getDate() - i);
                  const key = formatDateKey(date);
                  if (parsed[key]) {
                    delete parsed[key];
                  }
                }

                storage.setItem('moodData', JSON.stringify(parsed));
                // Manually refresh to see changes
              } catch (e) {
                // Ignore errors here
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
              // Manually refresh the page
            }
          })
        ]
      )
    ] : [])
  ];
};

module.exports = { buildAdvancedUI };
