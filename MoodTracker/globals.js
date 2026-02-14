
// --- SETTINGS ---

// DEBUG
export const DEBUG_MODE = false;

// PERFORMANCE
export const TARGET_FPS = 20;
export const FRAME_TIME = Math.floor(1000 / TARGET_FPS);
export const INSTANT_NAV = true;
export const VERTICAL_GRAPH_DOT_SIZE = 10;
export const ULTRA_LIGHT_NAV = true;
export const THROTTLE_DATE_UPDATES = true;
export const SKIP_UI_UPDATES_DURING_NAV = true;
export const DEBOUNCE_MULTIPLIER = 1;
export const DEFER_UPDATE_UNTIL_DEBOUNCE = true;

// GRAPH
export const SHOW_LOADING_INDICATOR = true;
export const LOADING_TEXT = '...';
export const SHOW_INTERPOLATION_DOTS = true;
export const ADAPTIVE_INTERPOLATION_DOTS = true;
export const SHOW_CENTER_LINE = true;
export const VERTICAL_GRAPH_DOTS = 5;
export const VERTICAL_GRAPH_DOT_TEXT_SIZE = 12;
export const VERTICAL_GRAPH_DOT_COLOR = 0x666666;
export const VERTICAL_GRAPH_DOT_OFFSET = 4; 
export const VERTICAL_GRAPH_DOT_GLYPH = '•'; // '•' '┃' '|' '+' ':' '*' '⋮' '┼' '║' 
export const SHOW_TODAY_ARROW = false;
export const TODAY_ARROW_COLOR = 0xffffff;
export const SHOW_GRID_DOTS = false;

export const ATTACH_DOT_TAP_EVENTS = true;
export const HIDE_DOTS_DURING_NAV_WEEK = false;
export const HIDE_DOTS_DURING_NAV_MONTH = true;
export const ENABLE_STAGGER_DOT_REVEAL = false;
export const STAGGER_DOT_REVEAL_MS = 100;

// DATA
export const ASYNC_DATA = false;
export const IMMEDIATE_SAVE = false;
export const ENABLE_COMPRESSION_OUTGOING = true; 
export const ENABLE_COMPRESSION_INCOMING = true;

// --- MOODS ---
export const moods = [
	{ value: 5, name: 'Great', color: 0x8be000, img: 'smiley_great.png' },
	{ value: 4, name: 'Good', color: 0x00d8c3, img: 'smiley_good.png' },
	{ value: 3, name: 'Okay', color: 0x4eb6e6, img: 'smiley_meh.png' },
	{ value: 2, name: 'Bad', color: 0xffa726, img: 'smiley_bad.png' },
	{ value: 1, name: 'Awful', color: 0xff5e6b, img: 'smiley_awful.png' }
];
export const moodValueMap = moods.reduce((map, mood) => { map[mood.value] = mood; return map; }, {});

// --- MONTHS ---
export const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthNamesAbv = [
	'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
	'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];