import { createWidget, widget, align, prop, event } from '@zos/ui';
import { px } from '@zos/utils';
import { push } from '@zos/router';
import { localStorage } from '@zos/storage';
import { sendMoodDataToPhone } from '../utils/sync';
import { monthNamesAbv } from '../globals';

let PX = null;
const initPX = () => PX || (PX = [0, 1, 6, 8, 10, 12, 14, 15, 16, 20, 24, 25, 26, 30, 32, 35, 36, 40, 45, 48, 50, 58, 64, 68, 70, 76, 78, 80, 96, 112, 120, 150, 180, 200, 210, 272, 296, 300, 416].reduce((o, v) => (o['x' + v] = px(v), o), {neg100: px(-100), neg200: px(-200)}));

const getVis = () => { try { const app = getApp(); if (app?.globalData?.vis) return app.globalData.vis; } catch (e) {} const noop = () => {}; return { log: noop, info: noop, warn: noop, error: noop, initSideRelay: noop, updateSettings: noop, handleSideServiceCall: () => false }; };

const DEBUG_MODE = false, SHOW_INTERPOLATION_DOTS = true, ADAPTIVE_INTERPOLATION_DOTS = true, SHOW_TODAY_ARROW = false, SHOW_CENTER_LINE = true, SHOW_GRID_DOTS = false;

const TARGET_FPS = 15; // Try 60/30/20 if you want
const FRAME_TIME = Math.floor(1000 / TARGET_FPS); // ms per frame
const DEBOUNCE_MULTIPLIER = 1; // bigger = less twitchy on slow devices
const INSTANT_NAV = true; // skip debounce, rely on cache
const ULTRA_LIGHT_NAV = true; // only update date text during nav
const THROTTLE_DATE_UPDATES = true; // keep date updates from spamming the UI
const HIDE_DOTS_DURING_NAV_WEEK = false; // hide dots during fast week scrolling
const HIDE_DOTS_DURING_NAV_MONTH = true; // hide week lines by shoving offscreen
const SHOW_LOADING_INDICATOR = true; // show "..." while waiting for month switch
const SKIP_UI_UPDATES_DURING_NAV = true; // skip UI during nav except date text

let _interpolationEnabled = false, _debugDayOffset = 0, _moodDataByDate = {}, _cachedDebugDate = null, _cachedDebugOffset = 0, _navDebounceTimer = null, _dateUpdateThrottle = null, _prevDisplayedMood = null, _prevDateStr = '', _graphNeedsRedraw = false, _isNavigating = false, _loadingText = null, _lastClearToken = 0, _lastMoodHistorySnapshot = '';

const raf = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
const getDebugDate = () => { 
  if (_cachedDebugDate && _cachedDebugOffset === _debugDayOffset) return _cachedDebugDate;
  const date = new Date(); 
  date.setDate(date.getDate() + _debugDayOffset); 
  _cachedDebugDate = date;
  _cachedDebugOffset = _debugDayOffset;
  return date; 
};

const getItem = () => JSON.stringify(_moodDataByDate);
const setItem = (key, value) => { if (key === 'mood_history') try { _moodDataByDate = JSON.parse(value); } catch { _moodDataByDate = {}; } };
try { const saved = localStorage.getItem('mood_history'); if (saved) setItem('mood_history', saved); } catch (e) {}
const getClearedAtToken = () => {
  try {
    const v = localStorage.getItem('mood_history_cleared_at');
    return v ? Number(v) : 0;
  } catch (e) {
    return 0;
  }
};
const getMoodHistorySnapshot = () => {
  try {
    return localStorage.getItem('mood_history') || '';
  } catch (e) {
    return '';
  }
};
const reloadMoodDataFromStorage = () => {
  try {
    const saved = localStorage.getItem('mood_history');
    setItem('mood_history', saved || '{}');
  } catch (e) {
    _moodDataByDate = {};
  }
  _cachedDebugDate = _moodHistoryCache = null;
};
const refreshMoodDataAndUI = (graphWindowMode) => {
  if (storageWriteTimeout) {
    clearTimeout(storageWriteTimeout);
    storageWriteTimeout = null;
  }
  _interpolationEnabled = false;
  _moodDataByDate = {};
  reloadMoodDataFromStorage();
  _moodHistoryCache = null;
  _moodHistoryCacheKey = null;
  _moodHistoryCache = null;
  _prevDisplayedMood = null;
  if (_loadingText) _loadingText.setProperty?.(prop.MORE, { y: px(226) });
  if (drawGraph) drawGraph(true);
  if (drawGraph && drawGraph.debugDateText && drawGraph.statusText && updateMoodButtonsVisibility.imgWidgets) {
    updateUIAfterDateChange(graphWindowMode, drawGraph.debugDateText, drawGraph.statusText, updateMoodButtonsVisibility.imgWidgets);
  }
  setTimeout(() => {
    try {
      _interpolationEnabled = true;
      drawGraph && drawGraph();
      _loadingText?.setProperty?.(prop.MORE, { y: px(-100) });
    } catch (e) {}
  }, 100);
};
let storageWriteTimeout = null;
const scheduleMoodHistorySave = () => { if (storageWriteTimeout) clearTimeout(storageWriteTimeout); storageWriteTimeout = setTimeout(() => { saveMoodData(); storageWriteTimeout = null; }, 200); };
const stringToArrayBuffer = (str) => { const buf = new ArrayBuffer(str.length), bufView = new Uint8Array(buf); for (let i = 0; i < str.length; i++) bufView[i] = str.charCodeAt(i); return buf; };
const saveMoodData = () => localStorage.setItem('mood_history', getItem());

