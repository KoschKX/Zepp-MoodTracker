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
    const now = new Date();
    const offset = now.getDate() - 2;
    state.setDebugDayOffset(offset);
    graph.setGraphWindowMode(1);
    graph.setMaxMoodDots(31);
    graph.setTapAreaUrl('page/week_page');
    data.checkDataChange(
      function(){
        ui.navigateToPage('page/sync_page', { targetPage: 'page/month_page', forceSync: true });
      }
    );
  },
  build() {
    PX = ui.getPX();

    // STATUS
    const todayMood = data.getTodayMood();
    const statusText = createWidget(widget.TEXT, { x: PX.x0, y: PX.x25, w: PX.x416, h: PX.x35, color: todayMood ? globals.moodValueMap[todayMood]?.color || 0xffffff : 0xffffff, text_size: PX.x24, align_h: align.CENTER_H, align_v: align.CENTER_V });

    // DATE TEXT
    const debugDateText = createWidget(widget.TEXT, { text: data.getDateStr(graph.getGraphWindowMode()), x: PX.x58, y: PX.x58, w: PX.x300, h: PX.x50, color: 0xff6600, text_size: PX.x32, align_h: align.CENTER_H, align_v: align.CENTER_V });
    graph.drawGraph.updateDateDisplay = () => debugDateText.setProperty?.(prop.MORE, { text: data.getDateStr(graph.getGraphWindowMode()) });
    graph.drawGraph.debugDateText = debugDateText;
    debugDateText.addEventListener?.(event.CLICK_DOWN, () => { 
      state.setDebugDayOffset(0); 
      graph.updateUIAfterDateChange(debugDateText, statusText, imgWidgets); 
    });

    // NAV ARROWS
    const navigateDate = dir => { 
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
      graph.updateUIAfterDateChange(debugDateText, statusText, imgWidgets);
    };
    const leftArrow = createWidget(widget.TEXT, { text: '«', x: PX.x50, y: PX.x36, w: PX.x80, h: PX.x70, color: 0xff6600, text_size: PX.x78, align_h: align.CENTER_H, align_v: align.CENTER_V  });
    leftArrow.addEventListener?.(event.CLICK_DOWN, () => navigateDate(-1));
    const rightArrow = createWidget(widget.TEXT, { text: '»', x: PX.x296, y: PX.x36, w: PX.x80, h: PX.x70, color: 0xff6600, text_size: PX.x78, align_h: align.CENTER_H, align_v: align.CENTER_V });
    rightArrow.addEventListener?.(event.CLICK_DOWN, () => navigateDate(1));

    // LOADER TEXT
    _loadingText = createWidget(widget.TEXT, { text: '...', x: px(182), y: px(226), w: px(60), h: px(30), color: 0x888888, text_size: px(24), align_h: align.CENTER_H, align_v: align.CENTER_V });

    // Defer heavy graph/UI work until after first paint
    (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : setTimeout)(() => {
      graph.drawGraph.statusText = statusText;
      graph.drawGraph(false); // always use cached data, never force reload
      graph.updateUIAfterDateChange(debugDateText, statusText, imgWidgets);
      setTimeout(() => { state.setInterpolationEnabled(true); graph.drawGraph(false); _loadingText.setProperty?.(prop.MORE, { y: px(-100) }); }, 100);
    });
    
  },
  onShow() {},
  onHide() {
  },
  onDestroy() {}
});
 