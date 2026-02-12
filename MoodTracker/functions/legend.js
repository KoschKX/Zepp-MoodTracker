import { createWidget, widget, align, prop } from '@zos/ui';
import { px } from '@zos/utils';
import * as globals from '../globals';

export function ensureLegend(drawGraph, PX, graphTop, graphHeight) {
  if (!drawGraph.legendGroup) {
    const legendGroup = createWidget(widget.GROUP, { x: 0, y: 0, w: PX.x416, h: PX.x416 });
    drawGraph.legendGroup = legendGroup;
    legendGroup._legendWidgets = [];
    legendGroup._countWidgets = [];
    const legendTop = graphTop + graphHeight + 35, legendSpacing = 48, legendLeft = Math.floor((416 - globals.moods.length * legendSpacing) / 2) + 4, [pxLegendTop2, pxLegendTop18] = [px(legendTop - 2), px(legendTop + 18)];
    globals.moods.forEach((mood, i) => {
      const pxSlot = px(legendLeft + i * legendSpacing + legendSpacing / 2 - 20);
      legendGroup._legendWidgets[i] = createWidget(widget.TEXT, { x: pxSlot, y: pxLegendTop2, w: PX.x40, h: PX.x20, color: mood.color, text_size: PX.x20, align_h: align.CENTER_H, text: '━' });
      legendGroup._countWidgets[i] = createWidget(widget.TEXT, { x: pxSlot, y: pxLegendTop18, w: PX.x40, h: PX.x20, color: mood.color, text_size: PX.x16, align_h: align.CENTER_H, text: '0' });
    });
  }
}

export function updateLegendCounts(drawGraph, moodCounts) {
  if (!drawGraph.legendGroup || !drawGraph.legendGroup._countWidgets) return;
  if (!drawGraph._prevMoodCounts) drawGraph._prevMoodCounts = [0,0,0,0,0];
  for (let i = 0; i < drawGraph.legendGroup._countWidgets.length; i++) {
    const countIdx = globals.moods.length - globals.moods[i].value, newCount = moodCounts[countIdx];
    if (newCount !== drawGraph._prevMoodCounts[countIdx]) {
      drawGraph.legendGroup._countWidgets[i].setProperty(prop.MORE, { text: String(newCount) });
      drawGraph._prevMoodCounts[countIdx] = newCount;
    }
  }
}
