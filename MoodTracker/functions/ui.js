import { createWidget, widget, align, prop, event } from '@zos/ui';
import { px } from '@zos/utils';
import { push } from '@zos/router';

// PRECALCULATED PIXEL VALUES
let PX = null;
export const initPX = () => PX || (PX = [0, 1, 6, 8, 10, 12, 14, 15, 16, 20, 24, 25, 26, 30, 32, 35, 36, 40, 45, 48, 50, 58, 64, 68, 70, 76, 78, 80, 96, 112, 120, 150, 180, 200, 210, 272, 296, 300, 416].reduce((o, v) => (o['x' + v] = px(v), o), {neg100: px(-100), neg200: px(-200)}));
export const getPX = () => { if (!PX) initPX(); return PX; };

// LERP COLOURS
export const lerpColor = (c1, c2, t) => (Math.round(((c1>>16)&0xFF)+(((c2>>16)&0xFF)-((c1>>16)&0xFF))*t)<<16)|(Math.round(((c1>>8)&0xFF)+(((c2>>8)&0xFF)-((c1>>8)&0xFF))*t)<<8)|Math.round((c1&0xFF)+((c2&0xFF)-(c1&0xFF))*t);

// UPDATE MOOD BUTTONS VISIBILITY
export const updateMoodButtonsVisibility = (graphWindowMode = 0) => {
  if (updateMoodButtonsVisibility.imgWidgets) {
    const y = graphWindowMode === 0 ? PX.x120 : PX.neg200;
    updateMoodButtonsVisibility.imgWidgets.forEach(w => w.setProperty?.(prop.MORE, { y }));
  }
};


// --- PAGE NAV ----
export function navigateToPage(url, params) {
	if (typeof url === 'string' && url.length > 0) {
		try {
			console.log('[navigateToPage] Attempting navigation to:', url);
			push({  url: url, params: params  });
		} catch (e) {
			console.log('[navigateToPage] Navigation error:', e);
		}
	} else {
		console.log('[navigateToPage] Invalid URL:', url);
	}
}