const DEBUG_MODE = true;
const Debug = DEBUG_MODE ? require('./debug') : null;
const ADVANCED_MODE = true;
const Advanced = ADVANCED_MODE ? require('./advanced') : null;

AppSettingsPage({
  build(props) {
    // Heads up: settingsStorage.addListener isn't in the ZeppOS companion
    // App-side storage changes still trigger a refresh when needed
    const storage = props.settingsStorage;
    // Listen for SYNC_MOOD_DATA messages from the app
    if (typeof window !== 'undefined') {
      window.onmessage = function(event) {
        const msg = event.data;
        if (msg && (msg.method === 'SYNC_MOOD_DATA' || msg.method === 'SYNC_MOOD_DATA_SINGLE') && msg.params) {
          
        }
        // Forward GENERATE_SAMPLE_DATA messages to the app-side (watch)
        if (msg && msg.type === 'GENERATE_SAMPLE_DATA') {
          try {
            if (typeof MessageBuilder !== 'undefined' && MessageBuilder && MessageBuilder.prototype) {
              // Use the ZeppOS MessageBuilder if available
              const builder = new MessageBuilder();
              builder.request({
                method: 'GENERATE_SAMPLE_DATA',
                params: msg.params || {}
              });
            }
          } catch (e) {
            console.log('[SampleData] Failed to send GENERATE_SAMPLE_DATA to watch:', e);
          }
        }
      };
    }
    const safeGet = (key, fallback, parser) => {
      try {
        const value = storage.getItem(key);
        return value == null ? fallback : (parser ? parser(value) : value);
      } catch (e) {
        return fallback;
      }
    };
    const getBool = (key, def) => {
      const value = safeGet(key, null);
      return value === null ? def : value === 'true' ? true : value === 'false' ? false : def;
    };
    const getEnum = (key, allowed, def) => {
      const value = safeGet(key, null);
      return allowed.includes(value) ? value : def;
    };
    const getInt = (key, def) => {
      const num = parseInt(safeGet(key, null), 10);
      return Number.isFinite(num) ? num : def;
    };
    const formatDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const getReferenceDate = () => {
      const d = new Date();
      d.setDate(d.getDate() + dateOffset);
      return d;
    };
    const getViewDays = (refDate) => viewMode === 'month'
      ? new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate()
      : viewMode === 'year'
        ? (((year) => ((year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)) ? 366 : 365)(refDate.getFullYear()))
        : 7;
    
    const debug = Debug ? Debug.initDebug({ props, safeGet, getBool }) : null;

    // Expanded state for the info section
    let isInfoExpanded = getBool('infoExpanded', false);

    // View mode (week/month/year)
    let viewMode = getEnum('viewMode', ['week', 'month', 'year'], 'month');

    // Graph style (bar/dot)
    let graphStyle = getEnum('graphStyle', ['bar', 'dot'], 'bar');

    // Date offset (days from today)
    let dateOffset = getInt('dateOffset', 0);

    // Helper for mood color
    const moodColors = {
      5: '#8be000', // rad - cyan
      4: '#00d8c3', // good - green
      3: '#4eb6e6', // meh - blue
      2: '#ffa726', // bad - orange
      1: '#ff5e6b'  // awful - red
    };
    const getMoodColor = (mood) => moodColors[mood] || '#222';

    // Pull mood data from storage (nested year->month->day format)
    let moodDataByDate = {};
    let hasRealData = false;
    try {
      const storedData = props.settingsStorage.getItem('moodData');
      function toNested(obj) {
        let nested = {};
        for (const key in obj) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
            const [y, m, d] = key.split('-');
            if (!nested[y]) nested[y] = {};
            if (!nested[y][String(Number(m))]) nested[y][String(Number(m))] = {};
            nested[y][String(Number(m))][String(Number(d))] = obj[key];
          } else if (/^\d{4}$/.test(key)) {
            nested[key] = obj[key];
          }
        }
        return nested;
      }
      if (!storedData || storedData === '{}' || storedData === 'null') {
        debug?.log('No data - app-side service may not be running\n');
      } else if (storedData && storedData !== '{}') {
        let parsed = JSON.parse(storedData);
        let nested = toNested(parsed);
        // If any flat keys were present, update storage to nested only
        if (JSON.stringify(parsed) !== JSON.stringify(nested)) {
          props.settingsStorage.setItem('moodData', JSON.stringify(nested));
        }
        debug?.setRawMoodData(JSON.stringify(nested));
        debug?.log(`Size: ${JSON.stringify(nested).length} chars\n`);
        moodDataByDate = nested;
        // Count total entries in nested format
        let entryCount = 0;
        for (const y in moodDataByDate) {
          for (const m in moodDataByDate[y]) {
            entryCount += Object.keys(moodDataByDate[y][m]).length;
          }
        }
        debug?.log(`Parsed ${entryCount} mood entries\n`);
        if (entryCount > 0) {
          hasRealData = true;
          debug?.log(`Found ${entryCount} mood entries\n`);
        }
      } else {
        debug?.log('No moodData in settingsStorage\n');
      }
    } catch (e) {
      debug?.log(`Error: ${e.message}\n`);
    }
    
    if (debug) {
      debug.readSyncLog();
      debug.listKeys();
    }

    // Build mood data array for the current view
    // Helper to get mood value from nested structure
    const getMoodValue = (y, m, d) => {
      y = String(Number(y));
      m = String(Number(m));
      d = String(Number(d));
      return moodDataByDate?.[y]?.[m]?.[d] || 0;
    };

    const generateMoodDataForView = (explicitViewMode, explicitReferenceDate) => {
      const mode = explicitViewMode !== undefined ? explicitViewMode : viewMode;
      const referenceDate = explicitReferenceDate !== undefined ? explicitReferenceDate : getReferenceDate();
      console.log('[generateMoodDataForView] mode:', mode, 'referenceDate:', referenceDate);
      let startDate, endDate, days;
      if (mode === 'week') {
        const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
        const currentDay = referenceDate.getDate();
        const weekNumber = Math.floor((currentDay - 1) / 7);
        startDate = new Date(monthStart);
        startDate.setDate(1 + (weekNumber * 7));
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
        if (endDate > monthEnd) {
          endDate = monthEnd;
        }
        days = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
      } else if (mode === 'month') {
        startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
        endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
        days = endDate.getDate();
      } else if (mode === 'year') {
        startDate = new Date(referenceDate.getFullYear(), 0, 1);
        endDate = new Date(referenceDate.getFullYear(), 11, 31);
        const year = referenceDate.getFullYear();
        const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
        days = isLeapYear ? 366 : 365;
      }
      console.log('[generateMoodDataForView] startDate:', startDate, 'endDate:', endDate, 'days:', days);
      const moodArray = [];
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
        moodArray.push(getMoodValue(y, m, d));
      }
      return { moodArray, referenceDate, startDate, endDate };
    };

    const { moodArray: moodData, referenceDate, startDate, endDate } = generateMoodDataForView();

    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // Format the display date for the current view
    const formatDisplayDate = () => {
      if (viewMode === 'week') {
        // Week view won't cross months, so "Feb 1-7, 2026" works
        return `${monthNamesShort[startDate.getMonth()]} ${startDate.getDate()}-${endDate.getDate()}, ${endDate.getFullYear()}`;
      } else if (viewMode === 'month') {
        return `${monthNames[referenceDate.getMonth()]} ${referenceDate.getFullYear()}`;
      } else {
        return `${referenceDate.getFullYear()}`;
      }
    };

    // Use sample data if we don't have real data
    if (!hasRealData) {
      // Generate sample data for this view
      const sampleData = [];
      for (let i = 0; i < moodData.length; i++) {
        sampleData[i] = Math.random() < 0.7 ? Math.floor(Math.random() * 5) + 1 : 0;
      }
      debug?.log('\\n\\nUsing sample data (no real data found)');
    }

    // Stats
    const validMoods = moodData.filter(m => m > 0);
    const daysLogged = validMoods.length;
    const avgNum = validMoods.length > 0 
      ? validMoods.reduce((a, b) => a + b, 0) / validMoods.length
      : 0;
    const avgMood = avgNum > 0 ? avgNum.toFixed(1) : '0';
    const maxMood = validMoods.length > 0 ? Math.max(...validMoods) : 0;
    const minMood = validMoods.length > 0 ? Math.min(...validMoods) : 0;
    
    // Swing frequency (consecutive days only)
    let swingSum = 0, consecutivePairs = 0;
    if (moodData.length > 1) {
      for (let i = 1; i < moodData.length; i++) {
        if (moodData[i] > 0 && moodData[i - 1] > 0) {
          swingSum += Math.abs(moodData[i] - moodData[i - 1]);
          consecutivePairs++;
        }
      }
    }
    const swingPercentage = consecutivePairs > 0 
      ? ((swingSum / (consecutivePairs * 4)) * 100).toFixed(0) + '%'
      : '0%';
    
    // Mood range
    const rangeText = validMoods.length > 0 ? `${minMood}-${maxMood}` : '0-0';

    // Bar chart views
    const generateBars = () => {
      const count = moodData.length || 1;
      const widthPercent = 100 / count;
      return moodData.map((mood, index) => {
        const height = mood > 0 ? `${(mood / 5) * 100}%` : '5%';
        return View({
          style: {
            position: 'absolute',
            left: `${index * widthPercent}%`,
            bottom: '0',
            width: `calc(${widthPercent}% - ${viewMode === 'month' ? '1px' : '0px'})`,
            marginLeft: viewMode === 'month' ? '0.5px' : '0px',
            height: height,
            backgroundColor: getMoodColor(mood),
            borderRadius: viewMode === 'year' ? '1px 1px 0 0' : '3px 3px 0 0'
          }
        });
      });
    };

    const generateDots = () => {
      const hexToRgb = (hex) => {
        const cleaned = hex.replace('#', '');
        const num = parseInt(cleaned, 16);
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
      };
      const lerpColor = (c1, c2, t) => {
        const a = hexToRgb(c1);
        const b = hexToRgb(c2);
        const r = Math.round(a.r + (b.r - a.r) * t);
        const g = Math.round(a.g + (b.g - a.g) * t);
        const bch = Math.round(a.b + (b.b - a.b) * t);
        return `rgb(${r}, ${g}, ${bch})`;
      };
      const count = moodData.length;
      const dotSize = viewMode === 'year' ? 4 : 8;
      const interpSize = viewMode === 'year' ? 2 : 4;

      const getPoint = (idx, mood) => {
        const x = count > 0 ? ((idx + 0.5) / count) * 100 : 50;
        const row = (5 - mood) / 4;
        const y = row * 100;
        return { x, y };
      };

      const dots = [];
      for (let i = 0; i < count; i++) {
        const mood = moodData[i];
        if (!mood) {
          if (viewMode === 'year') {
            const { x } = getPoint(i, 1);
            const baseSize = 2;
            dots.push(View({
              style: {
                position: 'absolute',
                left: `${x}%`,
                top: `calc(100% - ${baseSize / 2}px)`,
                width: `${baseSize}px`,
                height: `${baseSize}px`,
                backgroundColor: '#222',
                borderRadius: '50%',
                transform: 'translateX(-50%)'
              }
            }));
          }
          continue;
        }
        const { x, y } = getPoint(i, mood);
        dots.push(View({
          style: {
            position: 'absolute',
            left: `${x}%`,
            top: `calc(${y}% - ${dotSize / 2}px)`,
            width: `${dotSize}px`,
            height: `${dotSize}px`,
            backgroundColor: getMoodColor(mood),
            borderRadius: '50%',
            transform: 'translateX(-50%)'
          }
        }));
      }

      const interpDots = [];
      for (let i = 0; i < count; i++) {
        const mood = moodData[i];
        const nextMood = moodData[i + 1];
        if (!mood || !nextMood) continue;

        const p1 = getPoint(i, mood);
        const p2 = getPoint(i + 1, nextMood);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const numDots = distance > 12 ? 4 : distance > 6 ? 2 : 0;
        for (let j = 1; j <= numDots; j++) {
          const t = j / (numDots + 1);
          const ix = p1.x + dx * t;
          const iy = p1.y + dy * t;
          interpDots.push(View({
            style: {
              position: 'absolute',
              left: `${ix}%`,
              top: `calc(${iy}% - ${interpSize / 2}px)`,
              width: `${interpSize}px`,
              height: `${interpSize}px`,
              backgroundColor: lerpColor(getMoodColor(mood), getMoodColor(nextMood), t),
              borderRadius: '50%',
              transform: 'translateX(-50%)'
            }
          }));
        }
      }

      return View({
        style: {
          position: 'relative',
          height: '100%',
          width: '100%',
          padding: viewMode === 'year' ? '0' : '0 5px',
          overflow: 'visible',
          pointerEvents: 'none'
        }
      }, [...dots, ...interpDots]);
    };

    const generateDayLabelsView = () => {
      if (viewMode === 'year') {
        const year = startDate.getFullYear();
        const daysInYear = moodData.length || 365;
        const monthCells = monthNamesShort.map((m, idx) => {
          const daysInMonth = new Date(year, idx + 1, 0).getDate();
          const widthPct = (daysInMonth / daysInYear) * 100;
          return View({
            style: {
              width: `${widthPct}%`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }
          }, Text({
            style: {
              fontSize: '12px',
              color: '#666',
              textAlign: 'center'
            }
          }, m));
        });

        return View({
          style: {
            display: 'flex',
            flexDirection: 'row',
            marginTop: '8px',
            height: '18px'
          }
        }, monthCells);
      }

      const labelIndices = viewMode === 'month'
        ? (moodData.length > 1 ? [0, moodData.length - 1] : [0])
        : moodData.map((_, i) => i);

      const labels = moodData.map((_, i) => {
        if (!labelIndices.includes(i)) return '';
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        return String(d.getDate());
      });

      return View({
        style: {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: '8px',
          height: '18px',
          overflow: 'hidden',
          padding: '0',
          gap: viewMode === 'year' ? '0' : '2px'
        }
      }, labels.map((label) => Text({
        style: {
          flex: 1,
          fontSize: '12px',
          color: label ? '#666' : 'transparent',
          textAlign: 'center'
        }
      }, label || ' ')));
    };

    const generateYearMonthLinesView = () => {
      if (viewMode !== 'year') return null;

      const year = startDate.getFullYear();
      const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      const daysInYear = isLeapYear ? 366 : 365;
      const count = moodData.length || daysInYear;
      const monthStartOffsets = Array.from({ length: 12 }, (_, m) => {
        const d = new Date(year, m, 1);
        return Math.floor((d - startDate) / (1000 * 60 * 60 * 24));
      }).filter((offset) => offset >= 0 && offset < count);

      return View({
        style: {
          position: 'absolute',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          padding: '0',
          pointerEvents: 'none'
        }
      }, monthStartOffsets.map((offset) => {
        const leftPercent = count > 0 ? ((offset + 0.5) / count) * 100 : 0;
        return View({
          style: {
            position: 'absolute',
            top: '0',
            bottom: '0',
            left: `calc(${leftPercent}% - 1px)`,
            width: '0',
            borderLeft: '1px dashed #444'
          }
        });
      }));
    };

    const generateMonthWeekLinesView = () => {
      if (viewMode !== 'month') return null;

      const daysInMonth = moodData.length;
      const weekStartOffsets = [];
      for (let i = 0; i < daysInMonth; i += 7) {
        weekStartOffsets.push(i);
      }

      return View({
        style: {
          position: 'absolute',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          padding: '0 5px',
          pointerEvents: 'none'
        }
      }, weekStartOffsets.map((offset) => {
        const leftPercent = daysInMonth > 0 ? ((offset + 0.5) / daysInMonth) * 100 : 0;
        return View({
          style: {
            position: 'absolute',
            top: '0',
            bottom: '0',
            left: `calc(${leftPercent}% - 1px)`,
            width: '0',
            borderLeft: '1px dashed #444'
          }
        });
      }));
    };

    const viewModes = [
      { label: 'Week', value: 'week' },
      { label: 'Month', value: 'month' },
      { label: 'Year', value: 'year' }
    ];

    const statItems = [
      { value: String(daysLogged), label: 'Days Logged', color: '#00d8c3' },
      { value: avgMood, label: 'Avg Mood', color: '#8be000' },
      { value: swingPercentage, label: 'Swing Freq', color: '#ffb400' },
      { value: rangeText, label: 'Mood Range', color: '#ff5e6b' }
    ];

    const moodLevels = [
      { label: 'Great', color: '#8be000', desc: '- Feeling fantastic and energized' },
      { label: 'Good', color: '#00d8c3', desc: '- Positive and content' },
      { label: 'Meh', color: '#4eb6e6', desc: '- Neutral, neither good nor bad' },
      { label: 'Bad', color: '#ffa726', desc: '- Not feeling great, stressed or down' },
      { label: 'Awful', color: '#ff5e6b', desc: '- Very distressed or upset' }
    ];

    return Section(
      {
        style: {
          backgroundColor: '#1a1a1a',
          minHeight: '100vh',
          fontFamily: 'system-ui, sans-serif',
          color: '#ffffff'
        }
      },
      [
        // Header
        View(
          {
            style: {
              backgroundColor: '#000',
              padding: '20px',
              borderBottom: '2px solid #333',
              marginBottom: '20px'
            }
          },
          [
            Text({
              style: {
                fontSize: '32px',
                fontWeight: '600',
                color: '#ff6600',
                textAlign: 'center',
                marginBottom: '8px'
              }
            }, "Mood Tracker"),
            Text({
              style: {
                fontSize: '14px',
                color: '#888',
                textAlign: 'center',
                marginBottom: '12px',
                marginLeft: '10px',
                position: 'relative',
                bottom: '0.25em'
              }
            }, "")
          ]
        ),

        // Mood data visualization
        View(
          {
            style: {
              backgroundColor: '#222',
              margin: '0 20px 20px 20px',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #333'
            }
          },
          [
            View({
              style: {
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px'
              }
            }, [
              Text({
                style: {
                  fontSize: '20px',
                  fontWeight: '600',
                  color: '#ff6600'
                }
              }, hasRealData ? "Your Mood History" : "Sample Mood Graph"),
              View({
                style: {
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '10px'
                }
              }, [
                Text({
                  style: {
                    fontSize: '12px',
                    color: graphStyle === 'dot' ? '#ff6600' : '#777',
                    fontWeight: '600'
                  }
                }, 'Dots'),
                Toggle({
                  value: graphStyle === 'bar',
                  activeColor: '#1f1f1f',
                  inactiveColor: '#1f1f1f',
                  style: {
                    backgroundColor: '#1f1f1f'
                  },
                  onChange: (value) => {
                    const next = value ? 'bar' : 'dot';
                    props.settingsStorage.setItem('graphStyle', next);
                    console.log('Switched graph style - reload page');
                  }
                }),
                Text({
                  style: {
                    fontSize: '12px',
                    color: graphStyle === 'bar' ? '#ff6600' : '#777',
                    fontWeight: '600'
                  }
                }, 'Bars')
              ])
            ]),
            Text({
              style: {
                fontSize: '13px',
                color: '#888',
                marginBottom: '15px',
                display: 'block'
              }
            }, hasRealData ? "Your mood data from the watch" : "Log moods on your watch to see your real data here"),
            
            // View mode selector
            View({
              style: {
                display: 'flex',
                flexDirection: 'row',
                gap: '10px',
                marginBottom: '20px',
                justifyContent: 'center'
              }
            }, viewModes.map((mode) => Button({
              label: mode.label,
              style: {
                flex: 1,
                backgroundColor: viewMode === mode.value ? '#ff6600' : '#333',
                color: viewMode === mode.value ? '#000' : '#888',
                border: 'none',
                borderRadius: '6px',
                padding: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer'
              },
              onClick: () => {
                props.settingsStorage.setItem('viewMode', mode.value);
                console.log(`Switched to ${mode.value} view - reload page`);
              }
            }))),

            
            
            // Date navigation
            View({
              style: {
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '15px',
                padding: '10px 0'
              }
            }, [
              Button({
                label: '◄',
                style: {
                  backgroundColor: '#444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '18px',
                  fontWeight: '600',
                  cursor: 'pointer'
                },
                onClick: () => {
                  let offset = dateOffset;
                  if (viewMode === 'week') offset -= 7;
                  else if (viewMode === 'month') offset -= 30;
                  else offset -= 365;
                  props.settingsStorage.setItem('dateOffset', String(offset));
                  console.log('Navigate back - reload page');
                }
              }),
              Text({
                style: {
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#ff6600',
                  textAlign: 'center',
                  flex: 1
                }
              }, formatDisplayDate()),
              Button({
                label: '►',
                style: {
                  backgroundColor: '#444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '18px',
                  fontWeight: '600',
                  cursor: 'pointer'
                },
                onClick: () => {
                  let offset = dateOffset;
                  if (viewMode === 'week') offset += 7;
                  else if (viewMode === 'month') offset += 30;
                  else offset += 365;
                  props.settingsStorage.setItem('dateOffset', String(offset));
                  console.log('Navigate forward - reload page');
                }
              })
            ]),
            
            // Graph container
            View(
              {
                style: {
                  backgroundColor: '#0a0a0a',
                  padding: '15px',
                  borderRadius: '8px',
                  marginBottom: '15px',
                  position: 'relative'
                }
              },
              [
                View({
                  style: {
                    position: 'relative',
                    height: '190px',
                    marginBottom: '10px',
                    overflow: 'visible'
                  }
                }, [
                  generateYearMonthLinesView(),
                  generateMonthWeekLinesView(),
                  // Grid lines
                  View({
                    style: {
                      position: 'absolute',
                      top: '0',
                      left: '0',
                      right: '0',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }
                  }, Array.from({ length: graphStyle === 'dot' ? 5 : 6 }, () =>
                    View({ style: { height: '1px', backgroundColor: '#333', width: '100%' } })
                  )),
                  
                  // Bar/dot chart data (generated)
                  (graphStyle === 'bar')
                    ? View({
                        style: {
                          position: 'relative',
                          height: '100%',
                          width: '100%',
                          padding: viewMode === 'year' ? '0' : '0 5px',
                          overflow: 'hidden'
                        }
                      }, generateBars())
                    : generateDots()
                ]),

                View({
                  style: {
                    backgroundColor: '#0a0a0a',
                    borderRadius: '6px'
                  }
                }, generateDayLabelsView())
              ]
            ),
            
            // Stats row
            View({
              style: {
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-around',
                padding: '15px',
                backgroundColor: '#0a0a0a',
                borderRadius: '8px',
                marginBottom: '10px'
              }
            }, statItems.map((item) => View({
              style: {
                textAlign: 'center',
                flex: '1',
                display: 'flex',
                flexDirection: 'column'
              }
            }, [
              Text({
                style: {
                  fontSize: '24px',
                  fontWeight: '700',
                  color: item.color,
                  marginBottom: '5px',
                  textAlign: 'center'
                }
              }, item.value),
              Text({
                style: {
                  fontSize: '12px',
                  color: '#888',
                  textAlign: 'center'
                }
              }, item.label)
            ]))),
            
            Text({
              style: {
                fontSize: '11px',
                color: '#666',
                textAlign: 'center',
                fontStyle: 'italic',
                marginBottom: '15px'
              }
            }, hasRealData ? "Data syncs automatically from your watch" : "Log moods on your watch - data will sync automatically")
          ]
        ),



        // Mood levels legend
        View(
          {
            style: {
              backgroundColor: '#222',
              margin: '0 20px 20px 20px',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #333'
            }
          },
          [
            Text({
              style: {
                fontSize: '18px',
                fontWeight: '600',
                color: '#ff6600',
                marginBottom: '10px',
                display: 'block'
              }
            }, "Mood Levels"),
            ...moodLevels.map((level, idx) => View(
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: idx === moodLevels.length - 1 ? '0' : '12px',
                  gap: '10px'
                }
              },
              [
                View({
                  style: {
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    backgroundColor: level.color
                  }
                }),
                Text({
                  style: {
                    fontSize: '14px',
                    color: level.color,
                    fontWeight: '600'
                  }
                }, level.label),
                Text({
                  style: {
                    fontSize: '14px',
                    color: '#888',
                    marginLeft: '10px'
                  }
                }, level.desc)
              ]
            ))
          ]
        ),

        ...(Advanced ? Advanced.buildAdvancedUI({
          props,
          viewMode,
          referenceDate,
          getReferenceDate,
          getViewDays,
          formatDateKey,
          getBool,
          getCurrentViewRange: () => {
            // Use explicit props, not closure
            console.log('[getCurrentViewRange] viewMode:', viewMode, 'referenceDate:', referenceDate);
            const result = generateMoodDataForView(viewMode, referenceDate);
            console.log('[getCurrentViewRange] generateMoodDataForView result:', result);
            const { startDate, endDate } = result;
            return { startDate, endDate };
          },
          debug: DEBUG_MODE
        }) : []),

        // Toggle for extra info
        View(
          {
            style: {
              margin: '30px 20px 10px 20px'
            }
          },
          [
            Button({
              label: isInfoExpanded ? '▼ About Mood Tracker' : '▶ About Mood Tracker',
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
                isInfoExpanded = !isInfoExpanded;
                props.settingsStorage.setItem('infoExpanded', String(isInfoExpanded));
                console.log('Toggled info section - reload page manually to see changes');
              }
            })
          ]
        ),

        // Info sections (conditional)
        ...(isInfoExpanded ? [
        // About section
        View(
          {
            style: {
              backgroundColor: '#1a1a1a',
              margin: '0 20px',
              padding: '20px',
              borderLeft: '3px solid #333',
              borderRight: '3px solid #333'
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
            }, "About Mood Tracker"),
            Text({
              style: {
                fontSize: '14px',
                color: '#ccc',
                lineHeight: '1.6',
                marginBottom: '10px'
              }
            }, "Track your emotional well-being throughout the day. Simply tap one of the five mood levels to log how you're feeling right now."),
            Text({
              style: {
                fontSize: '14px',
                color: '#ccc',
                lineHeight: '1.6'
              }
            }, "View detailed graphs and statistics on your watch to understand your mood patterns and trends.")
          ]
        ),

        // How to use section
        View(
          {
            style: {
              backgroundColor: '#1a1a1a',
              margin: '0 20px',
              padding: '20px',
              borderLeft: '3px solid #333',
              borderRight: '3px solid #333',
              borderTop: '1px solid #333'
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
            }, "How to Use"),
            Text({
              style: {
                fontSize: '14px',
                color: '#ccc',
                lineHeight: '1.6',
                marginBottom: '8px'
              }
            }, "1. Open the Mood Tracker app on your watch"),
            Text({
              style: {
                fontSize: '14px',
                color: '#ccc',
                lineHeight: '1.6',
                marginBottom: '8px'
              }
            }, "2. Tap one of the five mood buttons to log your current feeling"),
            Text({
              style: {
                fontSize: '14px',
                color: '#ccc',
                lineHeight: '1.6',
                marginBottom: '8px'
              }
            }, "3. Swipe to view your mood graph and statistics"),
            Text({
              style: {
                fontSize: '14px',
                color: '#ccc',
                lineHeight: '1.6'
              }
            }, "4. Track patterns over time to understand your emotional well-being")
          ]
        ),

        // Features section
        View(
          {
            style: {
              backgroundColor: '#1a1a1a',
              margin: '0 20px',
              padding: '20px',
              borderLeft: '3px solid #333',
              borderRight: '3px solid #333',
              borderTop: '1px solid #333'
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
            }, "Features"),
            View({
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }
            }, [
              View({
                style: {
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center'
                }
              }, [
                Text({
                  style: {
                    fontSize: '14px',
                    color: '#ccc',
                    lineHeight: '1.6'
                  }
                }, "📊"),
                Text({
                  style: {
                    fontSize: '14px',
                    color: '#ccc',
                    lineHeight: '1.6',
                    marginLeft: '1em'
                  }
                }, "Visual mood graph showing your patterns")
              ]),
              View({
                style: {
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center'
                }
              }, [
                Text({
                  style: {
                    fontSize: '14px',
                    color: '#ccc',
                    lineHeight: '1.6'
                  }
                }, "📈"),
                Text({
                  style: {
                    fontSize: '14px',
                    color: '#ccc',
                    lineHeight: '1.6',
                    marginLeft: '1em'
                  }
                }, "Detailed statistics page with mood breakdowns")
              ]),
              View({
                style: {
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center'
                }
              }, [
                Text({
                  style: {
                    fontSize: '14px',
                    color: '#ccc',
                    lineHeight: '1.6'
                  }
                }, "💾"),
                Text({
                  style: {
                    fontSize: '14px',
                    color: '#ccc',
                    lineHeight: '1.6',
                    marginLeft: '1em'
                  }
                }, "All data stored locally on your watch")
              ]),
              View({
                style: {
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center'
                }
              }, [
                Text({
                  style: {
                    fontSize: '14px',
                    color: '#ccc',
                    lineHeight: '1.6'
                  }
                }, "🎨"),
                Text({
                  style: {
                    fontSize: '14px',
                    color: '#ccc',
                    lineHeight: '1.6',
                    marginLeft: '1em'
                  }
                }, "Beautiful color-coded interface")
              ])
            ])
          ]
        ),

        // Privacy section
        View(
          {
            style: {
              backgroundColor: '#1a1a1a',
              margin: '0 20px',
              padding: '20px',
              borderLeft: '3px solid #333',
              borderRight: '3px solid #333',
              borderTop: '1px solid #333',
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
            }, "Privacy & Data"),
            Text({
              style: {
                fontSize: '14px',
                color: '#ccc',
                lineHeight: '1.6',
                marginBottom: '8px'
              }
            }, "Your mood data is stored securely on your watch using localStorage. No data is sent to external servers or shared with third parties."),
            Text({
              style: {
                fontSize: '14px',
                color: '#ccc',
                lineHeight: '1.6'
              }
            }, "Your emotional well-being information remains private and under your control.")
          ]
        )
        ] : []),

        ...(debug ? debug.buildDebugUI({ viewMode, getReferenceDate, getViewDays, formatDateKey }) : []),

        // Footer
        View(
          {
            style: {
              backgroundColor: '#000',
              padding: '20px',
              textAlign: 'center',
              borderTop: '1px solid #333',
              marginTop: '20px'
            }
          },
          [
            Text({
              style: {
                fontSize: '12px',
                color: '#666'
              }
            }, "Mood Tracker v1.0.0 • Made with ❤️ for Zepp OS")
          ]
        )
      ]
    );
  }
});
