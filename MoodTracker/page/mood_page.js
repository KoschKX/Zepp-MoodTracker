import { createWidget, widget, align, prop, event } from '@zos/ui';
import { px } from '@zos/utils';

import * as globals from '../globals';
import * as calc from '../functions/calc';
import * as state from '../functions/state';
import * as storage from '../functions/storage';
import * as data from '../functions/data';
import * as graph from '../functions/graph';
import * as header from '../functions/header';
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
    
    // STATUS
    const todayMood = data.getTodayMood();
    const statusText = createWidget(widget.TEXT, { x: PX.x0, y: PX.x25, w: PX.x416, h: PX.x35, color: todayMood ? globals.moodValueMap[todayMood]?.color || 0xffffff : 0xffffff, text_size: PX.x24, align_h: align.CENTER_H, align_v: align.CENTER_V });

    // DATE TEXT
    const debugDateText = createWidget(widget.TEXT, { text: data.getDateStr(graph.getGraphWindowMode()), x: PX.x58, y: PX.x58, w: PX.x300, h: PX.x50, color: 0xff6600, text_size: PX.x32, align_h: align.CENTER_H, align_v: align.CENTER_V });
    graph.drawGraph.updateDateDisplay = () => header.updateHeader(debugDateText, statusText, graph.getGraphWindowMode());
    graph.drawGraph.debugDateText = debugDateText;
    debugDateText.addEventListener?.(event.CLICK_DOWN, () => { 
      state.setDebugDayOffset(0); 
      header.updateHeader(debugDateText, statusText, graph.getGraphWindowMode());
    });

    // SMILEYS
    const imgWidgets = globals.moods.map((mood, i) => { 
      const img = createWidget(widget.IMG, { x: px(PX.x45 + i * PX.x68), y: PX.x120, w: PX.x64, h: PX.x64, src: mood.img, alpha: todayMood === mood.value ? 255 : 180 }); 
      img.addEventListener?.(event.CLICK_DOWN, () => { 
        const dateKey = calc.formatDateKey(state.getDebugDate());
        const currentMood =  state.getMoodHistoryByDate(dateKey);
        if (currentMood === mood.value) {
          state.setMoodHistoryCache(null);
          data.unsetTodayMood();
          imgWidgets.forEach((w) => w.setProperty?.(prop.MORE, { alpha: 180 }));
             // Suppress stagger when user unsets mood to avoid replaying animation
             try { graph.drawGraph._suppressStaggerUntil = Date.now() + 350; console.log('[stagger] _suppressStaggerUntil set on unset mood:', graph.drawGraph._suppressStaggerUntil); } catch (e) {}
             graph.drawGraph(false);
        } else {
          state.setMoodHistoryCache(null);
          data.setTodayMood(mood.value);
          imgWidgets.forEach((w, j) => w.setProperty?.(prop.MORE, { alpha: mood.value === globals.moods[j].value ? 255 : 180 }));
             // Suppress stagger when user sets mood to avoid replaying animation
             try { graph.drawGraph._suppressStaggerUntil = Date.now() + 350; console.log('[stagger] _suppressStaggerUntil set on set mood:', graph.drawGraph._suppressStaggerUntil); } catch (e) {}
             graph.drawGraph(false);
        }
        header.updateHeader(debugDateText, statusText, graph.getGraphWindowMode());
      }); 
      
      return img; 
    });
    if (graph.getGraphWindowMode() == 0) {
      ui.updateMoodButtonsVisibility.imgWidgets = imgWidgets;
    }

    // NAV ARROWS
    const navigateDate = dir => {
      if (graph.getGraphWindowMode() === 0) {
          state.setDebugDayOffset(state.getDebugDayOffset() + dir);
          // Prefetch the new day that enters the 7-day window (center ±3)
          try {
            const viewAfter = state.getDebugDate();
            const msPerDayLocal = data.getMsPerDay();
            const newDay = new Date(viewAfter.getTime() + (dir > 0 ? 3 : -3) * msPerDayLocal);
            newDay.setHours(0,0,0,0);
            storage.loadMoodData(newDay, newDay);
            graph.drawGraph(false, false);
            header.updateHeader(debugDateText, statusText, graph.getGraphWindowMode());
          } catch (e) { /* ignore prefetch errors */ }
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
          graph.drawGraph(false, true);
          header.updateHeader(debugDateText, statusText, graph.getGraphWindowMode());
      }
      
    };
    const leftArrow = createWidget(widget.TEXT, { text: '«', x: PX.x50, y: PX.x36, w: PX.x80, h: PX.x70, color: 0xff6600, text_size: PX.x78, align_h: align.CENTER_H, align_v: align.CENTER_V  });
          leftArrow.addEventListener?.(event.CLICK_DOWN, () => navigateDate(-1));
    const rightArrow = createWidget(widget.TEXT, { text: '»', x: PX.x296, y: PX.x36, w: PX.x80, h: PX.x70, color: 0xff6600, text_size: PX.x78, align_h: align.CENTER_H, align_v: align.CENTER_V });
          rightArrow.addEventListener?.(event.CLICK_DOWN, () => navigateDate(1));

    // LOADER TEXT
    _loadingText = createWidget(widget.TEXT, { text: '...', x: px(182), y: px(226), w: px(60), h: px(30), color: 0x888888, text_size: px(24), align_h: align.CENTER_H, align_v: align.CENTER_V });

    state.setInterpolationEnabled(true);
    
    // Defer heavy graph/UI work until after first paint
   (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : setTimeout)(() => {
    graph.drawGraph(false, true); // always use cached data, never force reload
    header.updateHeader(debugDateText, statusText, graph.getGraphWindowMode());
    setTimeout(() => { state.setInterpolationEnabled(true); _loadingText.setProperty?.(prop.MORE, { y: px(-100) }); }, 100);
   });

  },
  onShow() {
  },
  onHide() {
  },
  onDestroy() {}
});
 