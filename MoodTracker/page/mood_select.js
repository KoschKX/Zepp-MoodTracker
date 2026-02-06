import { createWidget, widget, align, prop, event } from '@zos/ui';
import { px } from '@zos/utils';
import { push } from '@zos/router';

// Lazy init: compute px() values on first render, not module load
let PX = null;

function initPX() {
  if (!PX) {
    PX = {
      x0: px(0),
      y100: px(100),
      y110: px(110),
      y120: px(120),
      y172: px(172),
      y180: px(180),
      y240: px(240),
      y250: px(250),
      y260: px(260),
      w64: px(64),
      h64: px(64),
      w80: px(80),
      h80: px(80),
      w416: px(416),
      h50: px(50),
      size32: px(32),
      size36: px(36),
      size48: px(48),
      centerX: px(208 - (5 * 68) / 2),
      spacing68: px(68),
      centerXBtn: px(208 - 42),
      neg200: px(-200)
    };
  }
  return PX;
}

const moods = [
  { value: 5, name: 'great', img: 'smiley_great.png', color: 0x8be000 },
  { value: 4, name: 'good', img: 'smiley_good.png', color: 0x00d8c3 },
  { value: 3, name: 'meh', img: 'smiley_meh.png', color: 0x4eb6e6 },
  { value: 2, name: 'bad', img: 'smiley_bad.png', color: 0xffa726 },
  { value: 1, name: 'awful', img: 'smiley_awful.png', color: 0xff5e6b }
];

Page({
  _clearPollTimer: null,
  _lastClearToken: 0,
  _getClearedAtToken() {
    try {
      const v = localStorage.getItem('mood_history_cleared_at');
      return v ? Number(v) : 0;
    } catch (e) {
      return 0;
    }
  },
  onInit() {},
  onShow() {
    try {
      const token = this._getClearedAtToken();
      if (token && token !== this._lastClearToken) {
        this._lastClearToken = token;
        try { localStorage.setItem('mood_history', '{}'); } catch (e) {}
      }
    } catch (e) {}
    if (this._clearPollTimer) clearInterval(this._clearPollTimer);
    this._clearPollTimer = setInterval(() => {
      try {
        const token = this._getClearedAtToken();
        if (token && token !== this._lastClearToken) {
          this._lastClearToken = token;
          try { localStorage.setItem('mood_history', '{}'); } catch (e) {}
        }
      } catch (e) {}
    }, 1000);
  },
  onHide() {
    if (this._clearPollTimer) {
      clearInterval(this._clearPollTimer);
      this._clearPollTimer = null;
    }
  },
  
  build() {
    // Init PX when the page shows up
    const px = initPX();
    
    // Centered status text
    const statusText = createWidget(widget.TEXT, {  
      x: px.x0, y: PX.y100, w: px.w416, h: px.h50, 
      color: 0xffffff, text_size: px.size32, align_h: align.CENTER_H, align_v: align.CENTER_V,
      text: 'Tap your mood!' 
    });
    
    // Keep mood widgets so we can hide them later
    const moodWidgets = [];
    
    // Build the X button first so handlers can use it
    const skipButton = createWidget(widget.TEXT, {
      x: PX.centerXBtn,
      y: PX.y260,
      w: PX.w80,
      h: PX.h80,
      color: 0x888888,
      text_size: PX.size48,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: 'ⓧ'
    });
    
    // Centered mood buttons
    moods.forEach((mood, i) => {
      const imgWidget = createWidget(widget.IMG, { 
        x: px.centerX + i * px.spacing68,
        y: px.y180,
        w: px.w64,
        h: px.h64,
        src: mood.img, 
        alpha: 180 
      });
      
      moodWidgets.push(imgWidget);
      
      imgWidget.addEventListener && imgWidget.addEventListener(event.CLICK_DOWN, () => {
        console.log('Clicked mood:', mood.value);
        
        // Show selected smiley at full opacity
        imgWidget.setProperty && imgWidget.setProperty(prop.MORE, { alpha: 255 });
        
        // Hide all mood buttons right away
        moodWidgets.forEach((widget) => {
          widget.setProperty && widget.setProperty(prop.MORE, { alpha: 0 });
        });
        
        // Hide X button by clearing its text
        skipButton.setProperty && skipButton.setProperty(prop.MORE, { text: '' });
        
        // Switch status text to loading
        statusText.setProperty && statusText.setProperty(prop.MORE, { 
          text: '...',
          y: px.y172,
          text_size: px.size36
        });
        
        // Jump to mood_page with the mood value (it saves it)
        push({ 
          url: 'page/mood_page',
          params: { mood: mood.value }
        });
      });
    }); 
    
    // Skip button handler
    skipButton.addEventListener && skipButton.addEventListener(event.CLICK_DOWN, () => {
      console.log('[MoodSelect] Skip button clicked');
      
      // Hide all mood buttons
      moodWidgets.forEach((widget) => {
        widget.setProperty && widget.setProperty(prop.MORE, { alpha: 0 });
      });
      
      // Hide X button by clearing its text
      skipButton.setProperty && skipButton.setProperty(prop.MORE, { text: '' });
      
      // Switch status text to loading
      statusText.setProperty && statusText.setProperty(prop.MORE, { 
        text: '...',
        y: PX.y172,
        text_size: PX.size36
      });
      
      // Go to mood_page without params
      push({ url: 'page/mood_page' });
    });
  }
});
