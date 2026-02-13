import { createWidget, widget, align, prop, event } from '@zos/ui';
import { px } from '@zos/utils';

import * as globals from '../globals';
import * as state from './state';
import * as ui from './ui';
import * as calc from './calc';
import * as data from './data';

// TAP AREA
let TAPAREA_CALLBACK = null;
export function getTapAreaCallback() {
  return TAPAREA_CALLBACK;
}
export function setTapAreaCallback(cb) {
  TAPAREA_CALLBACK = typeof cb === 'function' ? cb : null;
}
let TAPAREA_URL = '';
export function getTapAreaUrl() {
  return TAPAREA_URL;
}
export function setTapAreaUrl(url) {
  TAPAREA_URL = typeof url === 'string' ? url : '';
}


let MAX_MOOD_DOTS = 31;
export function getMaxMoodDots() {
  return MAX_MOOD_DOTS;
}
export function setMaxMoodDots(val) {
  MAX_MOOD_DOTS = Math.max(1, Number(val) || 7);
}

// Declare missing local state
let lastDebugOffset = 0;

// GRAPH WINDOW MODE (0 = week, 1 = month)
let _graphWindowMode = 0;
export const getGraphWindowMode = () => _graphWindowMode;
export const setGraphWindowMode = (mode) => { _graphWindowMode = mode; };

