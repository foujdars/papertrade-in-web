export type ProfileMode = "fixed" | "anchored" | "session";
export const istSessionStart = (time: number) => Math.floor((time + 19800) / 86400) * 86400 - 19800;
export function profilePeriod(from: number, to: number, mode: ProfileMode, bars: number[], interval: number, calendarUnit?: string) {
  const start = Math.min(from, to), end = Math.max(from, to);
  if (mode === "session") return { from: istSessionStart(from), to: istSessionStart(from) + 86400 - 1 };
  const last = mode === "anchored" ? Math.max(from, bars.at(-1) ?? from) : end;
  // A selected daily bar includes that session, not just its opening timestamp.
  let finish = interval >= 86400 ? istSessionStart(last) + interval : last + interval;
  if(calendarUnit==="1M"||calendarUnit==="1Y") {
    const date=new Date((istSessionStart(last)+19800)*1000);
    if(calendarUnit==="1M")date.setUTCMonth(date.getUTCMonth()+1,1);
    else date.setUTCFullYear(date.getUTCFullYear()+1,0,1);
    finish=date.getTime()/1000-19800;
  }
  return { from: interval >= 86400 ? istSessionStart(mode === "anchored" ? from : start) : mode === "anchored" ? from : start, to: finish - 1 };
}
export function profileFetchPlan(from: number, to: number, now = Date.now() / 1000) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to < from || to-from > 366*86400 || from>now) throw new Error("Select a profile range within one year and not in the future.");
  const days = Math.floor((istSessionStart(Math.min(to,now))-istSessionStart(from))/86400)+1;
  const interval = [1,3,5,15,30,60,240].find(minutes => days*375/minutes <= 5000) ?? 240;
  const chunks: { from: string; to: string }[] = [];
  const date = (t: number) => new Date((t+19800)*1000).toISOString().slice(0,10);
  const end=istSessionStart(Math.min(to,now));
  const chunkDays=interval<=15?28:84;
  for(let start=istSessionStart(from);start<=end;start+=chunkDays*86400) chunks.push({from:date(start),to:date(Math.min(end,start+(chunkDays-1)*86400))});
  return {interval,chunks,today:date(now),includesToday:date(to)>=date(now)};
}
