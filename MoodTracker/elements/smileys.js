import { createWidget, widget, align, prop, event } from '@zos/ui';
import { px } from '@zos/utils';

import * as globals from '../globals';
import * as calc from '../functions/calc';
import * as state from '../functions/state';
import * as storage from '../functions/storage';
import * as data from '../functions/data';
import * as graph from './graph';
import * as header from './header';
import * as ui from '../functions/ui';

// Create and return the array of smiley image widgets.
export function createSmileys(PX, debugDateText, statusText) {
  const todayMood = data.getTodayMood();
  const imgWidgets = globals.moods.map((mood, i) => {
    const img = createWidget(widget.IMG, { x: px(PX.x45 + i * PX.x68), y: PX.x120, w: PX.x64, h: PX.x64, src: mood.img, alpha: todayMood === mood.value ? 255 : 180 });
    img.addEventListener?.(event.CLICK_DOWN, () => {
      const dateKey = calc.formatDateKey(state.getDebugDate());
      const currentMood = state.getMoodHistoryByDate(dateKey);
      console.log(currentMood === mood.value ? '[TEST] Unsetting' : '[TEST] Setting', 'mood:', mood.value, 'currentMood:', currentMood);
      if (currentMood === mood.value) {
        console.log('[TEST] Unsetting mood for dateKey:', dateKey);
        state.setMoodHistoryCache(null);
        data.unsetTodayMood();
        imgWidgets.forEach((w) => w.setProperty?.(prop.MORE, { alpha: 180 }));
        // Suppress stagger when user unsets mood to avoid replaying animation
        try { graph.drawGraph._suppressStaggerUntil = Date.now() + 350; } catch (e) {}
        graph.drawGraph(false);
      } else {
        console.log('[TEST] Setting mood for dateKey:', dateKey);
        state.setMoodHistoryCache(null);
        data.setTodayMood(mood.value);
        imgWidgets.forEach((w, j) => w.setProperty?.(prop.MORE, { alpha: mood.value === globals.moods[j].value ? 255 : 180 }));
        // Suppress stagger when user sets mood to avoid replaying animation
        try { graph.drawGraph._suppressStaggerUntil = Date.now() + 350; } catch (e) {}
        graph.drawGraph(false);
      }
      header.updateHeader(debugDateText, statusText, graph.getGraphWindowMode());
    });
    return img;
  });

  return imgWidgets;
}

export function updateSmileysAlpha(imgWidgets) {
  const todayMood = data.getTodayMood();
  imgWidgets.forEach((w, j) => w.setProperty?.(prop.MORE, { alpha: todayMood === globals.moods[j].value ? 255 : 180 }));
}

export default { createSmileys, updateSmileysAlpha };
