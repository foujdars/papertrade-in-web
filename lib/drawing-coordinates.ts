/** Continuous chart coordinates, including empty space before/after candles. */
export function drawingLogicalAtTime(time:number,times:number[]) {
  if(!times.length)return null;
  if(times.length===1)return (time-times[0])/86400;
  let index=times.findIndex(t=>t>=time);
  if(index===0)index=1;
  if(index<0)index=times.length-1;
  return index-1+(time-times[index-1])/(times[index]-times[index-1]||1);
}
export function drawingTimeAtLogical(logical:number,times:number[]) {
  if(!times.length)return null;
  if(times.length===1)return times[0]+logical*86400;
  const index=Math.max(0,Math.min(times.length-2,Math.floor(logical)));
  return times[index]+(logical-index)*(times[index+1]-times[index]);
}
