import { drawingLogicalAtTime, drawingTimeAtLogical } from './drawing-coordinates.ts';
export function duplicateDrawingPoints<T extends {time: number}>(points:T[],times:number[],bars=6):T[] {
 return points.map(point=>{
  const logical=drawingLogicalAtTime(point.time,times);
  return {...point,time:logical===null?point.time:(drawingTimeAtLogical(logical+bars,times)??point.time)};
 });
}
export function drawingTitle(tool:string){return tool.split('-').map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');}
