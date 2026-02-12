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

export function drawGraph(skipDots = false) {
  if (drawGraph._isRendering) return;
  drawGraph._isRendering = true;

  const PX = ui.getPX();
  
  let { graphGroup, legendGroup, backgroundWidget, gridGroup, tapArea, xAxisGroup } = drawGraph;
  const graphTop = 210, graphHeight = 80, graphLeft = 76, graphWidth = 272, moodRows = globals.moods.length;
  
  const gpx = drawGraph._graphPx || (drawGraph._graphPx = { top: PX.x210, height: px(graphHeight), left: PX.x76, width: PX.x272, topMinus16: px(graphTop - 16), heightPlus32: px(graphHeight + 32), topPlus14: px(graphTop + graphHeight + 14), topPlus35: px(graphTop + graphHeight + 35), leftMinus10: px(graphLeft - 10), leftMinus26: px(graphLeft - 26), widthPlus20: px(graphWidth + 20) });
  
  const debugDate = state.getDebugDate();
  const year = debugDate.getFullYear(), month = debugDate.getMonth();
  let windowSize = getGraphWindowMode() === 1 ? new Date(year, month + 1, 0).getDate() : 7;

  // Dynamically set MAX_MOOD_DOTS to windowSize to avoid out-of-bounds errors
  setMaxMoodDots(windowSize);

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
        legendGroup._countWidgets[i].setProperty(prop.MORE, { text: String(newCount) });
        drawGraph._prevMoodCounts[countIdx] = newCount;
      }
    }
  }

  // Tap event handler function
  function handleTapEvent(info) {
    if (drawGraph._tapDebounce) return;
    drawGraph._tapDebounce = setTimeout(() => { drawGraph._tapDebounce = null; }, 300);
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
      drawGraph.statusText.setProperty && drawGraph.statusText.setProperty(prop.MORE, displayMood ? { text: `${prefix}${moodData?.name || ''}`, color: moodData?.color || 0x888888 } : { text: isViewingToday ? 'Tap your mood!' : 'No record', color: 0xffffff, text_size: PX.x24 });
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
            dot.addEventListener(event.CLICK_DOWN, handleTapEvent);
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
            const distance = Math.sqrt((nextCx - cx) ** 2 + (nextCy - cy) ** 2);
            numDots = distance > 60 ? 3 : distance > 35 ? 2 : distance > 10 ? 1 : 0;
          }
          for (let i = 1; i <= numDots; i++, interpIdx++) {
            const interp = drawGraph.interpPool[interpIdx];
            if (interp && interp.addEventListener) {
              interp.addEventListener(event.CLICK_DOWN, handleTapEvent);
            }
          }
        }
      }
    }
    if (drawGraph.weekLineDots) {
      drawGraph.weekLineDots.forEach(lineDots => {
        lineDots.forEach(dot => {
          // Only attach if dot is visible (y >= 0)
          if (dot && dot.addEventListener && dot._prevProps && dot._prevProps.y >= 0) {
            dot.addEventListener(event.CLICK_DOWN, handleTapEvent);
          }
        });
      });
    }
    if (drawGraph.centerLineDots) {
      drawGraph.centerLineDots.forEach(dot => {
        if (dot && dot.addEventListener && dot._prevProps && dot._prevProps.y >= 0) {
          dot.addEventListener(event.CLICK_DOWN, handleTapEvent);
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

  if (!skipDots && !drawGraph.centerLineDots && globals.SHOW_CENTER_LINE) {
    drawGraph.centerLineDots = [];
    const centerX = graphLeft + graphWidth / 2 - 1, numDots = 9, dotSpacing = graphHeight / 8;
    for (let i = 0; i < numDots; i++) {
      const centerDot = createWidget(widget.TEXT, { x: px(centerX - 4), y: px(graphTop + i * dotSpacing - 5), w: PX.x10, h: PX.x10, color: 0x666666, text_size: PX.x10, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '•' });
      centerDot.setProperty?.(prop.MORE, { z: 2 });
      drawGraph.centerLineDots.push(centerDot);
    }
  }
  if (!skipDots && drawGraph.centerLineDots?.length) {
    const shouldShow = globals.SHOW_CENTER_LINE && getGraphWindowMode() === 0 && !(globals.HIDE_DOTS_DURING_NAV_WEEK && state.getIsNavigating()), dotSpacing = graphHeight / 8;
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
    let dotsNeeded = moodData.filter(d => typeof d.mood === 'number').length;
    // Only create new dots if needed, never recreate
    while (drawGraph.dotPool.length < dotsNeeded && drawGraph.dotPool.length < windowSize) {
      drawGraph.dotPool.push(createDot(pxDotSize, 100));
    }
    if (globals.SHOW_INTERPOLATION_DOTS && !drawGraph.interpPool) drawGraph.interpPool = [];
    let dotPoolIdx = 0;
    let interpIdx = 0;
    const shouldHideDots = state.getIsNavigating() && ((getGraphWindowMode() === 0 && globals.HIDE_DOTS_DURING_NAV_WEEK) || (getGraphWindowMode() === 1 && globals.HIDE_DOTS_DURING_NAV_MONTH));
    for (let dayIdx = 0; dayIdx < windowSize; dayIdx++) {
      const mood = moodData[dayIdx].mood;
      if (typeof mood === 'number' && globals.moodValueMap[mood]) {
        const dot = drawGraph.dotPool[dotPoolIdx++], moodObj = globals.moodValueMap[mood], cy = cyMap[mood], cx = graphLeft + dayIdx * stripeWidth + halfStripe;
        
        // Only update if changed (avoid JSON.stringify for perf)
        const prev = dot._prevProps || {};
        const newX = px(cx - 8), newY = px(cy - 8), newColor = moodObj.color;
        if (shouldHideDots) {
          if (prev.y !== PX.neg100) {
            dot.setProperty(prop.MORE, { y: PX.neg100 });
            dot._prevProps = { y: PX.neg100 };
          }
        } else {
          if (prev.x !== newX || prev.y !== newY || prev.color !== newColor) {
            dot.setProperty(prop.MORE, { x: newX, y: newY, color: newColor });
            dot._prevProps = { x: newX, y: newY, color: newColor };
          }
        }

        // Interpolation dots
        if (globals.SHOW_INTERPOLATION_DOTS && state.getInterpolationEnabled() && !shouldHideDots && dayIdx < windowSize - 1) {
          const nextMood = moodData[dayIdx + 1].mood;
          if (nextMood && globals.moodValueMap[nextMood]) {
            const nextObj = globals.moodValueMap[nextMood], nextCy = cyMap[nextMood], nextCx = graphLeft + (dayIdx + 1) * stripeWidth + halfStripe, deltaX = nextCx - cx, deltaY = nextCy - cy;
            let numDots = 3;
            if (globals.ADAPTIVE_INTERPOLATION_DOTS) {
              const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
              numDots = distance > 60 ? 3 : distance > 35 ? 2 : distance > 10 ? 1 : 0;
            }
            for (let i = 1; i <= numDots; i++, interpIdx++) {
              const t = globals.ADAPTIVE_INTERPOLATION_DOTS ? i / (numDots + 1) : i * 0.25;
              if (interpIdx >= drawGraph.interpPool.length) {
                const d = createWidget(widget.TEXT, { x: 0, y: -100, w: PX.x12, h: PX.x12, color: 0x000000, text_size: PX.x10, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '•' });
                d.setProperty?.(prop.MORE, { z: 10 });
                drawGraph.interpPool.push(d);
              }
              const interp = drawGraph.interpPool[interpIdx];
              const interpX = px(cx + deltaX * t - 6), interpY = px(cy + deltaY * t - 6), interpColor = ui.lerpColor(moodObj.color, nextObj.color, t);
              const prevInterp = interp._prevProps || {};
              if (prevInterp.x !== interpX || prevInterp.y !== interpY || prevInterp.color !== interpColor) {
                interp.setProperty(prop.MORE, { x: interpX, y: interpY, color: interpColor });
                interp._prevProps = { x: interpX, y: interpY, color: interpColor };
              }
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
        dot.setProperty(prop.MORE, { y: PX.neg100 });
        dot._prevProps = { y: PX.neg100 };
      }
    }
    
    // Hide unused interpolation dots
    for (let i = interpIdx; i < drawGraph.interpPool.length; i++) {
      const interp = drawGraph.interpPool[i];
      const prev = interp._prevProps || {};
      if (prev.y !== px(-100)) {
        interp.setProperty(prop.MORE, { y: px(-100) });
        interp._prevProps = { y: px(-100) };
      }
    }
    drawGraph._prevInterpIdx = interpIdx;
  }

  // CORRECT BOTTOM LABELS
  let labelIndices;
  if (getGraphWindowMode() === 1) {
    labelIndices = [0, windowSize - 1];
  } else {
    labelIndices = Array.from({ length: Math.ceil(dataLen / 1) }, (_, i) => i * 1).filter(i => i < dataLen);
  }
  if (!drawGraph.xAxisLabelWidgets) drawGraph.xAxisLabelWidgets = [];
  if (!drawGraph.todayArrowBg) drawGraph.todayArrowBg = createWidget(widget.TEXT, { x: PX.x0, y: PX.x0, w: PX.x40, h: PX.x40, color: 0xffffff, text_size: PX.x32, align_h: align.CENTER_H, align_v: align.CENTER_V, text: '▲', text_style: 0 });
  const xAxisY = graphTop + graphHeight + 14, labelCount = labelIndices.length, prevLabelCount = drawGraph._prevLabelCount || 0;
  const labelsChanged = labelCount !== prevLabelCount || getGraphWindowMode() !== drawGraph._prevGraphMode || dateOffsetChanged;
  // Only update todayArrowBg if changed
  if (globals.SHOW_TODAY_ARROW && todayIndex >= 0) {
    const newX = px(graphLeft + todayIndex * stripeWidth + halfStripe - 20), newY = px(xAxisY - 12);
    const prev = drawGraph.todayArrowBg._prevProps || {};
    if (prev.x !== newX || prev.y !== newY) {
      drawGraph.todayArrowBg.setProperty(prop.MORE, { x: newX, y: newY });
      drawGraph.todayArrowBg._prevProps = { x: newX, y: newY };
    }
  } else {
    const prev = drawGraph.todayArrowBg._prevProps || {};
    if (prev.y !== px(-100)) {
      drawGraph.todayArrowBg.setProperty(prop.MORE, { y: px(-100) });
      drawGraph.todayArrowBg._prevProps = { y: px(-100) };
    }
  }
  if (labelsChanged || !drawGraph._labelsInitialized) {
    const pxXAxisY = px(xAxisY);
    for (let i = 0; i < 31; i++) {
      if (i < labelCount) {
        if (!drawGraph.xAxisLabelWidgets[i]) drawGraph.xAxisLabelWidgets[i] = createWidget(widget.TEXT, { x: PX.x0, y: pxXAxisY, w: PX.x30, h: PX.x20, color: 0x888888, text_size: PX.x14, align_h: align.CENTER_H, text: '' });
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
        const newX = px(cx - 15), newY = isToday ? px(xAxisY - 3) : pxXAxisY, newText = String(dayNum), newColor = isToday ? (globals.SHOW_TODAY_ARROW ? 0x000000 : 0xffffff) : 0x888888, newSize = isToday ? PX.x16 : PX.x14;
        const label = drawGraph.xAxisLabelWidgets[i];
        const prev = label._prevProps || {};
        if (prev.x !== newX || prev.y !== newY || prev.text !== newText || prev.color !== newColor || prev.text_size !== newSize) {
          label.setProperty(prop.MORE, { x: newX, y: newY, text: newText, color: newColor, text_size: newSize });
          label._prevProps = { x: newX, y: newY, text: newText, color: newColor, text_size: newSize };
        }
      } else if (i < prevLabelCount && drawGraph.xAxisLabelWidgets[i]) {
        const label = drawGraph.xAxisLabelWidgets[i];
        const prev = label._prevProps || {};
        if (prev.y !== PX.neg100 || prev.text !== '') {
          label.setProperty(prop.MORE, { y: PX.neg100, text: '' });
          label._prevProps = { y: PX.neg100, text: '' };
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
    drawGraph.statsWidgets.swingValue.setProperty(prop.MORE, { text: '-' });
    drawGraph.statsWidgets.avgMoodValue.setProperty(prop.MORE, { text: '-' });
    drawGraph.statsWidgets.rangeValue.setProperty(prop.MORE, { text: '' });
  }
  const statsY = getGraphWindowMode() === 1 ? [PX.x120, PX.x120, PX.x120, PX.x120, PX.x150, PX.x150, PX.x150, PX.x150] : Array(8).fill(PX.neg200);
  if (getGraphWindowMode() === 1) {
    const logged = moodData.filter(d => d.mood), daysLogged = logged.length, avgNum = daysLogged ? logged.reduce((sum, d) => sum + d.mood, 0) / daysLogged : 0;
    const [avgMood, avgMoodColor] = daysLogged ? [avgNum.toFixed(1), globals.moodValueMap[Math.round(avgNum)]?.color || 0xffffff] : ['-', 0xffffff];
    let swingSum = 0, consecutivePairs = 0;
    for (let i = 1; i < moodData.length; i++) if (moodData[i].mood && moodData[i-1].mood && moodData[i].day - moodData[i-1].day === 1) { swingSum += Math.abs(moodData[i].mood - moodData[i-1].mood); consecutivePairs++; }
    const swingPercentage = consecutivePairs > 0 ? ((swingSum / (consecutivePairs * 4)) * 100).toFixed(0) + '' : '0';
    const moods = logged.map(d => d.mood).filter(m => typeof m === 'number');
    const rangeText = moods.length ? `${Math.min(...moods)}-${Math.max(...moods)}` : '-';
    drawGraph.statsWidgets.daysLoggedValue.setProperty(prop.MORE, { text: String(daysLogged) });
    drawGraph.statsWidgets.avgMoodValue.setProperty(prop.MORE, { text: avgMood, color: avgMoodColor });
    drawGraph.statsWidgets.swingValue.setProperty(prop.MORE, { text: swingPercentage });
    drawGraph.statsWidgets.rangeValue.setProperty(prop.MORE, { text: rangeText });
  }
  Object.values(drawGraph.statsWidgets).forEach((w, i) => w.setProperty(prop.MORE, { y: statsY[i] }));
  drawGraph._renderCount = (drawGraph._renderCount || 0) + 1;
  drawGraph._isRendering = false;
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
    if (drawGraph && drawGraph.debugDateText && drawGraph.statusText && imgWidgets) {
        updateUIAfterDateChange(drawGraph.debugDateText, drawGraph.statusText, imgWidgets);
    }
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