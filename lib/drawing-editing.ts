import { drawingLogicalAtTime, drawingTimeAtLogical } from './drawing-coordinates.ts';
export function duplicateDrawingPoints<T extends {time: number}>(points:T[],times:number[],bars=6):T[] {
 return points.map(point=>{
  const logical=drawingLogicalAtTime(point.time,times);
  return {...point,time:logical===null?point.time:(drawingTimeAtLogical(logical+bars,times)??point.time)};
 });
}
export function drawingTitle(tool:string){return tool.split('-').map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');}


import { sanitizeDrawingPresentation, type DrawingPresentation } from './study-pane-drawings.ts';
export const DEFAULT_FIB_LEVELS = [0, .236, .382, .5, .618, .786, 1, 1.618, 2.618];
export type AdvancedDrawingPresentation = DrawingPresentation & {
 levels?:number[];
 reverseDirection?:boolean;
 extendLines?:boolean;
 fibLabels?:'ratio'|'percent'|'none';
 fibShowPrices?:boolean;
 regressionDeviation?:number;
 regressionShowStats?:boolean;
};
/** Validate tool-specific persisted options without removing library-owned flags. */
export function sanitizeAdvancedDrawingPresentation<T extends AdvancedDrawingPresentation>(value:T):T {
 const result=sanitizeDrawingPresentation(value);
 if(value.levels!==undefined){
  if(Array.isArray(value.levels))result.levels=[...new Set(value.levels.filter(level=>typeof level==='number'&&Number.isFinite(level)&&level>=-10&&level<=10))].slice(0,24);
  else delete result.levels;
 }
 for(const key of ['reverseDirection','extendLines','fibShowPrices','regressionShowStats'] as const){
  if(value[key]!==undefined&&typeof value[key]!=='boolean')delete result[key];
 }
 if(value.fibLabels!==undefined&&!['ratio','percent','none'].includes(value.fibLabels))delete result.fibLabels;
 if(value.regressionDeviation!==undefined){
  if(typeof value.regressionDeviation==='number'&&Number.isFinite(value.regressionDeviation))result.regressionDeviation=Math.min(10,Math.max(0,value.regressionDeviation));
  else delete result.regressionDeviation;
 }
 return result;
}
/** Evaluate the same price formula for rising/falling anchors and reversed levels. */
export function fibonacciLevelPrice(a:number,b:number,level:number,reverse=false){
 return reverse?b-(b-a)*level:a+(b-a)*level;
}
/** Extend a finite fitted line while leaving its original handles untouched. */
export function extendedDrawingLine(a:{x:number;y:number},b:{x:number;y:number},width:number,left=false,right=false){
 if(!left&&!right)return {start:a,end:b};
 const first=a.x<=b.x?a:b,last=a.x<=b.x?b:a;
 const dx=last.x-first.x;
 if(Math.abs(dx)<1e-9)return {start:a,end:b};
 const y=(x:number)=>first.y+(last.y-first.y)*(x-first.x)/dx;
 const start=left?0:first.x,end=right?width:last.x;
 return {start:{x:start,y:y(start)},end:{x:end,y:y(end)}};
}

/** The chart may supply its tick/currency precision; fallback retains small prices. */
export function formatFibonacciLabel(level:number,price:number,options:AdvancedDrawingPresentation={},formatPrice?:(price:number)=>string){
 const ratio=options.fibLabels==='none'?'':options.fibLabels==='percent'?`${Number((level*100).toFixed(3))}%`:String(level);
 const precision=Math.abs(price)>=1?4:Math.abs(price)>=.0001?6:10;
 const amount=options.fibShowPrices?(formatPrice?.(price)??price.toLocaleString('en-US',{maximumFractionDigits:precision})):'';
 return [ratio,amount].filter(Boolean).join(' · ');
}

export function nextFibonacciLevel(levels:readonly number[]){
 const candidates=[1.272,1.414,2,3,...Array.from({length:81},(_,index)=>index*.25-10)];
 return candidates.find(level=>!levels.includes(level))??0;
}