function sendDataToPhone() {
  const vis = getVis();
  const log = (msg, isError) => DEBUG_MODE && (isError ? vis.error(msg) : vis.log(msg));
  log('=== SYNC START ===');
  // Only send the last mood
  const dateKey = formatDateKey(getDebugDate());
  const lastMoodData = JSON.stringify({ [dateKey]: _moodDataByDate[dateKey] });
  log('Data size: ' + lastMoodData.length);
  sendMoodDataToPhone(lastMoodData, log);
}
const syncToSettingsStorage = (data) => {};

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], msPerDay = 86400000, _dateKeyCache = new Map();
const formatDateKey = (date) => {
  const t = date.getTime();
  if (_dateKeyCache.has(t)) return _dateKeyCache.get(t);
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (_dateKeyCache.size > 100) _dateKeyCache.clear();
  _dateKeyCache.set(t, key);
  return key;
};
const getTodayMood = () => _moodDataByDate[formatDateKey(getDebugDate())] || null;
const setTodayMood = (v) => {
  const dateKey = formatDateKey(getDebugDate());
  // Update local mood history for graph/UI
  if (v == null) {
    delete _moodDataByDate[dateKey];
    // Only remove today's entry from storage
    localStorage.setItem('mood_history', JSON.stringify({ [dateKey]: undefined }));
  } else {
    _moodDataByDate[dateKey] = v;
    // Only write today's entry to storage
    localStorage.setItem('mood_history', JSON.stringify({ [dateKey]: v }));
  }
  // No batch save needed, only today's entry
  // Only send/store the single mood entry for syncing
  try {
    const lastMoodData = JSON.stringify({ [dateKey]: _moodDataByDate[dateKey] });
    syncToSettingsStorage(lastMoodData);
    sendDataToPhone();
  } catch {}
};

let _moodHistoryCache = null, _moodHistoryCacheKey = null;
const getMoodHistoryForDays = (numDays, isMonthMode = false) => {
  const cacheKey = `${numDays}_${isMonthMode}_${_debugDayOffset}_${Object.keys(_moodDataByDate).length}`;
  if (_moodHistoryCache && _moodHistoryCacheKey === cacheKey) return _moodHistoryCache;
  const view = getDebugDate(), today = new Date(), todayKey = formatDateKey(today);
  const base = isMonthMode ? new Date(view.getFullYear(), view.getMonth(), 1).getTime() : view.getTime(), start = isMonthMode ? 0 : -Math.floor(numDays / 2);
  _moodHistoryCacheKey = cacheKey;
  return _moodHistoryCache = Array.from({ length: numDays }, (_, i) => { const d = new Date(base + (start + i) * msPerDay), k = formatDateKey(d); return { day: d.getDate(), mood: _moodDataByDate[k], isToday: k === todayKey }; });
};

const getMonthAverageMood = () => {
  const d = getDebugDate(), y = d.getFullYear(), m = d.getMonth(), days = new Date(y, m + 1, 0).getDate();
  let sum = 0, cnt = 0;
  for (let i = 1; i <= days; i++) { const mood = _moodDataByDate[formatDateKey(new Date(y, m, i))]; if (mood) sum += mood, cnt++; }
  return cnt ? Math.ceil(sum / cnt) : null;
};

const moods = [{ value: 5, name: 'great', img: 'smiley_great.png', color: 0x8be000 }, { value: 4, name: 'good', img: 'smiley_good.png', color: 0x00d8c3 }, { value: 3, name: 'meh', img: 'smiley_meh.png', color: 0x4eb6e6 }, { value: 2, name: 'bad', img: 'smiley_bad.png', color: 0xffa726 }, { value: 1, name: 'awful', img: 'smiley_awful.png', color: 0xff5e6b }];
const moodValueMap = moods.reduce((a, m) => (a[m.value] = m, a), {});
let graphWindowMode = 0, lastDebugOffset = 0;
const lerpColor = (c1, c2, t) => (Math.round(((c1>>16)&0xFF)+(((c2>>16)&0xFF)-((c1>>16)&0xFF))*t)<<16)|(Math.round(((c1>>8)&0xFF)+(((c2>>8)&0xFF)-((c1>>8)&0xFF))*t)<<8)|Math.round((c1&0xFF)+((c2&0xFF)-(c1&0xFF))*t);

