import { createWidget, widget, align, prop, event } from '@zos/ui';
import { px } from '@zos/utils';

import * as globals from '../globals';
import * as calc from '../functions/calc';
import * as state from '../functions/state';
import * as storage from '../functions/storage';
import * as data from '../functions/data';
import * as graph from '../elements/graph';
import * as header from '../elements/header';
import * as legend from '../elements/legend';
import * as smileys from '../elements/smileys';
import * as ui from '../functions/ui';

const raf = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame : (cb) => setTimeout(cb, 16);

Page({
  onInit(params) {
    console.log('[MonthPage] onInit with params:', params);
    state.setMoodHistoryCache(null);
    graph.setGraphWindowMode(0);
    graph.setMaxMoodDots(31);
    // Load only the week shown: compute start/end from debug date
    const view = state.getDebugDate();
    const numDays = 7;
    const startOffset = -Math.floor(numDays / 2);
    const msPerDay = data.getMsPerDay();
    const startDate = new Date(view.getTime() + startOffset * msPerDay);
    const endDate = new Date(view.getTime() + (startOffset + numDays - 1) * msPerDay);
    // Load week data asynchronously so initial UI can paint first
    setTimeout(() => storage.loadMoodData(startDate, endDate), 0);
    data.checkMoodParam(params);
  },
  build() {
    const PX = ui.getPX();
    let _loadingText = null;
    
  // Enable drawGraph internal perf timing for investigation
  try { graph.drawGraph._perfEnabled = true; } catch (e) {}
    
    // STATUS
    const todayMood = data.getTodayMood();
    const statusText = createWidget(widget.TEXT, { x: PX.x0, y: PX.x25, w: PX.x416, h: PX.x35, color: todayMood ? globals.moodValueMap[todayMood]?.color || 0xffffff : 0xffffff, text_size: PX.x24, align_h: align.CENTER_H, align_v: align.CENTER_V });

    // DATE TEXT
    const debugDateText = createWidget(widget.TEXT, { text: data.getDateStr(graph.getGraphWindowMode()), x: PX.x58, y: PX.x58, w: PX.x300, h: PX.x50, color: 0xff6600, text_size: PX.x32, align_h: align.CENTER_H, align_v: align.CENTER_V });
    graph.drawGraph.updateDateDisplay = () => header.updateHeader(debugDateText, statusText, graph.getGraphWindowMode());
    graph.drawGraph.debugDateText = debugDateText;
    debugDateText.addEventListener?.(event.CLICK_DOWN, () => { 
      state.setDebugDayOffset(0); 
      graph.drawGraph(false, true);
      header.updateHeader(debugDateText, statusText, graph.getGraphWindowMode());
    });

    // SMILEYS (moved to functions/smileys.js)
    const imgWidgets = smileys.createSmileys(PX, debugDateText, statusText);
    if (graph.getGraphWindowMode() == 0) {
      ui.updateMoodButtonsVisibility.imgWidgets = imgWidgets;
    }

    // NAV ARROWS
    const navigateDate = dir => {
      // If a nav debounce timer is already pending, ignore additional taps to avoid queueing
      if(globals.DEFER_UPDATE_UNTIL_DEBOUNCE && globals.HIDE_DOTS_DURING_NAV_WEEK || graph.getGraphWindowMode() === 1){
        state.showLoadingImmediate();
      }

      try { if (state.getNavDebounceTimer()) return; } catch (e) {}
      if (graph.getGraphWindowMode() === 0) {
          state.setDebugDayOffset(state.getDebugDayOffset() + dir);
          // Prefetch the new day that enters the 7-day window (center ±3)
          try {
            const viewAfter = state.getDebugDate();
            const msPerDayLocal = data.getMsPerDay();
            const newDay = new Date(viewAfter.getTime() + (dir > 0 ? 3 : -3) * msPerDayLocal);
            newDay.setHours(0,0,0,0);
            setTimeout(() => { try { storage.loadMoodData(newDay, newDay); } catch (e) {} }, 0);
            try { header.updateHeader(debugDateText, statusText, graph.getGraphWindowMode()); } catch (e) {}
            try { state.setIsNavigating(true); } catch (e) {}
            try { if (globals.HIDE_DOTS_DURING_NAV_WEEK) { graph.hideAllDotsImmediate(); } } catch (e) {}
            // Defer graph
            try { if (state.getNavDebounceTimer()) { clearTimeout(state.getNavDebounceTimer()); state.setNavDebounceTimer(null); } } catch (e) {}
            try { state.setNavDebounceTimer(setTimeout(() => { 
              try { console.time && console.time('graphDeferred'); state.setIsNavigating(false); try { state.hideLoadingSoon(0); } catch (e) {} graph.drawGraph(false, true); header.updateHeader(debugDateText, statusText, graph.getGraphWindowMode()); console.time; } catch (e) {} finally { try { state.setNavDebounceTimer(null); } catch (e) {} } }, globals.FRAME_TIME * globals.DEBOUNCE_MULTIPLIER)); 
            } catch (e) {}
          } catch (e) {}
          
      } else {
          const curr = state.getDebugDate();
          let tgtM = curr.getMonth() + dir;
          let tgtY = curr.getFullYear();
          if (tgtM < 0) { tgtM = 11; tgtY--; }
          if (tgtM > 11) { tgtM = 0; tgtY++; }
          const tgtD = Math.min(curr.getDate(), new Date(tgtY, tgtM + 1, 0).getDate());
          const tgt = new Date(tgtY, tgtM, tgtD);
          tgt.setHours(0, 0, 0, 0);
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const offset = Math.round((tgt.getTime() - now.getTime()) / data.getMsPerDay());
          state.setDebugDayOffset(offset);
          // Immediate header update for instant feedback
          try { header.updateHeader(debugDateText, statusText, graph.getGraphWindowMode()); } catch (e) {}
          // Mark navigating so drawGraph can avoid creating heavy widgets during this short nav period
          try { state.setIsNavigating(true); } catch (e) {}
          // Hide any visible dots immediately only when configured for month-mode navigation
          if (globals.HIDE_DOTS_DURING_NAV_MONTH) {
            try { graph.hideAllDotsImmediate(); } catch (e) {}
          }
          // Defer graph redraw entirely until nav debounce completes to avoid blocking UI
          try { if (state.getNavDebounceTimer()) { clearTimeout(state.getNavDebounceTimer()); state.setNavDebounceTimer(null); } } catch (e) {}
          try { state.setNavDebounceTimer(setTimeout(() => { 
            try { console.time && console.time('graphDeferred'); state.setIsNavigating(false); try { state.hideLoadingSoon(0); } catch (e) {} graph.drawGraph(false, true); header.updateHeader(debugDateText, statusText, graph.getGraphWindowMode()); console.time && console.timeEnd('graphDeferred'); } catch (e) {} finally { try { state.setNavDebounceTimer(null); } catch (e) {} } }, globals.FRAME_TIME * globals.DEBOUNCE_MULTIPLIER)); 
          } catch (e) {}
      }
    };
      
    graph.onGraphWindowModeChange(() => {
      //graph._stagger=true;
      graph.drawGraph(false, true);
      console.log('pre draw callback');
    });
    
    const leftArrow = createWidget(widget.TEXT, { text: '«', x: PX.x50, y: PX.x36, w: PX.x80, h: PX.x70, color: 0xff6600, text_size: PX.x78, align_h: align.CENTER_H, align_v: align.CENTER_V  });
          leftArrow.addEventListener?.(event.CLICK_DOWN, () => navigateDate(-1));
    const rightArrow = createWidget(widget.TEXT, { text: '»', x: PX.x296, y: PX.x36, w: PX.x80, h: PX.x70, color: 0xff6600, text_size: PX.x78, align_h: align.CENTER_H, align_v: align.CENTER_V });
          rightArrow.addEventListener?.(event.CLICK_DOWN, () => navigateDate(1));

    
    state.setInterpolationEnabled(true);
    header.updateHeader(debugDateText, statusText, graph.getGraphWindowMode());
    // place legend just below the smileys immediately so it doesn't wait for RAF
    try {
      const legendTop = 330;
      legend.ensureLegend(graph.drawGraph, PX, legendTop);
      legend.refreshLegendCounts(graph.drawGraph);
    } catch (e) {}

    (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : setTimeout)(() => {
      graph.drawGraph(false, true); 
      setTimeout(() => { state.setInterpolationEnabled(true); }, 100);
    });

    // LOADING INDICATOR 
    _loadingText = createWidget(widget.TEXT, { text: globals.LOADING_TEXT, x: px(182), y: px(226), w: px(60), h: px(30), color: 0x888888, text_size: px(24), align_h: align.CENTER_H, align_v: align.CENTER_V });
        
    (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : setTimeout)(() => {
      try {
        _loadingText = createWidget(widget.TEXT, { text: globals.LOADING_TEXT, x: px(182), y: px(226), w: px(60), h: px(30), color: 0x888888, text_size: px(24), align_h: align.CENTER_H, align_v: align.CENTER_V });
        try { state.registerLoadingWidget(_loadingText); } catch (e) {}
        smileys.updateSmileysAlpha(imgWidgets);
      } catch (e) {}
    });

  },
  onShow() {
  },
  onHide() {
  },
  onDestroy() {}
});
 