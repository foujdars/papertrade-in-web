/** Study series can briefly leave the shared time scale without mapped points
 * during a resize/style update. Treat that transition like an empty range;
 * callers already handle null until the next chart redraw. */
export function readVisibleTimeRange<T>(scale:{getVisibleRange:()=>T|null}):T|null {
  try{return scale.getVisibleRange();}
  catch(error){
    if(error instanceof Error&&error.message==='Value is null')return null;
    throw error;
  }
}
