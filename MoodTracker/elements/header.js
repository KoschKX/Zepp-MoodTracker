import { createWidget, widget, align, prop } from '@zos/ui';
import { px } from '@zos/utils';
import * as globals from '../globals';
import * as data from '../functions/data';
import * as calc from '../functions/calc';
import * as state from '../functions/state';
import * as ui from '../functions/ui';
import * as smileys from './smileys';

export function updateHeader(debugDateTextWidget, statusTextWidget, graphWindowMode) {
  try {
    const dateStr = data.getDateStr(graphWindowMode);
    debugDateTextWidget?.setProperty?.(prop.MORE, { text: dateStr });
  } catch (e) { /* noop */ }
  try {
    const PX = ui.getPX();
    const isMonthMode = graphWindowMode === 1;
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
    statusTextWidget?.setProperty?.(prop.MORE, displayMood ? { text: `${prefix}${moodData?.name || ''}`, color: moodData?.color || 0x888888 } : { text: isViewingToday ? 'Tap your mood!' : 'No record', color: 0xffffff, text_size: PX.x24 });
    try {
      const imgWidgets = ui.updateMoodButtonsVisibility?.imgWidgets;
      if (imgWidgets && Array.isArray(imgWidgets)) {
        smileys.updateSmileysAlpha(imgWidgets);
      }
    } catch (e) { /* noop */ }
  } catch (e) { /* noop */ }
}

export function createHeader(PX, getDateStr) {
  const statusText = createWidget(widget.TEXT, { x: PX.x0, y: PX.x25, w: PX.x416, h: PX.x35, color: 0xffffff, text_size: PX.x24, align_h: align.CENTER_H, align_v: align.CENTER_V });
  const debugDateText = createWidget(widget.TEXT, { text: getDateStr(), x: PX.x58, y: PX.x58, w: PX.x300, h: PX.x50, color: 0xff6600, text_size: PX.x32, align_h: align.CENTER_H, align_v: align.CENTER_V });
  return { statusText, debugDateText };
}

export function setDateText(widget, text) {
  widget.setProperty?.(prop.MORE, { text });
}

export function setStatusText(widget, textObj) {
  widget.setProperty?.(prop.MORE, textObj);
}

export default { updateHeader, createHeader, setDateText, setStatusText };