export function drawGraph(skipDots = false, stagger) {
  if (drawGraph._isRendering) return;
  if (drawGraph._perfEnabled && typeof console !== 'undefined' && console.time) console.time('drawGraph');
  drawGraph._isRendering = true;
  // Clear any previous stagger timers from earlier renders (support timeout and raf handles)
  if (drawGraph._staggerTimer) {
    try {
      if (typeof drawGraph._staggerTimer === 'object' && drawGraph._staggerTimer.type === 'raf' && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(drawGraph._staggerTimer.id);
      else clearTimeout(drawGraph._staggerTimer);
    } catch (e) {}
    drawGraph._staggerTimer = null;
  }
  if (drawGraph._staggerInterpTimer) {
    try {
      if (typeof drawGraph._staggerInterpTimer === 'object' && drawGraph._staggerInterpTimer.type === 'raf' && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(drawGraph._staggerInterpTimer.id);
      else clearTimeout(drawGraph._staggerInterpTimer);
    } catch (e) {}
    drawGraph._staggerInterpTimer = null;
  }

  const PX = ui.getPX();
  
  let { graphGroup, legendGroup, backgroundWidget, gridGroup, tapArea, xAxisGroup } = drawGraph;
  const graphTop = 210, graphHeight = 80, graphLeft = 76, graphWidth = 272, moodRows = globals.moods.length;
  
  const gpx = drawGraph._graphPx || (drawGraph._graphPx = { top: PX.x210, height: px(graphHeight), left: PX.x76, width: PX.x272, topMinus16: px(graphTop - 16), heightPlus32: px(graphHeight + 32), topPlus14: px(graphTop + graphHeight + 14), topPlus35: px(graphTop + graphHeight + 35), leftMinus10: px(graphLeft - 10), leftMinus26: px(graphLeft - 26), widthPlus20: px(graphWidth + 20) });

  // Simple pool for prop objects to avoid allocating small literal objects
  if (!drawGraph._propPool) {
    const poolLen = 128;
    drawGraph._propPool = new Array(poolLen);
    for (let i = 0; i < poolLen; i++) drawGraph._propPool[i] = {};
    drawGraph._propPoolIdx = 0;
    drawGraph._getPXYC = (x, y, c) => {
      const p = drawGraph._propPool[drawGraph._propPoolIdx];
      p.x = x; p.y = y; p.color = c;
      drawGraph._propPoolIdx = (drawGraph._propPoolIdx + 1) % poolLen;
      return p;
    };
    drawGraph._getPY = (y) => {
      const p = drawGraph._propPool[drawGraph._propPoolIdx];
      p.y = y;
      drawGraph._propPoolIdx = (drawGraph._propPoolIdx + 1) % poolLen;
      return p;
    };
    drawGraph._getTextProp = (text, color, text_size) => {
      const p = drawGraph._propPool[drawGraph._propPoolIdx];
      p.text = text; p.color = color;
      if (typeof text_size !== 'undefined') p.text_size = text_size;
      drawGraph._propPoolIdx = (drawGraph._propPoolIdx + 1) % poolLen;
      return p;
    };
    drawGraph._getLabelProp = (x, y, text, color, text_size, h) => {
      const p = drawGraph._propPool[drawGraph._propPoolIdx];
      p.x = x; p.y = y; p.text = text; p.color = color; p.text_size = text_size; p.h = h;
      drawGraph._propPoolIdx = (drawGraph._propPoolIdx + 1) % poolLen;
      return p;
    };
  }
  
  const debugDate = state.getDebugDate();
  const year = debugDate.getFullYear(), month = debugDate.getMonth();
  let windowSize = getGraphWindowMode() === 1 ? new Date(year, month + 1, 0).getDate() : 7;

  // Dynamically set MAX_MOOD_DOTS to windowSize to avoid out-of-bounds errors
  setMaxMoodDots(windowSize);

  // Defer creation of heavy month-mode pooled widgets to avoid blocking initial render.
  if (getGraphWindowMode() === 1 && !drawGraph._monthPoolsInitialized && !drawGraph._monthPoolInitScheduled) {
    drawGraph._monthPoolInitScheduled = setTimeout(() => {
      drawGraph._monthPoolsInitialized = true;
      drawGraph._monthPoolInitScheduled = null;
      try { drawGraph(); } catch (e) {}
    }, 0);
  }

  // Pull mood data for the current window
  const moodData = state.getMoodHistoryForDays(windowSize, getGraphWindowMode() === 1);
  
  // Date offset changed? redraw dots
  const dateOffsetChanged = lastDebugOffset !== state.getDebugDayOffset();
  if (dateOffsetChanged) {
    lastDebugOffset = state.getDebugDayOffset();
  }

  const stripeWidth = graphWidth / (windowSize - 1), halfStripe = 0;

  let cyMap = {}, moodCounts = [0, 0, 0, 0, 0], todayIndex = -1;
  const dataLen = moodData.length;
  if (!skipDots) {
    for (let i = 0; i < globals.moods.length; ++i) cyMap[globals.moods[i].value] = graphTop + Math.round((globals.moods.length - globals.moods[i].value) * graphHeight / (moodRows - 1));
    for (let idx = 0; idx < dataLen; ++idx) {
      const mood = moodData[idx].mood;
      if (typeof mood === 'number') moodCounts[globals.moods.length - mood]++;
      if (moodData[idx].isToday) todayIndex = idx;
    }
  } else {
    // Move all dots off screen if skipping dots
    if (drawGraph.dotPool) drawGraph.dotPool.forEach(dot => dot.setProperty?.(prop.MORE, { y: px(-100) }));
    if (drawGraph.interpPool) drawGraph.interpPool.forEach(dot => dot.setProperty?.(prop.MORE, { y: px(-100) }));
    if (drawGraph.weekLineDots) drawGraph.weekLineDots.forEach(lineDots => lineDots.forEach(dot => dot.setProperty?.(prop.MORE, { y: px(-100) })));
    if (drawGraph.centerLineDots) drawGraph.centerLineDots.forEach(dot => dot.setProperty?.(prop.MORE, { y: px(-100) }));
  }

  if (!legendGroup) {
    legendGroup = createWidget(widget.GROUP, { x: 0, y: 0, w: PX.x416, h: PX.x416 });
    drawGraph.legendGroup = legendGroup;
    legendGroup._legendWidgets = []; legendGroup._countWidgets = [];
    const legendTop = graphTop + graphHeight + 35, legendSpacing = 48, legendLeft = Math.floor((416 - globals.moods.length * legendSpacing) / 2) + 4, [pxLegendTop2, pxLegendTop18] = [px(legendTop - 2), px(legendTop + 18)];
    globals.moods.forEach((mood, i) => {
      const pxSlot = px(legendLeft + i * legendSpacing + legendSpacing / 2 - 20);
      // Only create if not already present
      if (!legendGroup._legendWidgets[i]) legendGroup._legendWidgets[i] = createWidget(widget.TEXT, { x: pxSlot, y: pxLegendTop2, w: PX.x40, h: PX.x20, color: mood.color, text_size: PX.x20, align_h: align.CENTER_H, text: '━' });
      if (!legendGroup._countWidgets[i]) legendGroup._countWidgets[i] = createWidget(widget.TEXT, { x: pxSlot, y: pxLegendTop18, w: PX.x40, h: PX.x20, color: mood.color, text_size: PX.x16, align_h: align.CENTER_H, text: '0' });
    });
  }
  if (!skipDots) {
    if (!drawGraph._prevMoodCounts) drawGraph._prevMoodCounts = [0, 0, 0, 0, 0];
    for (let i = 0; i < legendGroup._countWidgets.length; i++) {
      const countIdx = globals.moods.length - globals.moods[i].value, newCount = moodCounts[countIdx];
      if (newCount !== drawGraph._prevMoodCounts[countIdx]) {
        legendGroup._countWidgets[i].setProperty(prop.MORE, drawGraph._getTextProp(String(newCount)));
        drawGraph._prevMoodCounts[countIdx] = newCount;
      }
    }
  }

  // Tap event handler function
  function handleTapEvent(info) {
    if (drawGraph._tapDebounce) return;
    drawGraph._tapDebounce = setTimeout(() => { drawGraph._tapDebounce = null; }, 150);
    if (typeof TAPAREA_CALLBACK === 'function') {
      const handled = TAPAREA_CALLBACK(info);
      if (handled === true) return;
    }
    if (TAPAREA_URL && typeof TAPAREA_URL === 'string' && TAPAREA_URL.length > 0) {
      ui.navigateToPage(TAPAREA_URL);
      return;
    }
    setGraphWindowMode((getGraphWindowMode() + 1) % 2);
    if (drawGraph.updateDateDisplay) {
      drawGraph.updateDateDisplay();
    }
    if (drawGraph.statusText) {
      const isMonthMode = getGraphWindowMode() === 1;
      const displayMood = isMonthMode ? calc.getMonthAverageMood(state.getDebugDate(), state.getMoodHistoryByDateAll()) : data.getTodayMood();
      const moodData = displayMood ? globals.moodValueMap[displayMood] : null;
      const isViewingToday = state.getDebugDayOffset() === 0;
      let prefix = '';
      if (isMonthMode) {
        const viewDate = state.getDebugDate();
        const actualToday = new Date();
        if (viewDate.getMonth() === actualToday.getMonth() && viewDate.getFullYear() === actualToday.getFullYear()) {
          prefix = 'This month: ';
        }
      } else if (isViewingToday && displayMood) {
        prefix = 'Today: ';
      }
      if (drawGraph.statusText && drawGraph.statusText.setProperty) {
        const statusStr = displayMood ? `${prefix}${moodData?.name || ''}` : (isViewingToday ? 'Tap your mood!' : 'No record');
        const statusColor = displayMood ? (moodData?.color || 0x888888) : 0xffffff;
        const statusSize = (!displayMood && isViewingToday) ? PX.x24 : undefined;
        drawGraph.statusText.setProperty(prop.MORE, drawGraph._getTextProp(statusStr, statusColor, statusSize));
      }
      state.setPrevDisplayedMood(displayMood);
    }
    drawGraph();
    ui.updateMoodButtonsVisibility(getGraphWindowMode());
  }

  // Ensure only one tap area widget exists at a time, and keep it above the dots
  if (drawGraph.tapArea && typeof drawGraph.tapArea.remove === 'function') {
    drawGraph.tapArea.remove();
    drawGraph.tapArea = null;
  }

  // Draw tap area widget last, covering only the graph area
  if (!drawGraph.tapArea) {
    drawGraph.tapArea = createWidget(widget.FILL_RECT, {
      x: graphLeft - 16,
      y: graphTop - 16,
      w: graphWidth + 32,
      h: graphHeight + 48,
      alpha: 0,
      z: 9999
    });
    drawGraph.tapArea.addEventListener && drawGraph.tapArea.addEventListener(event.CLICK_DOWN, handleTapEvent);
  }

  // Optionally attach tap event handler only to visible/active mood/interpolation/line dots
  if (globals.ATTACH_DOT_TAP_EVENTS) {
    if (drawGraph.dotPool && moodData) {
      let dotPoolIdx = 0;
      for (let dayIdx = 0; dayIdx < windowSize; dayIdx++) {
        const mood = moodData[dayIdx]?.mood;
        if (typeof mood === 'number' && globals.moodValueMap[mood]) {
          const dot = drawGraph.dotPool[dotPoolIdx++];
          if (dot && dot.addEventListener) {
            if (!dot._listenerAdded) {
              dot.addEventListener(event.CLICK_DOWN, handleTapEvent);
              dot._listenerAdded = true;
            }
          }
        }
      }
    }
    if (drawGraph.interpPool && moodData && globals.SHOW_INTERPOLATION_DOTS && state.getInterpolationEnabled()) {
      let interpIdx = 0;
      for (let dayIdx = 0; dayIdx < windowSize - 1; dayIdx++) {
        const mood = moodData[dayIdx]?.mood;
        const nextMood = moodData[dayIdx + 1]?.mood;
        if (mood && globals.moodValueMap[mood] && nextMood && globals.moodValueMap[nextMood]) {
          let numDots = 3;
          if (globals.ADAPTIVE_INTERPOLATION_DOTS) {
            const cy = cyMap[mood], cx = graphLeft + dayIdx * stripeWidth + halfStripe;
            const nextCy = cyMap[nextMood], nextCx = graphLeft + (dayIdx + 1) * stripeWidth + halfStripe;
            const dx = nextCx - cx, dy = nextCy - cy;
            const sd = dx * dx + dy * dy; // squared distance
            numDots = sd > 3600 ? 3 : sd > 1225 ? 2 : sd > 100 ? 1 : 0;
          }
          for (let i = 1; i <= numDots; i++, interpIdx++) {
            const interp = drawGraph.interpPool[interpIdx];
              if (interp && interp.addEventListener && !interp._listenerAdded) {
                interp.addEventListener(event.CLICK_DOWN, handleTapEvent);
                interp._listenerAdded = true;
              }
          }
        }
      }
    }
    if (drawGraph.weekLineDots) {
      drawGraph.weekLineDots.forEach(lineDots => {
        lineDots.forEach(dot => {
          // Only attach if dot is visible (y >= 0)
          if (dot && dot.addEventListener && dot._prevProps && dot._prevProps.y >= 0 && !dot._listenerAdded) {
            dot.addEventListener(event.CLICK_DOWN, handleTapEvent);
            dot._listenerAdded = true;
          }
        });
      });
    }
    if (drawGraph.centerLineDots) {
      drawGraph.centerLineDots.forEach(dot => {
        if (dot && dot.addEventListener && dot._prevProps && dot._prevProps.y >= 0) {
            if (!dot._listenerAdded) {
              dot.addEventListener(event.CLICK_DOWN, handleTapEvent);
              dot._listenerAdded = true;
            }
        }
      });
    }
  }

  if (!drawGraph.gridWidgets) {
    drawGraph.gridWidgets = [];
    if (globals.SHOW_GRID_DOTS) for (let i = 0; i < globals.moods.length; ++i) {
      const y = graphTop + Math.round((globals.moods.length - globals.moods[i].value) * graphHeight / (moodRows - 1)), gridDot = createWidget(widget.TEXT, { text: '●', x: gpx.leftMinus26, y: px(y - 10), w: PX.x20, h: PX.x20, color: globals.moods[i].color, text_size: PX.x12, align_h: align.CENTER_H, align_v: align.CENTER_V });
      gridDot.setProperty?.(prop.MORE, { z: 1 });
      drawGraph.gridWidgets.push(gridDot);
    }
  }

  // center line is only relevant for week mode; avoid creating when in month mode
  if (!skipDots && globals.SHOW_CENTER_LINE && getGraphWindowMode() === 0) {
    const desiredNum = globals.VERTICAL_GRAPH_DOTS || 9;
    // If existing centerLineDots don't match desired count, remove and recreate
    if (drawGraph.centerLineDots && drawGraph.centerLineDots.length !== desiredNum) {
      try {
        drawGraph.centerLineDots.forEach(d => d && typeof d.remove === 'function' && d.remove());
      } catch (e) {}
      drawGraph.centerLineDots = null;
    }
    if (!drawGraph.centerLineDots) {
      drawGraph.centerLineDots = [];
      const centerX = graphLeft + graphWidth / 2 - 1;
      const numDots = desiredNum;
      const dotSpacing = graphHeight / Math.max(1, numDots - 1);
      // store numeric Y positions (pre-px) so week lines can reuse exact values
      drawGraph._verticalDotYPositions = [];
      for (let i = 0; i < numDots; i++) {
        const yVal = graphTop + i * dotSpacing - globals.VERTICAL_GRAPH_DOT_OFFSET;
        drawGraph._verticalDotYPositions.push(yVal);
        const centerDot = createWidget(widget.TEXT, { x: px(centerX - 4), y: px(yVal), w: px(globals.VERTICAL_GRAPH_DOT_SIZE), h: px(globals.VERTICAL_GRAPH_DOT_SIZE), color: globals.VERTICAL_GRAPH_DOT_COLOR || 0x666666, text_size: px(globals.VERTICAL_GRAPH_DOT_TEXT_SIZE), align_h: align.CENTER_H, align_v: align.CENTER_V, text: (globals.VERTICAL_GRAPH_DOT_GLYPH || '•') });
        centerDot.setProperty?.(prop.MORE, { z: 2 });
        drawGraph.centerLineDots.push(centerDot);
      }
    }
  }
  if (!skipDots && drawGraph.centerLineDots?.length) {
    const shouldShow = globals.SHOW_CENTER_LINE && getGraphWindowMode() === 0 && !(globals.HIDE_DOTS_DURING_NAV_WEEK && state.getIsNavigating());
    const numDots = drawGraph.centerLineDots.length || (globals.VERTICAL_GRAPH_DOTS || 9);
    for (let i = 0; i < drawGraph.centerLineDots.length; i++) {
      const targetY = shouldShow ? (drawGraph._verticalDotYPositions?.[i] ?? (graphTop + i * (graphHeight / Math.max(1, numDots - 1)) - globals.VERTICAL_GRAPH_DOT_OFFSET)) : -100;
      drawGraph.centerLineDots[i].setProperty?.(prop.MORE, { y: px(targetY) });
    }
  }
  
  // weekLineDots used for month layout; only create when month pools are initialized
  if (!skipDots && (getGraphWindowMode() !== 1 || drawGraph._monthPoolsInitialized)) {
    const desiredNum = globals.VERTICAL_GRAPH_DOTS || 9;
    // If weekLineDots exist but length per line differs, remove and recreate
    if (drawGraph.weekLineDots && drawGraph.weekLineDots.length > 0 && drawGraph.weekLineDots[0].length !== desiredNum) {
      try { drawGraph.weekLineDots.forEach(line => line.forEach(d => d && typeof d.remove === 'function' && d.remove())); } catch (e) {}
      drawGraph.weekLineDots = null;
    }
    if (!skipDots && !drawGraph.weekLineDots) {
      drawGraph.weekLineDots = Array.from({ length: 5 }, () => {
        const lineDots = [];
        for (let i = 0; i < desiredNum; i++) {
          const weekDot = createWidget(widget.TEXT, { x: PX.x0, y: PX.neg100, w: px(globals.VERTICAL_GRAPH_DOT_SIZE), h: px(globals.VERTICAL_GRAPH_DOT_SIZE), color: globals.VERTICAL_GRAPH_DOT_COLOR || 0x666666, text_size: px(globals.VERTICAL_GRAPH_DOT_TEXT_SIZE), align_h: align.CENTER_H, align_v: align.CENTER_V, text: (globals.VERTICAL_GRAPH_DOT_GLYPH || '•') });
          weekDot.setProperty?.(prop.MORE, { z: 2 });
          lineDots.push(weekDot);
        }
        return lineDots;
      });
    }
  }
  if (!skipDots && drawGraph.weekLineDots) {
    const dotSpacing = graphHeight / Math.max(1, ((globals.VERTICAL_GRAPH_DOTS || 9) - 1)), hiddenY = px(-100);
    const shouldHide = (globals.HIDE_DOTS_DURING_NAV_MONTH && state.getIsNavigating() && getGraphWindowMode() === 1) || getGraphWindowMode() !== 1;
    const cacheKey = `${getGraphWindowMode()}_${windowSize}_${dataLen}`;
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
            const pxCx = px(graphLeft + dayIdx * stripeWidth - 3 - 2); // Move week line dots 2px to the left
            lineDots.forEach((d, i) => {
              const yVal = drawGraph._verticalDotYPositions?.[i] ?? (graphTop + i * dotSpacing - globals.VERTICAL_GRAPH_DOT_OFFSET);
              d.setProperty?.(prop.MORE, { x: pxCx, y: px(yVal) });
            });
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
    // Precreate dot & interp pools when in week mode to avoid allocations during nav
    if (getGraphWindowMode() === 0 && !drawGraph._weekPoolsPrecreated) {
      // Ensure dotPool has capacity for the week window
      for (let i = drawGraph.dotPool.length; i < windowSize; i++) drawGraph.dotPool.push(createDot(pxDotSize, 100));
      // Precreate interpPool: up to 3 interpolation dots per gap
      if (globals.SHOW_INTERPOLATION_DOTS && !drawGraph.interpPool) drawGraph.interpPool = [];
      if (globals.SHOW_INTERPOLATION_DOTS && drawGraph.interpPool) {
        const maxInterp = Math.max(0, (windowSize - 1) * 3);
        for (let i = drawGraph.interpPool.length; i < maxInterp; i++) {
          const d = createWidget(widget.TEXT, { x: 0, y: PX.neg100, w: PX.x12, h: PX.x12, color: 0x000000, text_size: PX.x10, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '•' });
          d.setProperty?.(prop.MORE, { z: 10 });
          drawGraph.interpPool.push(d);
        }
      }
      drawGraph._weekPoolsPrecreated = true;
    }
    // Count dots without allocating an intermediate array
    let dotsNeeded = 0;
    for (let i = 0; i < moodData.length; i++) if (typeof moodData[i].mood === 'number') dotsNeeded++;
    // Only create new dots if needed, never recreate
    while (drawGraph.dotPool.length < dotsNeeded && drawGraph.dotPool.length < windowSize) {
      drawGraph.dotPool.push(createDot(pxDotSize, 100));
    }
    // Interp pool: create only when needed; for month mode wait until month pools initialized
    if (globals.SHOW_INTERPOLATION_DOTS && !drawGraph.interpPool && (getGraphWindowMode() !== 1 || drawGraph._monthPoolsInitialized)) drawGraph.interpPool = [];
    let dotPoolIdx = 0;
    let interpIdx = 0;
    const shouldHideDots = state.getIsNavigating() && ((getGraphWindowMode() === 0 && globals.HIDE_DOTS_DURING_NAV_WEEK) || (getGraphWindowMode() === 1 && globals.HIDE_DOTS_DURING_NAV_MONTH));

    // Collect targets for potential staggered reveal using parallel arrays
    // to avoid allocating a small object per target.
    const dotTargetsDots = [];
    const dotTargetsX = [];
    const dotTargetsY = [];
    const dotTargetsColor = [];
    const interpTargetsDots = [];
    const interpTargetsX = [];
    const interpTargetsY = [];
    const interpTargetsColor = [];

    for (let dayIdx = 0; dayIdx < windowSize; dayIdx++) {
      const mood = moodData[dayIdx].mood;
      if (typeof mood === 'number' && globals.moodValueMap[mood]) {
        const dot = drawGraph.dotPool[dotPoolIdx++], moodObj = globals.moodValueMap[mood], cy = cyMap[mood], cx = graphLeft + dayIdx * stripeWidth + halfStripe;
        
        // Only update if changed (avoid JSON.stringify for perf)
        const prev = dot._prevProps || {};
        const newX = px(cx - 8), newY = px(cy - 8), newColor = moodObj.color;
        let targetProps;
        if (shouldHideDots) {
          targetProps = drawGraph._getPY(PX.neg100);
        } else {
          // Include dot in targets even if unchanged so it can be hidden
          // and revealed in the stagger sequence. This ensures left-to-right
          // timing remains consistent for cached dots.
          targetProps = { x: newX, y: newY, color: newColor };
        }
        if (targetProps) { dotTargetsDots.push(dot); dotTargetsX.push(targetProps.x); dotTargetsY.push(targetProps.y); dotTargetsColor.push(targetProps.color); }

        // Interpolation dots
        if (globals.SHOW_INTERPOLATION_DOTS && state.getInterpolationEnabled() && !shouldHideDots && dayIdx < windowSize - 1) {
          const nextMood = moodData[dayIdx + 1].mood;
          if (nextMood && globals.moodValueMap[nextMood]) {
            const nextObj = globals.moodValueMap[nextMood], nextCy = cyMap[nextMood], nextCx = graphLeft + (dayIdx + 1) * stripeWidth + halfStripe, deltaX = nextCx - cx, deltaY = nextCy - cy;
            let numDots = 3;
            if (globals.ADAPTIVE_INTERPOLATION_DOTS) {
              const sd = deltaX * deltaX + deltaY * deltaY;
              numDots = sd > 3600 ? 3 : sd > 1225 ? 2 : sd > 100 ? 1 : 0;
            }
            for (let i = 1; i <= numDots; i++, interpIdx++) {
              const t = globals.ADAPTIVE_INTERPOLATION_DOTS ? i / (numDots + 1) : i * 0.25;
              if (interpIdx >= drawGraph.interpPool.length) {
                const d = createWidget(widget.TEXT, { x: 0, y: PX.neg100, w: PX.x12, h: PX.x12, color: 0x000000, text_size: PX.x10, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '•' });
                d.setProperty?.(prop.MORE, { z: 10 });
                drawGraph.interpPool.push(d);
              }
              const interp = drawGraph.interpPool[interpIdx];
              const interpX = px(cx + deltaX * t - 6), interpY = px(cy + deltaY * t - 6), interpColor = ui.lerpColor(moodObj.color, nextObj.color, t);
              const prevInterp = interp._prevProps || {};
              // Always include interp targets so cached interpolation dots
              // are also revealed in-order by the stagger animation.
              interpTargetsDots.push(interp);
              interpTargetsX.push(interpX);
              interpTargetsY.push(interpY);
              interpTargetsColor.push(interpColor);
            }
          }
        }
      }
    }

    // Hide unused dots
    for (let i = dotPoolIdx; i < drawGraph.dotPool.length; i++) {
      const dot = drawGraph.dotPool[i];
      const prev = dot._prevProps || {};
        if (prev.y !== PX.neg100) {
        dot.setProperty(prop.MORE, drawGraph._getPY(PX.neg100));
        if (!dot._prevProps) dot._prevProps = {};
        dot._prevProps.y = PX.neg100;
      }
    }
    
    // Hide unused interpolation dots
    for (let i = interpIdx; i < drawGraph.interpPool.length; i++) {
      const interp = drawGraph.interpPool[i];
      const prev = interp._prevProps || {};
      if (prev.y !== PX.neg100) {
        interp.setProperty(prop.MORE, drawGraph._getPY(PX.neg100));
        if (!interp._prevProps) interp._prevProps = {};
        interp._prevProps.y = PX.neg100;
      }
    }
    drawGraph._prevInterpIdx = interpIdx;

    // (runReveal removed — dot/interp reveals handled inline using parallel arrays)

    // Reveal mood dots and interpolation dots in left-to-right order.
    // If either stagger flag is enabled, run a combined stagger so order is consistent
    const anyStagger = !!globals.ENABLE_STAGGER_DOT_REVEAL && (stagger === true);
    // Allow callers to force an immediate reveal for the next draw
    const instant = !!drawGraph._instantReveal;
    if (instant) { try { drawGraph._instantReveal = false; } catch (e) {} }
    // We can avoid allocating the merged `combined` array when no staggering
    // is needed: iterate two source arrays in lock-step and apply directly.
    if (!anyStagger || instant || (drawGraph._noStaggerUntil && Date.now() < drawGraph._noStaggerUntil)) {
      let di = 0, ii = 0;
      while (di < dotTargetsDots.length || ii < interpTargetsDots.length) {
        const d = dotTargetsDots[di];
        const it = interpTargetsDots[ii];
        const dx = (di < dotTargetsX.length && typeof dotTargetsX[di] === 'number') ? dotTargetsX[di] : Number.POSITIVE_INFINITY;
        const ix = (ii < interpTargetsX.length && typeof interpTargetsX[ii] === 'number') ? interpTargetsX[ii] : Number.POSITIVE_INFINITY;
        let dot, pxv, pyv, pcol;
        if (ix <= dx) { dot = it; pxv = interpTargetsX[ii]; pyv = interpTargetsY[ii]; pcol = interpTargetsColor[ii]; ii++; } else { dot = d; pxv = dotTargetsX[di]; pyv = dotTargetsY[di]; pcol = dotTargetsColor[di]; di++; }
        if (!dot) continue;
        const prev = dot._prevProps || {};
        if (prev.x !== pxv || prev.y !== pyv || prev.color !== pcol) {
          dot.setProperty(prop.MORE, drawGraph._getPXYC(pxv, pyv, pcol));
          if (!dot._prevProps) dot._prevProps = {};
          const p = dot._prevProps;
          p.x = pxv; p.y = pyv; p.color = pcol;
        }
      }
    } else {
      // When staggering, build the merged list once (linear merge) then
      // stagger-apply. This keeps order but avoids an expensive sort.
      // Build a compact merged index list: non-negative = dot index, negative = ~interpIndex
      const combined = [];
      let di = 0, ii = 0;
      while (di < dotTargetsDots.length || ii < interpTargetsDots.length) {
        const dx = (di < dotTargetsX.length && typeof dotTargetsX[di] === 'number') ? dotTargetsX[di] : Number.POSITIVE_INFINITY;
        const ix = (ii < interpTargetsX.length && typeof interpTargetsX[ii] === 'number') ? interpTargetsX[ii] : Number.POSITIVE_INFINITY;
        if (ix <= dx) { combined.push(~ii); ii++; } else { combined.push(di); di++; }
      }
      // Compute interval from pixels/ms so stagger speed is independent of FPS.
      // Use the PX-scaled graph width for consistent pixel units.
      const refMs = globals.STAGGER_DOT_REVEAL_MS || 33;
      const graphWidthPx = PX.x272 || px(graphWidth);
      // Use an O(1) estimate for average delta X to avoid iterating combined again
      const avgDeltaX = graphWidthPx / Math.max(1, windowSize - 1);
      const referenceDeltaX = graphWidthPx / Math.max(1, (Math.min(windowSize, 7) - 1) || 6);
      const pixelsPerMs = referenceDeltaX / refMs;
      let baseMs = Math.max(1, Math.round((avgDeltaX || referenceDeltaX) / pixelsPerMs));
      baseMs = Math.min(Math.max(baseMs, 1), 500);
      // ensure starting hidden
      for (let ci = 0; ci < combined.length; ci++) {
        const v = combined[ci];
        let dot;
        if (v >= 0) dot = dotTargetsDots[v]; else dot = interpTargetsDots[~v];
        const p = dot._prevProps || {};
        if (p.y !== PX.neg100) {
          dot.setProperty(prop.MORE, drawGraph._getPY(PX.neg100));
          if (!dot._prevProps) dot._prevProps = {};
          dot._prevProps.y = PX.neg100;
        }
      }
      try { drawGraph._isStaggering = true; } catch (e) {}
      try { drawGraph._noStaggerUntil = Date.now() + combined.length * baseMs + 80; } catch (e) {}
      const startAt = Date.now();
      let ciIdx = 0;
      const tickCombined = () => {
        const nowTick = Date.now();
        while (ciIdx < combined.length && (startAt + ciIdx * baseMs) <= nowTick) {
          const v = combined[ciIdx++];
          let dot, xval, yval, cval;
          if (v >= 0) { dot = dotTargetsDots[v]; xval = dotTargetsX[v]; yval = dotTargetsY[v]; cval = dotTargetsColor[v]; } else { const iiIdx = ~v; dot = interpTargetsDots[iiIdx]; xval = interpTargetsX[iiIdx]; yval = interpTargetsY[iiIdx]; cval = interpTargetsColor[iiIdx]; }
          dot.setProperty(prop.MORE, drawGraph._getPXYC(xval, yval, cval));
          if (!dot._prevProps) dot._prevProps = {};
          const p = dot._prevProps;
          p.x = xval; p.y = yval; p.color = cval;
        }
        if (ciIdx >= combined.length) { drawGraph._staggerTimer = null; try { drawGraph._isStaggering = false; } catch (e) {} ; return; }
        if (typeof requestAnimationFrame !== 'undefined') {
          const id = requestAnimationFrame(tickCombined);
          drawGraph._staggerTimer = { type: 'raf', id };
        } else {
          const id = setTimeout(tickCombined, Math.min(50, baseMs));
          drawGraph._staggerTimer = id;
        }
      };
      // start the tick loop
      if (typeof requestAnimationFrame !== 'undefined') {
        const id = requestAnimationFrame(tickCombined);
        drawGraph._staggerTimer = { type: 'raf', id };
      } else {
        const id = setTimeout(tickCombined, Math.min(50, baseMs));
        drawGraph._staggerTimer = id;
      }
    }
  }


  // CORRECT BOTTOM LABELS
  let labelIndices;
  if (getGraphWindowMode() === 1) {
    labelIndices = [0, windowSize - 1];
  } else {
    labelIndices = [];
    for (let i = 0; i < dataLen; i += 1) labelIndices.push(i);
  }
  if (!drawGraph.xAxisLabelWidgets) drawGraph.xAxisLabelWidgets = [];
  // Precreate X-axis label widgets for week mode to avoid creation spikes while navigating
  if (getGraphWindowMode() === 0 && !drawGraph._xLabelsPrecreated) {
    for (let i = 0; i < 31; i++) {
      if (!drawGraph.xAxisLabelWidgets[i]) drawGraph.xAxisLabelWidgets[i] = createWidget(widget.TEXT, { x: PX.x0, y: PX.neg100, w: PX.x30, h: PX.x20, color: 0x888888, text_size: PX.x14, align_h: align.CENTER_H, text: '' });
    }
    drawGraph._xLabelsPrecreated = true;
  }
  if (!drawGraph.todayArrowBg) drawGraph.todayArrowBg = createWidget(widget.TEXT, { x: PX.x0, y: PX.x0, w: PX.x40, h: PX.x40, color: globals.TODAY_ARROW_COLOR || 0xffffff, text_size: PX.x32, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '▲', text_style: 0 });
  const xAxisY = graphTop + graphHeight + 14, labelCount = labelIndices.length, prevLabelCount = drawGraph._prevLabelCount || 0;
  const labelsChanged = labelCount !== prevLabelCount || getGraphWindowMode() !== drawGraph._prevGraphMode || dateOffsetChanged;
  // Only update todayArrowBg if changed
  if (globals.SHOW_TODAY_ARROW && todayIndex >= 0) {
    const newX = px(graphLeft + todayIndex * stripeWidth + halfStripe - 20), newY = px(xAxisY - 12);
    const prev = drawGraph.todayArrowBg._prevProps || {};
    if (prev.x !== newX || prev.y !== newY) {
      drawGraph.todayArrowBg.setProperty(prop.MORE, drawGraph._getPXYC(newX, newY, drawGraph.todayArrowBg._prevProps?.color || (globals.TODAY_ARROW_COLOR || 0xffffff)));
      if (!drawGraph.todayArrowBg._prevProps) drawGraph.todayArrowBg._prevProps = {};
      drawGraph.todayArrowBg._prevProps.x = newX; drawGraph.todayArrowBg._prevProps.y = newY;
    }
  } else {
    const prev = drawGraph.todayArrowBg._prevProps || {};
    if (prev.y !== px(-100)) {
      drawGraph.todayArrowBg.setProperty(prop.MORE, drawGraph._getPY(px(-100)));
      if (!drawGraph.todayArrowBg._prevProps) drawGraph.todayArrowBg._prevProps = {};
      drawGraph.todayArrowBg._prevProps.y = px(-100);
    }
  }
  if (labelsChanged || !drawGraph._labelsInitialized) {
    const pxXAxisY = px(xAxisY);
    // Defer creating a large number of x-axis label widgets when entering month mode
    const deferLabels = getGraphWindowMode() === 1 && !drawGraph._monthPoolsInitialized;
    const centerIndex = Math.floor(dataLen / 2);
    for (let i = 0; i < 31; i++) {
      if (i < labelCount) {
        if (!drawGraph.xAxisLabelWidgets[i]) {
          if (deferLabels) {
            // leave uncreated for now; scheduled month pool init will re-render and create them
          } else {
            drawGraph.xAxisLabelWidgets[i] = createWidget(widget.TEXT, { x: PX.x0, y: pxXAxisY, w: PX.x30, h: PX.x20, color: 0x888888, text_size: PX.x14, align_h: align.CENTER_H, text: '' });
          }
        }
        const idx = labelIndices[i];
        let dayNum, isToday;
        if (getGraphWindowMode() === 1) {
          // Month mode: force dayNum
          dayNum = idx === 0 ? 1 : windowSize;
          isToday = moodData.find(md => md.day === dayNum)?.isToday || false;
        } else {
          ({ day: dayNum, isToday } = moodData[idx]);
        }
        const cx = graphLeft + idx * stripeWidth + halfStripe;
        const newX = px(cx - 15);
        const newText = String(dayNum);
        const isCenter = (idx === centerIndex && getGraphWindowMode() === 0);
        let newColor, newSize, newY, newH;
        if (isCenter && isToday) {
          // center and today -> big white
          newColor = 0xffffff;
          newSize = PX.x20;
          newY = px(xAxisY - 6);
          newH = PX.x24;
        } else if (isCenter) {
          // center (not today) -> arrow orange
          newColor = 0xff6600;
          newSize = PX.x20;
          newY = px(xAxisY - 6);
          newH = PX.x24;
        } else if (isToday) {
          // today (not center) -> medium white
          newColor = 0xffffff;
          newSize = PX.x20;
          newY = px(xAxisY - 6);
          newH = PX.x24;
        } else {
          // normal labels
          newColor = 0x888888;
          newSize = PX.x14;
          newY = pxXAxisY;
          newH = PX.x20;
        }
        const label = drawGraph.xAxisLabelWidgets[i];
        if (label) {
          const prev = label._prevProps || {};
          if (prev.x !== newX || prev.y !== newY || prev.text !== newText || prev.color !== newColor || prev.text_size !== newSize || prev.h !== newH) {
            label.setProperty(prop.MORE, drawGraph._getLabelProp(newX, newY, newText, newColor, newSize, newH));
            if (!label._prevProps) label._prevProps = {};
            const p = label._prevProps;
            p.x = newX; p.y = newY; p.text = newText; p.color = newColor; p.text_size = newSize; p.h = newH;
          }
        }
      } else if (i < prevLabelCount && drawGraph.xAxisLabelWidgets[i]) {
        const label = drawGraph.xAxisLabelWidgets[i];
        const prev = label._prevProps || {};
        if (prev.y !== PX.neg100 || prev.text !== '') {
            label.setProperty(prop.MORE, drawGraph._getTextProp(''));
            if (!label._prevProps) label._prevProps = {};
            label._prevProps.y = PX.neg100; label._prevProps.text = '';
          }
      }
    }
    drawGraph._prevLabelCount = labelCount; drawGraph._labelsInitialized = true; drawGraph._prevGraphMode = getGraphWindowMode();
  }

  if (!drawGraph.statsWidgets) {
    const spx = drawGraph._statsPx || (drawGraph._statsPx = { leftCol: px(75), rightCol: px(155), rightLabelCol: px(220), rightValueCol: PX.x300, row1: PX.x120, row2: PX.x150, labelWidth: PX.x96, valueWidth: PX.x50, height: PX.x30 });
    const createText = (x, y, color, size) => createWidget(widget.TEXT, {  text: '0', x, y, w: spx.valueWidth, h: spx.height, color, text_size: size, align_h: align.RIGHT, align_v: align.CENTER_V });
    drawGraph.statsWidgets = {
      daysLoggedLabel: createWidget(widget.TEXT, {text: 'Days logged:', x: spx.leftCol, y: spx.row1, w: spx.labelWidth, h: spx.height, color: 0xaaaaaa, text_size: PX.x16, align_h: align.RIGHT, align_v: align.CENTER_V }),
      daysLoggedValue: createText(spx.rightCol, spx.row1, 0xffffff, PX.x20),
      swingLabel: createWidget(widget.TEXT, { text: 'Swing freq:', x: spx.rightLabelCol, y: spx.row2, w: spx.labelWidth, h: spx.height, color: 0xaaaaaa, text_size: PX.x16, align_h: align.RIGHT, align_v: align.CENTER_V }),
      swingValue: createText(spx.rightValueCol, spx.row2, 0xffffff, PX.x20),
      avgMoodLabel: createWidget(widget.TEXT, { text: 'Avg mood:', x: spx.leftCol, y: spx.row2, w: spx.labelWidth, h: spx.height, color: 0xaaaaaa, text_size: PX.x16, align_h: align.RIGHT, align_v: align.CENTER_V }),
      avgMoodValue: createText(spx.rightCol, spx.row2, 0xffffff, PX.x20),
      rangeLabel: createWidget(widget.TEXT, { text: 'Mood range:', x: spx.rightLabelCol, y: spx.row2, w: spx.labelWidth, h: spx.height, color: 0xaaaaaa, text_size: PX.x16, align_h: align.RIGHT, align_v: align.CENTER_V }),
      rangeValue: createText(spx.rightValueCol, spx.row2, 0xffffff, PX.x20)
    };
    drawGraph.statsWidgets.swingValue.setProperty(prop.MORE, drawGraph._getTextProp('-'));
    drawGraph.statsWidgets.avgMoodValue.setProperty(prop.MORE, drawGraph._getTextProp('-'));
    drawGraph.statsWidgets.rangeValue.setProperty(prop.MORE, drawGraph._getTextProp(''));
  }
  const statsY = getGraphWindowMode() === 1 ? [PX.x120, PX.x120, PX.x120, PX.x120, PX.x150, PX.x150, PX.x150, PX.x150] : Array(8).fill(PX.neg200);
  if (getGraphWindowMode() === 1) {
    // Compute stats in a single pass to avoid intermediate arrays
    let daysLogged = 0, sumMood = 0, minMood = Infinity, maxMood = -Infinity;
    for (let i = 0; i < moodData.length; i++) {
      const m = moodData[i].mood;
      if (typeof m === 'number') {
        daysLogged++;
        sumMood += m;
        if (m < minMood) minMood = m;
        if (m > maxMood) maxMood = m;
      }
    }
    const avgNum = daysLogged ? sumMood / daysLogged : 0;
    const [avgMood, avgMoodColor] = daysLogged ? [avgNum.toFixed(1), globals.moodValueMap[Math.round(avgNum)]?.color || 0xffffff] : ['-', 0xffffff];
    let swingSum = 0, consecutivePairs = 0;
    for (let i = 1; i < moodData.length; i++) if (moodData[i].mood && moodData[i-1].mood && moodData[i].day - moodData[i-1].day === 1) { swingSum += Math.abs(moodData[i].mood - moodData[i-1].mood); consecutivePairs++; }
    const swingPercentage = consecutivePairs > 0 ? ((swingSum / (consecutivePairs * 4)) * 100).toFixed(0) + '' : '0';
    const rangeText = daysLogged ? `${minMood}-${maxMood}` : '-';
    drawGraph.statsWidgets.daysLoggedValue.setProperty(prop.MORE, drawGraph._getTextProp(String(daysLogged)));
    drawGraph.statsWidgets.avgMoodValue.setProperty(prop.MORE, drawGraph._getTextProp(avgMood, avgMoodColor));
    drawGraph.statsWidgets.swingValue.setProperty(prop.MORE, drawGraph._getTextProp(swingPercentage));
    drawGraph.statsWidgets.rangeValue.setProperty(prop.MORE, drawGraph._getTextProp(rangeText));
  }
  Object.values(drawGraph.statsWidgets).forEach((w, i) => w.setProperty(prop.MORE, drawGraph._getPY(statsY[i])));
  drawGraph._renderCount = (drawGraph._renderCount || 0) + 1;
  if (drawGraph._perfEnabled && typeof console !== 'undefined' && console.timeEnd) console.timeEnd('drawGraph');
  drawGraph._isRendering = false;
}

// Public helper: request the next draw apply instantly (no stagger)
export function forceInstantRevealOnce() {
  try {
    drawGraph._instantReveal = true;
    // suppress any stagger for a short window so subsequent draws don't immediately re-stagger
    drawGraph._noStaggerUntil = Date.now() + 400;
  } catch (e) {}
}

// Public helper to force rebuilding center and week-line dot widgets
export function rebuildVerticalDots() {
  try {
    if (drawGraph.centerLineDots) {
      drawGraph.centerLineDots.forEach(d => d && typeof d.remove === 'function' && d.remove());
      drawGraph.centerLineDots = null;
    }
    if (drawGraph.weekLineDots) {
      drawGraph.weekLineDots.forEach(line => line.forEach(d => d && typeof d.remove === 'function' && d.remove()));
      drawGraph.weekLineDots = null;
    }
  } catch (e) {}
  try { drawGraph(false); } catch (e) {}
}


export const refreshMoodDataAndUI = () => {
    if (storageWriteTimeout) {
        clearTimeout(storageWriteTimeout);
        storageWriteTimeout = null;
    }
    state.setInterpolationEnabled(false);
    // _moodDataByDate = {};
    // storage.reloadMoodDataFromStorage();
    state.setMoodHistoryCache(null);
    state.setMoodHistoryCacheKey(null);
    state.setMoodHistoryCache(null);
    state.setPrevDisplayedMood(null);
    if (_loadingText) _loadingText.setProperty?.(prop.MORE, { y: px(226) });
    if (drawGraph) drawGraph(true);
    //if (drawGraph && drawGraph.debugDateText && drawGraph.statusText && imgWidgets) {
        //updateUIAfterDateChange(drawGraph.debugDateText, drawGraph.statusText, imgWidgets);
    //}
    setTimeout(() => {
        try {
        state.setInterpolationEnabled(true);
        drawGraph && graph.drawGraph();
        _loadingText?.setProperty?.(prop.MORE, { y: px(-100) });
        } catch (e) {}
    }, 100);
}; 


export const updateUIAfterDateChange = (debugDateText, statusText, imgWidgets,) => {
    const buildDateStr = (d, mode) => mode === 1 ? `${globals.monthNamesAbv[d.getMonth()]} ${d.getFullYear()}` : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    const updateMoodUI = () => {
        const PX = ui.getPX();
        
        const displayMood = getGraphWindowMode() ? calc.getMonthAverageMood(calc.getMonthAverageMood(state.getDebugDate(), state.getMoodHistoryByDateAll())) : data.getTodayMood();
        if (displayMood === _prevDisplayedMood) return;
        const moodData = displayMood ? globals.moodValueMap[displayMood] : null, isToday = state.getDebugDayOffset() === 0;
        let prefix = '';
        if (getGraphWindowMode() && displayMood) { 
          const view = state.getDebugDate(), now = new Date(); if (view.getMonth() === now.getMonth() && view.getFullYear() === now.getFullYear()) prefix = 'This month: '; 
        } else if (isToday && displayMood) {
          prefix = 'Today: ';
        }
        statusText.setProperty?.(prop.MORE, displayMood ? { 
          text: `${prefix}${moodData?.name || ''}`, color: moodData?.color || 0x888888 
        } : { 
          text: isToday ? 'Tap your mood!' : 'No record', color: 0xffffff, text_size: PX.x24 
        });
        
        const todayMood = data.getTodayMood();
        // Update only the widgets that changed
        if (state.getPrevDisplayedMood() !== todayMood) {

        // MOOD WIDGETS
          if(!imgWidgets){return; }
          if (state.getPrevDisplayedMood()) {
              imgWidgets[5 - state.getPrevDisplayedMood()].setProperty?.(prop.MORE, { alpha: 180 });
          } else if (!todayMood) {
              // No mood at all: keep everything at 180
              imgWidgets.forEach(w => w.setProperty?.(prop.MORE, { alpha: 180 }));
          }
          // If we have a mood, highlight it
          if (todayMood) imgWidgets[5 - todayMood].setProperty?.(prop.MORE, { alpha: 255 });
    }
    state.setPrevDisplayedMood(todayMood);
  };
    if (globals.ULTRA_LIGHT_NAV) {
    if (!globals.THROTTLE_DATE_UPDATES || !_dateUpdateThrottle) { const str = buildDateStr(state.getDebugDate(), getGraphWindowMode()); debugDateText.setProperty?.(prop.MORE, { text: str }); _prevDateStr = str; if (globals.THROTTLE_DATE_UPDATES) _dateUpdateThrottle = setTimeout(() => _dateUpdateThrottle = null, 16); }
    state.setIsNavigating(true);
    if (globals.SHOW_LOADING_INDICATOR && getGraphWindowMode() === 1 && _loadingText) _loadingText.setProperty?.(prop.MORE, { y: px(226) });
    if ((getGraphWindowMode() === 0 && globals.HIDE_DOTS_DURING_NAV_WEEK) || (getGraphWindowMode() === 1 && globals.HIDE_DOTS_DURING_NAV_MONTH)) { state.setCachedDebugDate(null); state.setMoodHistoryCache(null); drawGraph(); }
    // Provide immediate visual feedback for explicit nav (avoid perceived delay)
    try { drawGraph(); updateMoodUI(); } catch (e) {}
    if (_navDebounceTimer) clearTimeout(_navDebounceTimer);
    state.setNavDebounceTimer( 
      setTimeout(() => { state.setIsNavigating(false); _loadingText?.setProperty?.(prop.MORE, { y: px(-100) }); state.setCachedDebugDate(null); drawGraph(); updateMoodUI(); state.setNavDebounceTimer(null); }, globals.FRAME_TIME * globals.DEBOUNCE_MULTIPLIER) 
    );
    return;
  }
  if (globals.INSTANT_NAV) { state.setCachedDebugDate(null); state.setMoodHistoryCache(null); drawGraph(); drawGraph.updateDateDisplay?.(); updateMoodUI(); return; }
  const str = buildDateStr(state.getDebugDate(), getGraphWindowMode());
  if (str !== _prevDateStr) { debugDateText.setProperty?.(prop.MORE, { text: str }); _prevDateStr = str; }
  state.setIsNavigating(true);
  if (_navDebounceTimer) clearTimeout(_navDebounceTimer);
  state.setNavDebounceTimer(
    setTimeout(() => { state.setIsNavigating(false); if (globals.SKIP_UI_UPDATES_DURING_NAV) updateMoodUI(); state.setCachedDebugDate(null); state.setMoodHistoryCache(null); drawGraph(); state.setNavDebounceTimer(null); }, globals.FRAME_TIME * globals.DEBOUNCE_MULTIPLIER)
  );
};