function drawGraph(skipDots = false) {
  if (drawGraph._isRendering) return;
  drawGraph._isRendering = true;
  
  let { graphGroup, legendGroup, backgroundWidget, gridGroup, tapArea, xAxisGroup } = drawGraph;
  const graphTop = 210, graphHeight = 80, graphLeft = 76, graphWidth = 272, moodRows = moods.length;
  
  const gpx = drawGraph._graphPx || (drawGraph._graphPx = { top: PX.x210, height: px(graphHeight), left: PX.x76, width: PX.x272, topMinus16: px(graphTop - 16), heightPlus32: px(graphHeight + 32), topPlus14: px(graphTop + graphHeight + 14), topPlus35: px(graphTop + graphHeight + 35), leftMinus10: px(graphLeft - 10), leftMinus26: px(graphLeft - 26), widthPlus20: px(graphWidth + 20) });
  
  const debugDate = getDebugDate();
  const year = debugDate.getFullYear(), month = debugDate.getMonth();
  let windowSize = graphWindowMode === 1 ? new Date(year, month + 1, 0).getDate() : 7;
  
  // Pull mood data for the current window
  const moodData = getMoodHistoryForDays(windowSize, graphWindowMode === 1);
  
  // Date offset changed? redraw dots
  const dateOffsetChanged = lastDebugOffset !== _debugDayOffset;
  if (dateOffsetChanged) {
    lastDebugOffset = _debugDayOffset;
  }

  const stripeWidth = graphWidth / (windowSize - 1), halfStripe = 0;

  let cyMap = {}, moodCounts = [0, 0, 0, 0, 0], todayIndex = -1;
  const dataLen = moodData.length;
  if (!skipDots) {
    for (let i = 0; i < moods.length; ++i) cyMap[moods[i].value] = graphTop + Math.round((moods.length - moods[i].value) * graphHeight / (moodRows - 1));
    for (let idx = 0; idx < dataLen; ++idx) {
      const mood = moodData[idx].mood;
      if (mood) moodCounts[moods.length - mood]++;
      if (moodData[idx].isToday) todayIndex = idx;
    }
  }

  if (!legendGroup) {
    legendGroup = createWidget(widget.GROUP, { x: 0, y: 0, w: PX.x416, h: PX.x416 });
    drawGraph.legendGroup = legendGroup;
    legendGroup._legendWidgets = []; legendGroup._countWidgets = [];
    const legendTop = graphTop + graphHeight + 35, legendSpacing = 48, legendLeft = Math.floor((416 - moods.length * legendSpacing) / 2) + 4, [pxLegendTop2, pxLegendTop18] = [px(legendTop - 2), px(legendTop + 18)];
    moods.forEach((mood, i) => {
      const pxSlot = px(legendLeft + i * legendSpacing + legendSpacing / 2 - 20);
      legendGroup._legendWidgets.push(createWidget(widget.TEXT, { x: pxSlot, y: pxLegendTop2, w: PX.x40, h: PX.x20, color: mood.color, text_size: PX.x20, align_h: align.CENTER_H, text: '━' }));
      legendGroup._countWidgets.push(createWidget(widget.TEXT, { x: pxSlot, y: pxLegendTop18, w: PX.x40, h: PX.x20, color: mood.color, text_size: PX.x16, align_h: align.CENTER_H, text: '0' }));
      legendGroup._legendWidgets.push(legendGroup._countWidgets[i]);
    });
  }
  if (!skipDots) {
    if (!drawGraph._prevMoodCounts) drawGraph._prevMoodCounts = [0, 0, 0, 0, 0];
    for (let i = 0; i < legendGroup._countWidgets.length; i++) {
      const countIdx = moods.length - moods[i].value, newCount = moodCounts[countIdx];
      if (newCount !== drawGraph._prevMoodCounts[countIdx]) { legendGroup._countWidgets[i].setProperty(prop.MORE, { text: String(newCount) }); drawGraph._prevMoodCounts[countIdx] = newCount; }
    }
  }

  // Tap handler to cycle window mode (invisible overlay on the graph)
  if (!drawGraph._globalClickSetup) {
    let tapDebounce = null; 
    
    // Invisible tap area just over the graph
    if (!tapArea) {
      tapArea = createWidget(widget.FILL_RECT, {
        x: graphLeft - 16, 
        y: graphTop - 16, 
        w: graphWidth + 32, 
        h: graphHeight + 48,
        alpha: 0
      });
      tapArea.addEventListener && tapArea.addEventListener(event.CLICK_DOWN, (info) => {
        if (tapDebounce) return;
        tapDebounce = setTimeout(() => { tapDebounce = null; }, 1500);
        
        graphWindowMode = (graphWindowMode + 1) % 2;
        
        // Update date display for the new mode
        if (drawGraph.updateDateDisplay) {
          drawGraph.updateDateDisplay();
        }
        
        // Update status text right away
        if (drawGraph.statusText) {
          const isMonthMode = graphWindowMode === 1;
          const displayMood = isMonthMode ? getMonthAverageMood() : getTodayMood();
          const moodData = displayMood ? moodValueMap[displayMood] : null;
          const isViewingToday = _debugDayOffset === 0;
          
          let prefix = '';
          if (isMonthMode) {
            const viewDate = getDebugDate();
            const actualToday = new Date();
            if (viewDate.getMonth() === actualToday.getMonth() && viewDate.getFullYear() === actualToday.getFullYear()) {
              prefix = 'This month: ';
            }
          } else if (isViewingToday && displayMood) {
            prefix = 'Today: ';
          }
          
          drawGraph.statusText.setProperty && drawGraph.statusText.setProperty(prop.MORE, displayMood ? { text: `${prefix}${moodData?.name || ''}`, color: moodData?.color || 0x888888 } : { text: isViewingToday ? 'Tap your mood!' : 'No record', color: 0xffffff, text_size: PX.x24 });
          _prevDisplayedMood = displayMood;
        }
        
        drawGraph();
        updateMoodButtonsVisibility();
      });
      drawGraph.tapArea = tapArea;
    }
    drawGraph._globalClickSetup = true;
  }

  if (!drawGraph.gridWidgets) {
    drawGraph.gridWidgets = [];
    if (SHOW_GRID_DOTS) for (let i = 0; i < moods.length; ++i) {
      const y = graphTop + Math.round((moods.length - moods[i].value) * graphHeight / (moodRows - 1)), gridDot = createWidget(widget.TEXT, { x: gpx.leftMinus26, y: px(y - 10), w: PX.x20, h: PX.x20, color: moods[i].color, text_size: PX.x12, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '●' });
      gridDot.setProperty?.(prop.MORE, { z: 1 });
      drawGraph.gridWidgets.push(gridDot);
    }
  }

  const dotSize = 8;
  const MAX_POOL_SIZE = 31; // max days in a month
  const INITIAL_POOL_SIZE = 7; // start small for faster startup

  if (!skipDots && !drawGraph.centerLineDots && SHOW_CENTER_LINE) {
    drawGraph.centerLineDots = [];
    const centerX = graphLeft + graphWidth / 2 - 1, numDots = 9, dotSpacing = graphHeight / 8;
    for (let i = 0; i < numDots; i++) {
      const centerDot = createWidget(widget.TEXT, { x: px(centerX - 4), y: px(graphTop + i * dotSpacing - 5), w: PX.x10, h: PX.x10, color: 0x666666, text_size: PX.x10, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '•' });
      centerDot.setProperty?.(prop.MORE, { z: 2 });
      drawGraph.centerLineDots.push(centerDot);
    }
  }
  if (!skipDots && drawGraph.centerLineDots?.length) {
    const shouldShow = SHOW_CENTER_LINE && graphWindowMode === 0 && !(HIDE_DOTS_DURING_NAV_WEEK && _isNavigating), dotSpacing = graphHeight / 8;
    for (let i = 0; i < drawGraph.centerLineDots.length; i++) drawGraph.centerLineDots[i].setProperty?.(prop.MORE, { y: px((shouldShow ? graphTop + i * dotSpacing - 1 : -100) - 4) });
  }
  
  if (!skipDots && !drawGraph.weekLineDots) {
    drawGraph.weekLineDots = Array.from({ length: 5 }, () => {
      const lineDots = [];
      for (let i = 0; i < 9; i++) {
        const weekDot = createWidget(widget.TEXT, { x: PX.x0, y: PX.neg100, w: PX.x10, h: PX.x10, color: 0x666666, text_size: PX.x10, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '•' });
        weekDot.setProperty?.(prop.MORE, { z: 2 });
        lineDots.push(weekDot);
      }
      return lineDots;
    });
  }
  if (!skipDots && drawGraph.weekLineDots) {
    const dotSpacing = graphHeight / 8, hiddenY = px(-100);
    const shouldHide = (HIDE_DOTS_DURING_NAV_MONTH && _isNavigating && graphWindowMode === 1) || graphWindowMode !== 1;
    const cacheKey = `${graphWindowMode}_${windowSize}_${dataLen}`;
    const needsUpdate = drawGraph._weekLineCacheKey !== cacheKey;
    
    // Update only when visibility/data changed (not every nav tick)
    if (needsUpdate || shouldHide !== drawGraph._weekLinesHidden) {
      drawGraph._weekLineCacheKey = cacheKey;
      drawGraph._weekLinesHidden = shouldHide;
      
      drawGraph.weekLineDots.forEach((lineDots, lineIdx) => {
        if (shouldHide) {
          // Offscreen = hidden
          lineDots.forEach(d => d.setProperty?.(prop.MORE, { y: hiddenY }));
        } else {
          const dayIdx = lineIdx * 7;
          if (dayIdx < dataLen) {
            const pxCx = px(graphLeft + dayIdx * stripeWidth - 3);
            lineDots.forEach((d, i) => d.setProperty?.(prop.MORE, { x: pxCx, y: px(graphTop + i * dotSpacing - 5) }));
          } else {
            // Offscreen if out of range
            lineDots.forEach(d => d.setProperty?.(prop.MORE, { y: hiddenY }));
          }
        }
      });
    }
  }

  if (!skipDots) {
    const createDot = (size, z) => { const dot = createWidget(widget.TEXT, { x: PX.x0, y: PX.neg100, w: PX.x16, h: PX.x16, color: 0x000000, text_size: size, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '●' }); dot.setProperty?.(prop.MORE, { z }); return dot; };
    const pxDotSize = px(8);
    if (!drawGraph.dotPool) drawGraph.dotPool = [];
    let dotsNeeded = moodData.filter(d => d.mood).length;
    while (drawGraph.dotPool.length < dotsNeeded && drawGraph.dotPool.length < 31) drawGraph.dotPool.push(createDot(pxDotSize, 100));
    if (!drawGraph.interpPool && SHOW_INTERPOLATION_DOTS && _interpolationEnabled) drawGraph.interpPool = [];
    let dotPoolIdx = 0, interpIdx = 0;
    const shouldHideDots = _isNavigating && ((graphWindowMode === 0 && HIDE_DOTS_DURING_NAV_WEEK) || (graphWindowMode === 1 && HIDE_DOTS_DURING_NAV_MONTH));
    for (let dayIdx = 0; dayIdx < windowSize; dayIdx++) {
      const mood = moodData[dayIdx].mood;
      if (mood && moodValueMap[mood]) {
        const dot = drawGraph.dotPool[dotPoolIdx++], moodObj = moodValueMap[mood], cy = cyMap[mood], cx = graphLeft + dayIdx * stripeWidth + halfStripe;
        shouldHideDots ? dot.setProperty(prop.MORE, { y: PX.neg100 }) : dot.setProperty(prop.MORE, { x: px(cx - 8), y: px(cy - 8), color: moodObj.color });
        if (SHOW_INTERPOLATION_DOTS && _interpolationEnabled && !shouldHideDots && dayIdx < windowSize - 1) {
          const nextMood = moodData[dayIdx + 1].mood;
          if (nextMood && moodValueMap[nextMood]) {
            const nextObj = moodValueMap[nextMood], nextCy = cyMap[nextMood], nextCx = graphLeft + (dayIdx + 1) * stripeWidth + halfStripe, deltaX = nextCx - cx, deltaY = nextCy - cy;
            let numDots = 3;
            if (ADAPTIVE_INTERPOLATION_DOTS) {
              const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
              numDots = distance > 60 ? 3 : distance > 35 ? 2 : distance > 10 ? 1 : 0;
            }
            for (let i = 1; i <= numDots; i++, interpIdx++) {
              const t = ADAPTIVE_INTERPOLATION_DOTS ? i / (numDots + 1) : i * 0.25;
              if (interpIdx >= drawGraph.interpPool.length) {
                const d = createWidget(widget.TEXT, { x: 0, y: -100, w: PX.x12, h: PX.x12, color: 0x000000, text_size: PX.x10, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '•' });
                d.setProperty?.(prop.MORE, { z: 10 });
                drawGraph.interpPool.push(d);
              }
              drawGraph.interpPool[interpIdx].setProperty(prop.MORE, { x: px(cx + deltaX * t - 6), y: px(cy + deltaY * t - 6), color: lerpColor(moodObj.color, nextObj.color, t) });
            }
          }
        }
      }
    }
    for (let i = dotPoolIdx; i < drawGraph.dotPool.length; i++) drawGraph.dotPool[i].setProperty(prop.MORE, { y: PX.neg100 });
    const prevInterpIdx = drawGraph._prevInterpIdx || 0;
    if (interpIdx < prevInterpIdx) for (let i = interpIdx; i < prevInterpIdx; i++) drawGraph.interpPool[i].setProperty(prop.MORE, { y: px(-100) });
    drawGraph._prevInterpIdx = interpIdx;
  }

  const labelIndices = graphWindowMode === 1 ? (dataLen > 1 ? [0, dataLen - 1] : [0]) : Array.from({ length: Math.ceil(dataLen / 1) }, (_, i) => i * 1).filter(i => i < dataLen);
  if (!drawGraph.xAxisLabelWidgets) drawGraph.xAxisLabelWidgets = [];
  if (!drawGraph.todayArrowBg) drawGraph.todayArrowBg = createWidget(widget.TEXT, { x: PX.x0, y: PX.x0, w: PX.x40, h: PX.x40, color: 0xffffff, text_size: PX.x32, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '▲', text_style: 0 });
  const xAxisY = graphTop + graphHeight + 14, labelCount = labelIndices.length, prevLabelCount = drawGraph._prevLabelCount || 0;
  const labelsChanged = labelCount !== prevLabelCount || graphWindowMode !== drawGraph._prevGraphMode || dateOffsetChanged;
  if (SHOW_TODAY_ARROW && todayIndex >= 0) drawGraph.todayArrowBg.setProperty(prop.MORE, { x: px(graphLeft + todayIndex * stripeWidth + halfStripe - 20), y: px(xAxisY - 12) }); else drawGraph.todayArrowBg.setProperty(prop.MORE, { y: px(-100) });
  if (labelsChanged || !drawGraph._labelsInitialized) {
    const pxXAxisY = px(xAxisY);
    for (let i = 0; i < 31; i++) {
      if (i < labelCount) {
        if (!drawGraph.xAxisLabelWidgets[i]) drawGraph.xAxisLabelWidgets[i] = createWidget(widget.TEXT, { x: PX.x0, y: pxXAxisY, w: PX.x30, h: PX.x20, color: 0x888888, text_size: PX.x14, align_h: align.CENTER_H, text: '' });
        const idx = labelIndices[i], { day: dayNum, isToday } = moodData[idx], cx = graphLeft + idx * stripeWidth + halfStripe;
        drawGraph.xAxisLabelWidgets[i].setProperty(prop.MORE, { x: px(cx - 15), y: isToday ? px(xAxisY - 3) : pxXAxisY, text: String(dayNum), color: isToday ? (SHOW_TODAY_ARROW ? 0x000000 : 0xffffff) : 0x888888, text_size: isToday ? PX.x16 : PX.x14 });
      } else if (i < prevLabelCount && drawGraph.xAxisLabelWidgets[i]) drawGraph.xAxisLabelWidgets[i].setProperty(prop.MORE, { y: PX.neg100, text: '' });
    }
    drawGraph._prevLabelCount = labelCount; drawGraph._labelsInitialized = true; drawGraph._prevGraphMode = graphWindowMode;
  }

  if (!drawGraph.statsWidgets) {
    const spx = drawGraph._statsPx || (drawGraph._statsPx = { leftCol: px(75), rightCol: px(155), rightLabelCol: px(220), rightValueCol: PX.x300, row1: PX.x120, row2: PX.x150, labelWidth: PX.x96, valueWidth: PX.x50, height: PX.x30 });
    const createText = (x, y, color, size) => createWidget(widget.TEXT, { x, y, w: spx.valueWidth, h: spx.height, color, text_size: size, align_h: align.RIGHT, align_v: align.CENTER_V, text: '0' });
    drawGraph.statsWidgets = {
      daysLoggedLabel: createWidget(widget.TEXT, { x: spx.leftCol, y: spx.row1, w: spx.labelWidth, h: spx.height, color: 0xaaaaaa, text_size: PX.x16, align_h: align.RIGHT, align_v: align.CENTER_V, text: 'Days logged:' }),
      daysLoggedValue: createText(spx.rightCol, spx.row1, 0xffffff, PX.x20),
      swingLabel: createWidget(widget.TEXT, { x: spx.rightLabelCol, y: spx.row2, w: spx.labelWidth, h: spx.height, color: 0xaaaaaa, text_size: PX.x16, align_h: align.RIGHT, align_v: align.CENTER_V, text: 'Swing freq:' }),
      swingValue: createText(spx.rightValueCol, spx.row2, 0xffffff, PX.x20),
      avgMoodLabel: createWidget(widget.TEXT, { x: spx.leftCol, y: spx.row2, w: spx.labelWidth, h: spx.height, color: 0xaaaaaa, text_size: PX.x16, align_h: align.RIGHT, align_v: align.CENTER_V, text: 'Avg mood:' }),
      avgMoodValue: createText(spx.rightCol, spx.row2, 0xffffff, PX.x20),
      rangeLabel: createWidget(widget.TEXT, { x: spx.rightLabelCol, y: spx.row2, w: spx.labelWidth, h: spx.height, color: 0xaaaaaa, text_size: PX.x16, align_h: align.RIGHT, align_v: align.CENTER_V, text: 'Mood range:' }),
      rangeValue: createText(spx.rightValueCol, spx.row2, 0xffffff, PX.x20)
    };
    drawGraph.statsWidgets.swingValue.setProperty(prop.MORE, { text: '-' });
    drawGraph.statsWidgets.avgMoodValue.setProperty(prop.MORE, { text: '-' });
    drawGraph.statsWidgets.rangeValue.setProperty(prop.MORE, { text: '' });
  }
  const statsY = graphWindowMode === 1 ? [PX.x120, PX.x120, PX.x120, PX.x120, PX.x150, PX.x150, PX.x150, PX.x150] : Array(8).fill(PX.neg200);
  if (graphWindowMode === 1) {
    const logged = moodData.filter(d => d.mood), daysLogged = logged.length, avgNum = daysLogged ? logged.reduce((sum, d) => sum + d.mood, 0) / daysLogged : 0;
    const [avgMood, avgMoodColor] = daysLogged ? [avgNum.toFixed(1), moodValueMap[Math.round(avgNum)]?.color || 0xffffff] : ['-', 0xffffff];
    let swingSum = 0, consecutivePairs = 0;
    for (let i = 1; i < moodData.length; i++) if (moodData[i].mood && moodData[i-1].mood && moodData[i].day - moodData[i-1].day === 1) { swingSum += Math.abs(moodData[i].mood - moodData[i-1].mood); consecutivePairs++; }
    const swingPercentage = consecutivePairs > 0 ? ((swingSum / (consecutivePairs * 4)) * 100).toFixed(0) + '' : '0';
    const moods = logged.map(d => d.mood).filter(m => m), rangeText = moods.length ? `${Math.min(...moods)}-${Math.max(...moods)}` : '-';
    drawGraph.statsWidgets.daysLoggedValue.setProperty(prop.MORE, { text: String(daysLogged) });
    drawGraph.statsWidgets.avgMoodValue.setProperty(prop.MORE, { text: avgMood, color: avgMoodColor });
    drawGraph.statsWidgets.swingValue.setProperty(prop.MORE, { text: swingPercentage });
    drawGraph.statsWidgets.rangeValue.setProperty(prop.MORE, { text: rangeText });
  }
  Object.values(drawGraph.statsWidgets).forEach((w, i) => w.setProperty(prop.MORE, { y: statsY[i] }));
  drawGraph._renderCount = (drawGraph._renderCount || 0) + 1;
  drawGraph._isRendering = false;
}

