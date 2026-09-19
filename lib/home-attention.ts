import type { PriceTask } from './price-actions';
import type { TechnicalRule, TechnicalEvent } from './technical-alerts';
import type { PaperProtection, PaperOrder } from './paper-trading';

/** Today's mark-to-market on remaining lots, including carry derivatives and shorts. */
export function homeOpenChange(orders:PaperOrder[],marks:Array<{symbol:string;product:string;price:number;previousClose:number|null}>,now:number):number|null {
 const day=(at:number)=>Math.floor((at+19800000)/86400000);let total=0;
 for(const mark of marks){
  const lots:Array<{quantity:number;price:number;at:number}>=[];
  const fills=orders.filter(o=>o.status==='COMPLETE'&&o.symbol===mark.symbol&&(o.product??'INTRADAY')===mark.product&&o.quantity>0&&Number.isFinite(o.quantity)&&Number.isFinite(o.price));
  const timestamp=(o:PaperOrder)=>o.createdAt??(Number(o.id)>1e12?Number(o.id):0);
  for(const o of fills.sort((a,b)=>timestamp(a)-timestamp(b))){
   let quantity=o.quantity*(o.side==='BUY'?1:-1);
   while(quantity&&lots.length&&Math.sign(lots[0].quantity)!==Math.sign(quantity)){
    const consumed=Math.min(Math.abs(quantity),Math.abs(lots[0].quantity));
    lots[0].quantity-=Math.sign(lots[0].quantity)*consumed;quantity-=Math.sign(quantity)*consumed;
    if(!lots[0].quantity)lots.shift();
   }
   if(quantity)lots.push({quantity,price:o.price,at:timestamp(o)});
  }
  if(lots.length&&(!Number.isFinite(mark.price)||mark.price<=0))return null;
  for(const lot of lots){
   if(!lot.at||lot.at>now)return null;
   const base=day(lot.at)===day(now)?lot.price:mark.previousClose;
   if(base===null||!Number.isFinite(base)||base<=0)return null;
   total+=(mark.price-base)*lot.quantity;
  }
 }
 return Number.isFinite(total)?total:null;
}

export type HomeAttention = {id:string;title:string;detail:string;revision?:string;tone:'warning'|'info';target:{kind:'position';symbol:string;product:'INTRADAY'|'DELIVERY'}|{kind:'alerts';tab:'list'|'log';id?:string}};
export type HomeAlertSnapshot = {ownerId:string;items:HomeAttention[]};
export type HomeAlertRequest = {key:number;tab:'list'|'log';id?:string};
export function positionAttention(positions:Array<{symbol:string;product:'INTRADAY'|'DELIVERY';side:string;quantity:number}>,protections:PaperProtection[],orders:PaperOrder[]=[]):HomeAttention[]{
 const missing=positions.filter(p=>p.quantity>0&&!protections.some(s=>s.symbol===p.symbol&&s.product===p.product&&s.side===p.side&&Number.isFinite(s.stopLossPrice)&&s.stopLossPrice!>0));
 const p=missing[0];return p?[{id:`position:${p.symbol}:${p.product}`,revision:JSON.stringify(missing.map(v=>[v.symbol,v.product,v.side,v.quantity,orders.filter(o=>o.status==='COMPLETE'&&o.symbol===v.symbol&&(o.product??'INTRADAY')===v.product).map(o=>o.id).sort()])),title:`${p.symbol} · No recorded stop-loss`,detail:`${p.product==='INTRADAY'?'Intraday':'Delivery / carry'} · ${p.quantity} units${missing.length>1?` · ${missing.length-1} more without a stop`:''}`,tone:'warning',target:{kind:'position',symbol:p.symbol,product:p.product}}]:[];
}
export function alertAttention(tasks:PriceTask[],rules:TechnicalRule[],events:TechnicalEvent[],cloudReady:boolean,cloudMessage:string,error:string,now:number):HomeAttention[]{
 const activeRules=rules.filter(r=>r.status==='active'&&r.expiresAt>now),activeTasks=tasks.filter(t=>t.kind==='alert'&&t.status==='pending'&&t.expiresAt>now),items:HomeAttention[]=[];
 const server=activeRules.filter(r=>r.delivery==='server'),device=activeTasks.length+activeRules.filter(r=>r.delivery!=='server').length;
 if(error&&(activeRules.length||activeTasks.length))items.push({id:'monitoring',title:'Alert monitoring needs attention',detail:error,tone:'warning',target:{kind:'alerts',tab:'list'}});
 else if(!cloudReady&&(server.length||device))items.push({id:'monitoring',title:'Closed-app monitoring unavailable',detail:server.length?cloudMessage:`${device} device alert${device===1?'':'s'} need the app open. Background monitoring is not ready.`,tone:'warning',target:{kind:'alerts',tab:'list'}});
 else if(device)items.push({id:'monitoring',title:'Device alerts need the app open',detail:`${device} alert${device===1?'':'s'} use device-only monitoring.`,tone:'info',target:{kind:'alerts',tab:'list'}});
 if(items[0])items[0].revision=JSON.stringify([...activeRules.map(r=>`${r.id}:${r.delivery}`),...activeTasks.map(t=>t.id)].sort());
 const recent=[...tasks.filter(t=>t.kind==='alert'&&t.status==='triggered'&&t.completedAt).map(t=>({id:t.id,at:t.completedAt!,symbol:t.instrument.symbol,detail:`Price ${t.condition} ₹${t.price.toLocaleString('en-IN')}`})),...events.filter(e=>e.kind==='trigger').map(e=>({id:e.id,at:e.createdAt,symbol:e.instrument.symbol,detail:e.description}))].filter(e=>e.at<=now&&now-e.at<86400000).sort((a,b)=>b.at-a.at)[0];
 if(recent)items.push({id:`event:${recent.id}`,title:`${recent.symbol} · Alert triggered`,detail:recent.detail,tone:'info',target:{kind:'alerts',tab:'log',id:recent.id}});
 return items;
}
