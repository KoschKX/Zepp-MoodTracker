import { createWidget, widget, align, prop, event } from '@zos/ui';
import { px } from '@zos/utils';

import * as globals from '../globals';
import * as calc from '../functions/calc';
import * as state from '../functions/state';
import * as data from '../functions/data';
import * as graph from '../functions/graph';
import * as ui from '../functions/ui';

const raf = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame : (cb) => setTimeout(cb, 16);

Page({
  onInit(params) {
    console.log('[MonthPage] onInit with params:', params);
    state.setMoodHistoryCache(null);
    graph.setGraphWindowMode(0);
    graph.setMaxMoodDots(7);
    graph.setTapAreaUrl('page/month_page');
    data.checkMoodParam(params);
    data.checkDataChange(
      function(){
        ui.navigateToPage('page/sync_page', { targetPage: 'page/week_page', forceSync: true });
      }
    );
  },
  build() {
    const PX = ui.getPX();
    
    // DATE TEXT
    const debugDateText = createWidget(widget.TEXT, { text: data.getDateStr(graph.getGraphWindowMode()), x: PX.x58, y: PX.x58, w: PX.x300, h: PX.x50, color: 0xff6600, text_size: PX.x32, align_h: align.CENTER_H, align_v: align.CENTER_V });
    graph.drawGraph.updateDateDisplay = () => debugDateText.setProperty?.(prop.MORE, { text: data.getDateStr(graph.getGraphWindowMode()) });
    graph.drawGraph.debugDateText = debugDateText;
    debugDateText.addEventListener?.(event.CLICK_DOWN, () => { 
      state.setDebugDayOffset(0); 
      try { require('../functions/header').updateHeader(debugDateText, statusText, graph.getGraphWindowMode()); } catch (e) { /* fallback */ graph.updateUIAfterDateChange(debugDateText, statusText, imgWidgets); }
    });

    // STATUS
    const todayMood = data.getTodayMood();
    const statusText = createWidget(widget.TEXT, { x: PX.x0, y: PX.x25, w: PX.x416, h: PX.x35, color: todayMood ? globals.moodValueMap[todayMood]?.color || 0xffffff : 0xffffff, text_size: PX.x24, align_h: align.CENTER_H, align_v: align.CENTER_V });
        
    // SMILEYS
    const imgWidgets = globals.moods.map((mood, i) => { 
      const img = createWidget(widget.IMG, { x: px(PX.x45 + i * PX.x68), y: PX.x120, w: PX.x64, h: PX.x64, src: mood.img, alpha: todayMood === mood.value ? 255 : 180 }); 
      img.addEventListener?.(event.CLICK_DOWN, () => { 
        const dateKey = calc.formatDateKey(state.getDebugDate());
        const currentMood =  state.getMoodHistoryByDate(dateKey);
          console.log('[MoodPage] Before click:', {dateKey, currentMood});
        if (currentMood === mood.value) {
          console.log('[MoodPage] Clearing mood for dateKey:', dateKey);
          state.setMoodHistoryCache(null);
          data.unsetTodayMood();
          imgWidgets.forEach((w) => w.setProperty?.(prop.MORE, { alpha: 180 }));
          graph.drawGraph(false);
            console.log('[MoodPage] After clear:', {dateKey, mood: state.getMoodHistoryByDate(dateKey)});
        } else {
          state.setMoodHistoryCache(null);
          data.setTodayMood(mood.value);
          imgWidgets.forEach((w, j) => w.setProperty?.(prop.MORE, { alpha: mood.value === globals.moods[j].value ? 255 : 180 }));
          graph.drawGraph(false);
          console.log('[MoodPage] After set:', {dateKey, mood: state.getMoodHistoryByDate(dateKey)});
        }
      }); 
      return img; 
    });
    ui.updateMoodButtonsVisibility.imgWidgets = imgWidgets;

    // NAV ARROWS
    const navigateDate = dir => {
      state.setDebugDayOffset(state.getDebugDayOffset() + dir);
      try { require('../functions/header').updateHeader(debugDateText, statusText, graph.getGraphWindowMode()); } catch (e) { /* fallback */ graph.updateUIAfterDateChange(debugDateText, statusText, imgWidgets); }
    };
    const leftArrow = createWidget(widget.TEXT, { text: '«', x: PX.x50, y: PX.x36, w: PX.x80, h: PX.x70, color: 0xff6600, text_size: PX.x78, align_h: align.CENTER_H, align_v: align.CENTER_V  });
          leftArrow.addEventListener?.(event.CLICK_DOWN, () => navigateDate(-1));
    const rightArrow = createWidget(widget.TEXT, { text: '»', x: PX.x296, y: PX.x36, w: PX.x80, h: PX.x70, color: 0xff6600, text_size: PX.x78, align_h: align.CENTER_H, align_v: align.CENTER_V });
          rightArrow.addEventListener?.(event.CLICK_DOWN, () => navigateDate(1));
  
    // LOADER TEXT
    _loadingText = createWidget(widget.TEXT, { text: '...', x: px(182), y: px(226), w: px(60), h: px(30), color: 0x888888, text_size: px(24), align_h: align.CENTER_H, align_v: align.CENTER_V });
    setTimeout(() => { state.setInterpolationEnabled(true); graph.drawGraph(false); _loadingText.setProperty?.(prop.MORE, { y: px(-100) }); }, 100); 

    // Defer heavy graph/UI work until after first paint
    (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : setTimeout)(() => {
      graph.drawGraph.statusText = statusText;
      graph.drawGraph(false); // always use cached data, never force reload
      graph.updateUIAfterDateChange(debugDateText, statusText, imgWidgets);
      setTimeout(() => { state.setInterpolationEnabled(true); graph.drawGraph(false); _loadingText.setProperty?.(prop.MORE, { y: px(-100) }); }, 100);
    });

  },
  onShow() {
  },
  onHide() {
  },
  onDestroy() {}
});
 