const updateMoodButtonsVisibility = () => { if (updateMoodButtonsVisibility.imgWidgets) { const y = graphWindowMode === 0 ? PX.x120 : PX.neg200; updateMoodButtonsVisibility.imgWidgets.forEach(w => w.setProperty?.(prop.MORE, { y })); } };

const updateUIAfterDateChange = (debugDateText, statusText, imgWidgets) => {
  const buildDateStr = (d, mode) => mode === 1 ? `${monthNamesAbv[d.getMonth()]} ${d.getFullYear()}` : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const updateMoodUI = () => {
    const isMonthMode = graphWindowMode === 1, displayMood = isMonthMode ? getMonthAverageMood() : getTodayMood();
    if (displayMood === _prevDisplayedMood) return;
    const moodData = displayMood ? moodValueMap[displayMood] : null, isToday = _debugDayOffset === 0;
    let prefix = '';
    if (isMonthMode && displayMood) { const view = getDebugDate(), now = new Date(); if (view.getMonth() === now.getMonth() && view.getFullYear() === now.getFullYear()) prefix = 'This month: '; }
    else if (isToday && displayMood) prefix = 'Today: ';
    statusText.setProperty?.(prop.MORE, displayMood ? { text: `${prefix}${moodData?.name || ''}`, color: moodData?.color || 0x888888 } : { text: isToday ? 'Tap your mood!' : 'No record', color: 0xffffff, text_size: PX.x24 });
    const todayMood = getTodayMood();
    // Update only the widgets that changed
    if (_prevDisplayedMood !== todayMood) {
      // Had a previous mood? dim it
      if (_prevDisplayedMood) {
        imgWidgets[5 - _prevDisplayedMood].setProperty?.(prop.MORE, { alpha: 180 });
      } else if (!todayMood) {
        // No mood at all: keep everything at 180
        imgWidgets.forEach(w => w.setProperty?.(prop.MORE, { alpha: 180 }));
      }
      // If we have a mood, highlight it
      if (todayMood) imgWidgets[5 - todayMood].setProperty?.(prop.MORE, { alpha: 255 });
    }
    _prevDisplayedMood = todayMood;
  };
  if (ULTRA_LIGHT_NAV) {
    if (!THROTTLE_DATE_UPDATES || !_dateUpdateThrottle) { const str = buildDateStr(getDebugDate(), graphWindowMode); debugDateText.setProperty?.(prop.MORE, { text: str }); _prevDateStr = str; if (THROTTLE_DATE_UPDATES) _dateUpdateThrottle = setTimeout(() => _dateUpdateThrottle = null, 16); }
    _isNavigating = true;
    if (SHOW_LOADING_INDICATOR && graphWindowMode === 1 && _loadingText) _loadingText.setProperty?.(prop.MORE, { y: px(226) });
    if ((graphWindowMode === 0 && HIDE_DOTS_DURING_NAV_WEEK) || (graphWindowMode === 1 && HIDE_DOTS_DURING_NAV_MONTH)) { _cachedDebugDate = _moodHistoryCache = null; drawGraph(); }
    if (_navDebounceTimer) clearTimeout(_navDebounceTimer);
    _navDebounceTimer = setTimeout(() => { _isNavigating = false; _loadingText?.setProperty?.(prop.MORE, { y: px(-100) }); _cachedDebugDate = _moodHistoryCache = null; drawGraph(); updateMoodUI(); _navDebounceTimer = null; }, FRAME_TIME * DEBOUNCE_MULTIPLIER);
    return;
  }
  if (INSTANT_NAV) { _cachedDebugDate = _moodHistoryCache = null; drawGraph(); drawGraph.updateDateDisplay?.(); updateMoodUI(); return; }
  const str = buildDateStr(getDebugDate(), graphWindowMode);
  if (str !== _prevDateStr) { debugDateText.setProperty?.(prop.MORE, { text: str }); _prevDateStr = str; }
  _isNavigating = true;
  if (_navDebounceTimer) clearTimeout(_navDebounceTimer);
  _navDebounceTimer = setTimeout(() => { _isNavigating = false; if (SKIP_UI_UPDATES_DURING_NAV) updateMoodUI(); _cachedDebugDate = _moodHistoryCache = null; drawGraph(); _navDebounceTimer = null; }, FRAME_TIME * DEBOUNCE_MULTIPLIER);
};

