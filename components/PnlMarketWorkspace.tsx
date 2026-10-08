"use client";
import { PnlAnalytics, type PnlTab } from "./PnlAnalytics";
import type { ClosedPaperTrade } from "@/lib/trade-analytics";
import type { PaperOrder } from "@/lib/paper-trading";
import { pnlDay, type PnlScope } from "@/lib/pnl-analytics";
export type PnlMarketView = "india" | "global" | "both";
type Props = { view:PnlMarketView; onView:(view:PnlMarketView)=>void; indiaCalendar:ClosedPaperTrade[]; globalCalendar:ClosedPaperTrade[]; trades:ClosedPaperTrade[]; calendarTrades:ClosedPaperTrade[]; orders:PaperOrder[]; scope:PnlScope; onScope:(scope:PnlScope)=>void; tab:PnlTab; onTab:(tab:PnlTab)=>void; onSelect:(ids:string[],label:string,market:PnlMarketView)=>void; now:number; currency?:"INR"|"USD" };
export function PnlMarketWorkspace(props:Props) {
 const {view,onView,indiaCalendar,globalCalendar,scope,tab,onSelect}=props;
 const markets = view === "both" ? ["india","global"] as const : [view] as ("india"|"global")[];
 const effectiveScope={...scope,asset:view==="both"?"all" as const:view==="global"?"global" as const:scope.asset==="stocks"||scope.asset==="fno"?scope.asset:"india" as const};
 return <div className="pnl-market-workspace">
  <PnlAnalytics {...props} scope={effectiveScope} controlsOnly onSelect={(ids,label)=>onSelect(ids,label,view)}/>
  <div className="pnl-market-switch" role="group" aria-label={`${tab} market view`}>{(["india","global","both"] as const).map(m=><button key={m} aria-pressed={view===m} onClick={()=>onView(m)}>{m==="india"?"Indian":m==="global"?"Global":"Both"}</button>)}</div>
  {tab!=="trades" && <div className={`pnl-market-panels ${view==="both"?"is-both":""}`}>{markets.map(m=>{
   const calendar=m==="india"?indiaCalendar:globalCalendar;
   const trades=scope.day?calendar.filter(t=>pnlDay(t.closedAt)===scope.day):calendar;
   return <section className="pnl-market-panel" key={m} aria-label={`${m==="india"?"Indian":"Global"} ${tab}`}><h2>{m==="india"?"Indian · INR":"Global · USD"}</h2><PnlAnalytics {...props} embedded onScope={next=>props.onScope({...next,asset:effectiveScope.asset})} scope={{...scope,asset:m}} currency={m==="india"?"INR":"USD"} trades={trades} calendarTrades={calendar} onSelect={(ids,label)=>onSelect(ids,label,m)}/></section>;
  })}</div>}
 </div>;
}
