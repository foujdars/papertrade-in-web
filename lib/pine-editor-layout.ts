export type PineDockLayout='bottom'|'right'|'fullscreen';
export type PineDockSettings={layout:PineDockLayout;bottom:number;right:number};
export const PINE_DOCK_STORAGE_KEY='papertrade.pine-editor.dock.v1';
export const DEFAULT_PINE_DOCK:PineDockSettings={layout:'bottom',bottom:.44,right:.48};
export function normalizePineDock(value:unknown):PineDockSettings{
 const data=value&&typeof value==='object'?value as Partial<PineDockSettings>:{};
 const size=(v:unknown,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(.75,Math.max(.25,v)):fallback;
 return {layout:['bottom','right','fullscreen'].includes(String(data.layout))?data.layout as PineDockLayout:'bottom',bottom:size(data.bottom,DEFAULT_PINE_DOCK.bottom),right:size(data.right,DEFAULT_PINE_DOCK.right)};
}
export function resizePineDock(settings:PineDockSettings,layout:'bottom'|'right',fraction:number):PineDockSettings{
 return normalizePineDock({...settings,[layout]:fraction});
}
