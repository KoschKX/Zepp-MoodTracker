import { createWidget, widget, align, prop } from '@zos/ui';
import { px } from '@zos/utils';
import * as globals from '../globals';
import * as state from '../functions/state';

export function ensureLegend(drawGraph, PX, topYPx) {
  if (!drawGraph.legendGroup) {
    const legendGroup = createWidget(widget.GROUP, { x: 0, y: 0, w: PX.x416, h: PX.x80 });
    drawGraph.legendGroup = legendGroup;
    legendGroup._legendWidgets = [];
    legendGroup._countWidgets = [];
    const legendSpacing = 48;
    const legendLeft = Math.floor((416 - globals.moods.length * legendSpacing) / 2) + 4;
    const baseY = (typeof topYPx === 'number') ? topYPx : px(180);
    const pxLegendTop2 = baseY - px(2);
    const pxLegendTop18 = baseY + px(18);
    globals.moods.forEach((mood, i) => {
      const pxSlot = px(legendLeft + i * legendSpacing + legendSpacing / 2 - 20);
      legendGroup._legendWidgets[i] = createWidget(widget.TEXT, { x: pxSlot, y: pxLegendTop2, w: PX.x40, h: PX.x20, color: mood.color, text_size: PX.x20, align_h: align.CENTER_H, text: '━' });
      legendGroup._countWidgets[i] = createWidget(widget.TEXT, { x: pxSlot, y: pxLegendTop18, w: PX.x40, h: PX.x20, color: mood.color, text_size: PX.x16, align_h: align.CENTER_H, text: '0' });
    });
  }
}

export function updateLegendCounts(drawGraph, moodCounts) {
  if (!drawGraph.legendGroup || !drawGraph.legendGroup._countWidgets) return;
  if (!drawGraph._prevMoodCounts) drawGraph._prevMoodCounts = Array(globals.moods.length).fill(0);
  for (let i = 0; i < drawGraph.legendGroup._countWidgets.length; i++) {
    const mood = globals.moods[i];
    const countIdx = globals.moods.length - mood.value;
    const newCount = (moodCounts && moodCounts[countIdx] != null) ? moodCounts[countIdx] : 0;
    if (newCount !== drawGraph._prevMoodCounts[countIdx]) {
      drawGraph.legendGroup._countWidgets[i].setProperty(prop.MORE, { text: String(newCount) });
      drawGraph._prevMoodCounts[countIdx] = newCount;
    }
  }
}

export function refreshLegendCounts(drawGraph) {
  if (!drawGraph) return;
  try {
    const all = state.getMoodHistoryByDateAll() || {};
    const counts = Array(globals.moods.length + 1).fill(0);
    for (const y of Object.keys(all)) {
      for (const m of Object.keys(all[y] || {})) {
        for (const d of Object.keys(all[y][m] || {})) {
          const v = all[y][m][d];
          if (typeof v === 'number' && Number.isFinite(v)) {
            const idx = globals.moods.length - v;
            if (idx >= 0 && idx < counts.length) counts[idx]++;
          }
        }
      }
    }
    updateLegendCounts(drawGraph, counts);
  } catch (e) {
    // ignore
  }
}