Page({
  onInit(params) {
    try {
      const app = getApp && getApp();
      if (app && app.globalData) {
        app.globalData.onMoodDataCleared = (token) => {
          try {
            if (token && token !== _lastClearToken) {
              _lastClearToken = token;
            }
            refreshMoodDataAndUI();
          } catch (e) {}
        };
      }
    } catch (e) {}
    // Mood from mood_select: update data before render
    let moodValue = null;
    try {
      if (params && typeof params === 'string') {
        if (params.startsWith('{')) {
          const parsed = JSON.parse(params);
          moodValue = parsed?.mood ?? null;
        } else {
          moodValue = params;
        }
      } else if (params && typeof params === 'object') {
        moodValue = params.mood ?? null;
      }
      if (moodValue == null) {
        const app = getApp && getApp();
        if (app?.globalData?.selectedMood) {
          moodValue = app.globalData.selectedMood;
          app.globalData.selectedMood = null;
        }
      }
    } catch (e) {}

    if (moodValue != null && `${moodValue}`.length) {
      const moodNum = Number(moodValue);
      if (!Number.isNaN(moodNum)) {
        console.log('[MoodPage] Received mood from params:', moodNum);
        const today = new Date();
        const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        _moodDataByDate[dateKey] = moodNum;
        setTimeout(() => {
          try {
            localStorage.setItem('mood_history', JSON.stringify(_moodDataByDate));
            console.log('[MoodPage] Mood saved successfully!');
          } catch (e) {
            console.log('[MoodPage] Error saving mood:', e);
          }
        }, 0);
      }
    }
  },
  build() {
    initPX();
    const getDateStr = (m) => m === 1 ? `${monthNamesAbv[getDebugDate().getMonth()]} ${getDebugDate().getFullYear()}` : `${getDebugDate().getMonth() + 1}/${getDebugDate().getDate()}/${getDebugDate().getFullYear()}`;
    const todayMood = getTodayMood();
    const debugDateText = createWidget(widget.TEXT, { x: PX.x58, y: PX.x58, w: PX.x300, h: PX.x50, color: 0xff6600, text_size: PX.x32, align_h: align.CENTER_H, align_v: align.CENTER_V, text: _debugDayOffset === 0 ? getDateStr(graphWindowMode) : `${getDateStr(graphWindowMode)} (${_debugDayOffset > 0 ? '+' : ''}${_debugDayOffset}d)` });
    drawGraph.updateDateDisplay = () => debugDateText.setProperty?.(prop.MORE, { text: getDateStr(graphWindowMode) });
    drawGraph.debugDateText = debugDateText;
    const statusText = createWidget(widget.TEXT, { x: PX.x0, y: PX.x25, w: PX.x416, h: PX.x35, color: todayMood ? moodValueMap[todayMood]?.color || 0xffffff : 0xffffff, text_size: PX.x24, align_h: align.CENTER_H, align_v: align.CENTER_V, text: todayMood ? `Today: ${moodValueMap[todayMood]?.name || ''}` : 'Tap your mood!' });
    const imgWidgets = moods.map((mood, i) => { 
      const img = createWidget(widget.IMG, { x: px(PX.x45 + i * PX.x68), y: PX.x120, w: PX.x64, h: PX.x64, src: mood.img, alpha: todayMood === mood.value ? 255 : 180 }); 
      img.addEventListener?.(event.CLICK_DOWN, () => { 
        // Only allow clearing in week mode (graphWindowMode === 0)
        const dateKey = formatDateKey(getDebugDate());
        if (graphWindowMode !== 0) {
          _moodHistoryCache = null;
          setTodayMood(mood.value);
          statusText.setProperty?.(prop.MORE, { text: `${_debugDayOffset === 0 ? 'Today: ' : ''}${mood.name}`, color: mood.color, text_size: PX.x24 });
          imgWidgets.forEach((w, j) => w.setProperty?.(prop.MORE, { alpha: mood.value === moods[j].value ? 255 : 180 }));
          drawGraph();
          return;
        }
        const currentMood = _moodDataByDate[dateKey];
        if (currentMood === mood.value) {
          delete _moodDataByDate[dateKey];
          _moodHistoryCache = null;
          statusText.setProperty?.(prop.MORE, { text: 'Tap your mood!', color: 0xffffff, text_size: PX.x24 });
          imgWidgets.forEach((w) => w.setProperty?.(prop.MORE, { alpha: 180 }));
          drawGraph();
          scheduleMoodHistorySave();
        } else {
          _moodHistoryCache = null;
          setTodayMood(mood.value);
          statusText.setProperty?.(prop.MORE, { text: `${_debugDayOffset === 0 ? 'Today: ' : ''}${mood.name}`, color: mood.color, text_size: PX.x24 });
          imgWidgets.forEach((w, j) => w.setProperty?.(prop.MORE, { alpha: mood.value === moods[j].value ? 255 : 180 }));
          drawGraph();
        }
      }); 
      return img; 
    });
    debugDateText.addEventListener?.(event.CLICK_DOWN, () => { _debugDayOffset = 0; updateUIAfterDateChange(debugDateText, statusText, imgWidgets); });
    updateMoodButtonsVisibility.imgWidgets = imgWidgets;
    const navigateDate = dir => { if (graphWindowMode === 0) _debugDayOffset += dir; else { const curr = _cachedDebugDate && _cachedDebugOffset === _debugDayOffset ? _cachedDebugDate : getDebugDate(), tgtM = curr.getMonth() + dir, tgtY = tgtM < 0 ? curr.getFullYear() - 1 : (tgtM > 11 ? curr.getFullYear() + 1 : curr.getFullYear()), normM = ((tgtM % 12) + 12) % 12, tgtD = Math.min(curr.getDate(), new Date(tgtY, normM + 1, 0).getDate()), tgt = new Date(tgtY, normM, tgtD), now = new Date(); now.setHours(0, 0, 0, 0); tgt.setHours(0, 0, 0, 0); _debugDayOffset = Math.round((tgt.getTime() - now.getTime()) / msPerDay); } updateUIAfterDateChange(debugDateText, statusText, imgWidgets); };
    const leftArrow = createWidget(widget.TEXT, { x: PX.x50, y: PX.x36, w: PX.x80, h: PX.x70, color: 0xff6600, text_size: PX.x78, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '«' });
    leftArrow.addEventListener?.(event.CLICK_DOWN, () => navigateDate(-1));
    const rightArrow = createWidget(widget.TEXT, { x: PX.x296, y: PX.x36, w: PX.x80, h: PX.x70, color: 0xff6600, text_size: PX.x78, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '»' });
    rightArrow.addEventListener?.(event.CLICK_DOWN, () => navigateDate(1));
    drawGraph.statusText = statusText;
    drawGraph(true);
    _loadingText = createWidget(widget.TEXT, { x: px(182), y: px(226), w: px(60), h: px(30), color: 0x888888, text_size: px(24), align_h: align.CENTER_H, align_v: align.CENTER_V, text: '...' });
    setTimeout(() => { _interpolationEnabled = true; drawGraph(); _loadingText.setProperty?.(prop.MORE, { y: px(-100) }); }, 100); 
  },
  onShow() {
    try {
      const app = getApp && getApp();
      if (app && app.globalData) {
        app.globalData.onMoodDataCleared = (token) => {
          try {
            if (token && token !== _lastClearToken) {
              _lastClearToken = token;
            }
            refreshMoodDataAndUI();
          } catch (e) {}
        };
      }
      const token = app?.globalData?.moodDataClearedAt || 0;
      const storedToken = getClearedAtToken();
      const nextToken = token || storedToken;
      if (nextToken && nextToken !== _lastClearToken) {
        _lastClearToken = nextToken;
        _lastMoodHistorySnapshot = getMoodHistorySnapshot();
        refreshMoodDataAndUI();
      }
    } catch (e) {}

  },
  onHide() {
  },
  onDestroy() {
    return
    try {
      const app = getApp && getApp();
      if (app && app.globalData && app.globalData.onMoodDataCleared) {
        app.globalData.onMoodDataCleared = null;
      }
    } catch (e) {}
    try {
      if (storageWriteTimeout) clearTimeout(storageWriteTimeout), storageWriteTimeout = null;
      const stored = (() => { try { return localStorage.getItem('mood_history') || ''; } catch { return ''; } })();
      if (stored === '{}' || stored === '') {
        return;
      }
      // Removed clearedAt/_lastClearToken check to always allow save/sync after clear
      saveMoodData();
      const d = getItem();
      if (d && d !== '{}') {
        try { syncToSettingsStorage(d); } catch {}
        try { sendDataToPhone(); } catch {}
      }
    } catch {}
  }
});
 