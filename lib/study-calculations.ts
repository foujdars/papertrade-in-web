import type { Candle } from './market';
import { STUDIES, type StudyConfig } from './indicator-catalog.ts';
import { entryPlots } from './entry-signals.ts';
export type StudyPlot={name:string;values:number[];histogram?:boolean;colors?:string[];offset?:number;points?:boolean};
export type StudyResult={plots:StudyPlot[];levels?:number[];range?:[number,number];message?:string};
const N=Number.NaN;
const div=(a:number,b:number,fallback=N)=>b===0?fallback:a/b;
export const rolling=(a:number[],n:number,fn:(w:number[])=>number)=>a.map((_,i)=>{const w=a.slice(i-n+1,i+1);return i>=n-1&&w.every(Number.isFinite)?fn(w):N;});
const sum=(a:number[])=>a.reduce((s,v)=>s+v,0),avg=(a:number[])=>sum(a)/a.length;
const sums=(a:number[],n:number)=>rolling(a,n,sum),mean=(a:number[],n:number)=>rolling(a,n,avg);
const high=(a:number[],n:number)=>rolling(a,n,w=>Math.max(...w)),low=(a:number[],n:number)=>rolling(a,n,w=>Math.min(...w));
const sd=(a:number[],n:number)=>rolling(a,n,w=>{const m=avg(w);return Math.sqrt(avg(w.map(v=>(v-m)**2)));});
const diff=(a:number[],n=1)=>a.map((v,i)=>i>=n?v-a[i-n]:N);
const roc=(a:number[],n:number)=>a.map((v,i)=>i>=n?100*div(v-a[i-n],a[i-n]):N);
const zip=(a:number[],b:number[],fn:(x:number,y:number)=>number)=>a.map((v,i)=>fn(v,b[i]));
export function average(a:number[],n:number,kind='SMA'):number[]{
 if(kind==='SMA')return mean(a,n);
 if(kind==='WMA')return rolling(a,n,w=>sum(w.map((v,i)=>v*(i+1)))/(n*(n+1)/2));
 const alpha=kind==='RMA'?1/n:2/(n+1);let state=N,seed:number[]=[];
 return a.map(v=>{if(!Number.isFinite(v)){state=N;seed=[];return N;}if(!Number.isFinite(state)){seed.push(v);if(seed.length<n)return N;state=avg(seed);}else state+=alpha*(v-state);return state;});
}
const E=(a:number[],n:number)=>average(a,n,'EMA'),R=(a:number[],n:number)=>average(a,n,'RMA');
export function relativeStrength(a:number[],n:number){const change=diff(a),up=R(change.map(v=>Math.max(v,0)),n),down=R(change.map(v=>Math.max(-v,0)),n);return zip(up,down,(u,d)=>!Number.isFinite(u+d)?N:d===0?u===0?50:100:100-100/(1+u/d));}
const cumulative=(a:number[])=>{let total=0;return a.map(v=>total+=Number.isFinite(v)?v:0);};
const weighted4=(a:number[])=>a.map((v,i)=>i<3?N:(v+2*a[i-1]+2*a[i-2]+a[i-3])/6);
function regression(a:number[],n:number){return a.map((_,i)=>{const w=a.slice(i-n+1,i+1);if(i<n-1||n<2||!w.every(Number.isFinite))return {end:N,slope:N,error:N,corr:N};const mx=(n-1)/2,my=avg(w),xx=n*(n*n-1)/12,xy=sum(w.map((v,j)=>(j-mx)*(v-my))),slope=xy/xx,intercept=my-slope*mx,yy=sum(w.map(v=>(v-my)**2)),res=sum(w.map((v,j)=>(v-intercept-slope*j)**2));return {end:intercept+slope*(n-1),slope,error:n>2?Math.sqrt(res/(n-2)):0,corr:div(xy,Math.sqrt(xx*yy),0)};});}
export function computeStudy(id:string,data:Candle[],c:StudyConfig,comparison?:Candle[]):StudyResult {
 const definition=STUDIES.find(s=>s.id===id);if(!definition||definition.unavailable)return {plots:[],message:definition?.unavailable??'Unknown indicator'};
 if(!data.length)return {plots:[],message:'Waiting for candles'};
 if(definition.comparison){
  if(!c.comparisonKey)return {plots:[],message:'Choose a comparison symbol in Settings.'};
  if(!comparison?.length)return {plots:[],message:'Comparison history unavailable; waiting for a fresh response.'};
  const other=new Map(comparison.slice(0,-1).map(b=>[b.time,b.close]));
  const a=data.map((b,i)=>i<data.length-1?b.close:N),b=data.map((d,i)=>i<data.length-1?(other.get(d.time)??N):N);
  let values:number[];
  if(id==='ratio'||id==='spread')values=zip(a,b,(x,y)=>id==='ratio'?div(x,y):x-y);
  else {const len=c.inputs.length;values=a.map((_,i)=>{if(i<len-1)return N;const x=a.slice(i-len+1,i+1).map(v=>id==='correlation-log'?Math.log(v):v),y=b.slice(i-len+1,i+1).map(v=>id==='correlation-log'?Math.log(v):v);if(![...x,...y].every(Number.isFinite))return N;const mx=avg(x),my=avg(y);return div(sum(x.map((v,j)=>(v-mx)*(y[j]-my))),Math.sqrt(sum(x.map(v=>(v-mx)**2))*sum(y.map(v=>(v-my)**2))));});}
  return {plots:[{name:definition.name,values}],range:id.startsWith('correlation')?[-1,1]:undefined,message:values.some(Number.isFinite)?undefined:'No matching completed candles for these settings.'};
 }
 const p=c.inputs,n=p.length??14,open=data.map(b=>b.open),close=data.map(b=>b.close),hi=data.map(b=>b.high),lo=data.map(b=>b.low),hl2=zip(hi,lo,(h,l)=>(h+l)/2),tp=data.map(b=>(b.high+b.low+b.close)/3),vol=data.map(b=>Number(b.volume));
 if(definition.volume&&(!vol.every(v=>Number.isFinite(v)&&v>=0)||!vol.some(v=>v>0)))return {plots:[],message:'Real candle volume is unavailable for this instrument.'};
 const src=c.source==='open'?open:c.source==='high'?hi:c.source==='low'?lo:c.source==='hl2'?hl2:c.source==='hlc3'?tp:c.source==='ohlc4'?data.map(b=>(b.open+b.high+b.low+b.close)/4):close;
 const tr=data.map((b,i)=>i?Math.max(b.high-b.low,Math.abs(b.high-close[i-1]),Math.abs(b.low-close[i-1])):b.high-b.low),atr=(len:number)=>R(tr,len);
 const plots:StudyPlot[]=[],add=(name:string,values:number[],extra:Partial<StudyPlot>={})=>plots.push({name,values,...extra});
 let levels:number[]|undefined,range:[number,number]|undefined;
 const ma=(values=src,len=n,kind='SMA')=>average(values,len,kind);
 const band=(center:number[],width:number[])=>{add('Upper',zip(center,width,(a,b)=>a+b));add('Middle',center);add('Lower',zip(center,width,(a,b)=>a-b));};
 const moneyFlow=data.map((b,i)=>div(2*b.close-b.high-b.low,b.high-b.low,0)*vol[i]);
 const tsi=(fast:number,slow:number)=>{const delta=diff(src);return zip(E(E(delta,slow),fast),E(E(delta.map(Math.abs),slow),fast),(a,b)=>100*div(a,b,0));};
 const stoch=(values:number[],len:number,h=values,l=values)=>{const hh=high(h,len),ll=low(l,len);return values.map((v,i)=>100*div(v-ll[i],hh[i]-ll[i],50/100));};
 if(/^ema\d*$/.test(id))add('EMA',E(src,n));
 else if(/^sma\d+$/.test(id)||id==='ma')add('SMA',ma());
 else switch(id){
 case 'smc':case 'vpvr':break;
 case 'average-price':add('OHLC4',data.map(b=>(b.open+b.high+b.low+b.close)/4));break;
 case 'median':add('HL2',hl2);break;
 case 'typical':add('HLC3',tp);break;
 case 'wma':add('WMA',ma(src,n,'WMA'));break;
 case 'smma':add('SMMA',R(src,n));break;
 case 'dema':{const a=E(src,n),b=E(a,n);add('DEMA',zip(a,b,(x,y)=>2*x-y));break;}
 case 'tema':{const a=E(src,n),b=E(a,n),d=E(b,n);add('TEMA',a.map((v,i)=>3*v-3*b[i]+d[i]));break;}
 case 'hma':{const a=ma(src,Math.max(1,Math.floor(n/2)),'WMA'),b=ma(src,n,'WMA');add('HMA',ma(zip(a,b,(x,y)=>2*x-y),Math.max(1,Math.round(Math.sqrt(n))),'WMA'));break;}
 case 'alma':add('ALMA',rolling(src,n,w=>{const m=p.offset*(n-1),s=n/p.sigma,weights=w.map((_,i)=>Math.exp(-((i-m)**2)/(2*s*s)));return sum(w.map((v,i)=>v*weights[i]))/sum(weights);}));break;
 case 'hamming':add('Hamming',rolling(src,n,w=>{const weights=w.map((_,i)=>n===1?1:.54-.46*Math.cos(2*Math.PI*i/(n-1)));return sum(w.map((v,i)=>v*weights[i]))/sum(weights);}));break;
 case 'kama':{let last=N;const move=diff(src).map(Math.abs),noise=sums(move,n);add('KAMA',src.map((v,i)=>{if(i<n)return N;const er=div(Math.abs(v-src[i-n]),noise[i],0),sc=(er*(2/(p.fast+1)-2/(p.slow+1))+2/(p.slow+1))**2;last=Number.isFinite(last)?last+sc*(v-last):src[i-1]+sc*(v-src[i-1]);return last;}));break;}
 case 'mcginley':{let last=N;add('McGinley',src.map((v,i)=>{if(i<n-1)return N;if(!Number.isFinite(last))last=avg(src.slice(i-n+1,i+1));else last+=div(v-last,n*(v/last)**4,0);return last;}));break;}
 case 'ma-channel':add('High SMA',ma(hi));add('Low SMA',ma(lo));break;
 case 'ma-double':case 'ma-triple':case 'ma-multiple':case 'ma-cross':case 'ema-cross':case 'ma-ema-cross':{
  add('Fast',ma(src,p.fast,id==='ema-cross'?'EMA':'SMA'));add('Slow',ma(src,p.slow,id==='ema-cross'||id==='ma-ema-cross'?'EMA':'SMA'));
  if(id==='ma-triple'||id==='ma-multiple')add('Third',ma());if(id==='ma-multiple')add('Fourth',ma(src,p.fourth));break;
 }
 case 'guppy':[3,5,8,10,12,15,30,35,40,45,50,60].forEach(len=>add(`EMA ${len}`,E(src,len)));break;
 case 'lsma':case 'linreg':add('Regression',regression(src,n).map(v=>v.end));break;
 case 'slope':add('Slope',regression(src,n).map(v=>v.slope));levels=[0];break;
 case 'trend-strength':add('Correlation',regression(src,n).map(v=>v.corr));range=[-1,1];levels=[0];break;
 case 'stderr':add('Residual standard error',regression(src,n).map(v=>v.error));break;
 case 'stderr-bands':{const r=regression(src,n);band(r.map(v=>v.end),r.map(v=>v.error*p.multiplier));break;}
 case 'rsi':{const values=relativeStrength(src,n);add('RSI',values);if(c.smoothing!=='None')add('Smoothing',ma(values,p.smooth,c.smoothing));levels=[p.lower,50,p.upper];range=[0,100];break;}
 case 'adx':case 'dmi':{
  const up=hi.map((v,i)=>i?v-hi[i-1]:N),dn=lo.map((v,i)=>i?lo[i-1]-v:N),plus=R(up.map((v,i)=>v>dn[i]&&v>0?v:Number.isFinite(v)?0:N),n),minus=R(dn.map((v,i)=>v>up[i]&&v>0?v:Number.isFinite(v)?0:N),n),a=R(tr.map((v,i)=>i?v:N),n);
  const diPlus=zip(plus,a,(x,y)=>100*div(x,y,0)),diMinus=zip(minus,a,(x,y)=>100*div(x,y,0)),dx=zip(diPlus,diMinus,(x,y)=>100*div(Math.abs(x-y),x+y,0));
  add('ADX',R(dx,p.smooth));if(id==='dmi'){add('+DI',diPlus);add('-DI',diMinus);}levels=[25];break;
 }
 case 'atr':add('ATR',atr(n));break;
 case 'aroon':{const calc=(a:number[],pick:'max'|'min')=>rolling(a,n+1,w=>{const val=pick==='max'?Math.max(...w):Math.min(...w);return 100*w.lastIndexOf(val)/n;});add('Up',calc(hi,'max'));add('Down',calc(lo,'min'));range=[0,100];break;}
 case 'macd':case 'price-oscillator':{const fast=E(src,p.fast),slow=E(src,p.slow),line=zip(fast,slow,(x,y)=>id==='macd'?x-y:100*div(x-y,y));add(id==='macd'?'MACD':'PPO',line);if(id==='macd'){const signal=E(line,p.signal);add('Signal',signal);add('Histogram',zip(line,signal,(x,y)=>x-y),{histogram:true});}levels=[0];break;}
 case 'awesome':add('AO',zip(mean(hl2,p.fast),mean(hl2,p.slow),(x,y)=>x-y),{histogram:true});levels=[0];break;
 case 'bop':add('BOP',mean(data.map(b=>div(b.close-b.open,b.high-b.low,0)),n));levels=[0];break;
 case 'bollinger':case 'bbp':case 'bbw':{const m=mean(src,n),w=sd(src,n).map(v=>v*p.multiplier);if(id==='bollinger')band(m,w);else if(id==='bbp'){add('%B',src.map((v,i)=>div(v-m[i]+w[i],2*w[i],.5)));levels=[0,1];}else add('Width %',w.map((v,i)=>100*div(2*v,m[i])));break;}
 case 'donchian':case 'price-channel':{const hh=high(hi,n),ll=low(lo,n);add('Upper',hh);add('Middle',zip(hh,ll,(x,y)=>(x+y)/2));add('Lower',ll);break;}
 case 'envelopes':{const m=mean(src,n);band(m,m.map(v=>v*p.percent/100));break;}
 case 'keltner':band(E(src,n),atr(p.atr).map(v=>v*p.multiplier));break;
 case 'cmo':{const delta=diff(src),up=sums(delta.map(v=>Math.max(v,0)),n),dn=sums(delta.map(v=>Math.max(-v,0)),n);add('CMO',zip(up,dn,(a,b)=>100*div(a-b,a+b,0)));range=[-100,100];levels=[0];break;}
 case 'choppiness':{const hh=high(hi,n),ll=low(lo,n),s=sums(tr,n);add('CHOP',s.map((v,i)=>n>1?100*Math.log10(div(v,hh[i]-ll[i]))/Math.log10(n):N));levels=[38.2,61.8];break;}
 case 'chop-zone':{const m=E(src,n),hh=high(hi,30),ll=low(lo,30),colors=['#00a67e','#4db6ac','#81c784','#c8e6c9','#f5c446','#ffb74d','#f08080','#ef5350','#d32f2f'];const angle=m.map((v,i)=>i?Math.atan(div((v-m[i-1])*25*ll[i],src[i]*(hh[i]-ll[i]),0))*180/Math.PI:N);add('Zone',angle.map(v=>Number.isFinite(v)?1:N),{histogram:true,colors:angle.map(v=>colors[v>=5?0:v>=3.57?1:v>=2.14?2:v>=.71?3:v>-.71?4:v>-2.14?5:v>-3.57?6:v>-5?7:8])});break;}
 case 'cci':add('CCI',rolling(tp,n,w=>{const m=avg(w);return div(w.at(-1)!-m,.015*avg(w.map(v=>Math.abs(v-m))),0);}));levels=[-100,0,100];break;
 case 'connors':{let streak=0;const seq=src.map((v,i)=>{if(!i||v===src[i-1])streak=0;else streak=v>src[i-1]?Math.max(0,streak)+1:Math.min(0,streak)-1;return streak;}),a=relativeStrength(src,n),b=relativeStrength(seq,p.streak),returns=roc(src,1),rank=returns.map((v,i)=>i>=p.rank?100*returns.slice(i-p.rank+1,i+1).filter(x=>x<v).length/p.rank:N);add('CRSI',a.map((v,i)=>(v+b[i]+rank[i])/3));range=[0,100];levels=[20,80];break;}
 case 'dpo':{const m=mean(src,n),shift=Math.floor(n/2)+1;add('DPO',src.map((_,i)=>i>=shift?src[i-shift]-m[i]:N));levels=[0];break;}
 case 'fisher':{const hh=high(hl2,n),ll=low(hl2,n);let v=0,f=0;const vals=hl2.map((price,i)=>{if(i<n-1)return N;v=Math.max(-.999,Math.min(.999,.66*(div(price-ll[i],hh[i]-ll[i],.5)-.5)+.67*v));f=.5*Math.log((1+v)/(1-v))+.5*f;return f;});add('Fisher',vals);add('Trigger',vals.map((_,i)=>i?vals[i-1]:N));levels=[0];break;}
 case 'momentum':add('Momentum',diff(src,n));levels=[0];break;
 case 'roc':add('ROC %',roc(src,n));levels=[0];break;
 case 'coppock':add('Coppock',ma(zip(roc(src,p.fast),roc(src,p.slow),(a,b)=>a+b),n,'WMA'));levels=[0];break;
 case 'majority':add('Up bars %',mean(diff(src).map(v=>Number.isFinite(v)?v>0?100:0:N),n));range=[0,100];levels=[50];break;
 case 'mass':{const a=E(zip(hi,lo,(h,l)=>h-l),p.smooth),b=E(a,p.smooth);add('Mass',sums(zip(a,b,(x,y)=>div(x,y,1)),n));levels=[27,26.5];break;}
 case 'trix':add('TRIX',roc(E(E(E(src,n),n),n),1));levels=[0];break;
 case 'tsi':case 'smi':{const v=tsi(p.fast,p.slow).map(v=>id==='smi'?v/100:v),s=E(v,p.signal);add(id==='tsi'?'TSI':'SMI',v);add('Signal',s);if(id==='smi')add('Oscillator',zip(v,s,(a,b)=>a-b),{histogram:true});levels=[0];break;}
 case 'rvi':{const a=mean(weighted4(zip(close,open,(c,o)=>c-o)),n),b=mean(weighted4(zip(hi,lo,(h,l)=>h-l)),n),v=zip(a,b,(x,y)=>div(x,y,0));add('RVI',v);add('Signal',weighted4(v));levels=[0];break;}
 case 'relative-volatility':{const s=sd(src,n),delta=diff(src),up=E(s.map((v,i)=>delta[i]>0?v:Number.isFinite(v)?0:N),p.smooth),dn=E(s.map((v,i)=>delta[i]<=0?v:Number.isFinite(v)?0:N),p.smooth);add('RVI',zip(up,dn,(a,b)=>100*div(a,a+b,.5)));range=[0,100];levels=[30,70];break;}
 case 'stochastic':case 'stoch-rsi':{const base=id==='stoch-rsi'?relativeStrength(src,n):close,raw=id==='stoch-rsi'?stoch(base,p.stoch):stoch(base,n,hi,lo),k=mean(raw,p.smooth);add('%K',k);add('%D',mean(k,p.signal));range=[0,100];levels=[20,80];break;}
 case 'ultimate':{const bp=data.map((b,i)=>i?b.close-Math.min(b.low,close[i-1]):N),range=data.map((b,i)=>i?Math.max(b.high,close[i-1])-Math.min(b.low,close[i-1]):N),ratio=(len:number)=>zip(sums(bp,len),sums(range,len),(a,b)=>div(a,b,0)),a=ratio(p.fast),b=ratio(n),d=ratio(p.slow);add('UO',a.map((v,i)=>100*(4*v+2*b[i]+d[i])/7));levels=[30,70];break;}
 case 'stddev':add('Deviation',sd(src,n));break;
 case 'historical-volatility':case 'vol-close':case 'vol-zero':case 'vol-ohlc':{const logs=src.map((v,i)=>i&&v>0&&src[i-1]>0?Math.log(v/src[i-1]):N);const values=id==='vol-ohlc'?mean(data.map(b=>b.low>0&&b.open>0?.5*Math.log(b.high/b.low)**2-(2*Math.log(2)-1)*Math.log(b.close/b.open)**2:N),n).map(v=>Math.sqrt(Math.max(0,v))):id==='vol-zero'?mean(logs.map(v=>v*v),n).map(Math.sqrt):sd(logs,n);add('Annualized %',values.map(v=>v*Math.sqrt(p.annual)*100));break;}
 case 'ad':add('A/D',cumulative(moneyFlow));break;
 case 'cmf':add('CMF',zip(sums(moneyFlow,n),sums(vol,n),(a,b)=>div(a,b)));levels=[0];break;
 case 'chaikin':{const a=cumulative(moneyFlow);add('Chaikin',zip(E(a,p.fast),E(a,p.slow),(x,y)=>x-y));levels=[0];break;}
 case 'chaikin-volatility':add('Range ROC %',roc(E(zip(hi,lo,(h,l)=>h-l),n),p.roc));break;
 case 'force':add('Force',E(diff(close).map((v,i)=>v*vol[i]),n));levels=[0];break;
 case 'eom':{const move=diff(hl2),box=hi.map((v,i)=>div(vol[i]/p.divisor,v-lo[i]));add('EOM',mean(zip(move,box,(a,b)=>div(a,b,0)),n));levels=[0];break;}
 case 'net-volume':add('Net volume',vol.map((v,i)=>i?v*Math.sign(close[i]-close[i-1]):0),{histogram:true});break;
 case 'obv':add('OBV',cumulative(vol.map((v,i)=>i?v*Math.sign(close[i]-close[i-1]):0)));break;
 case 'pvt':add('PVT',cumulative(vol.map((v,i)=>i?v*div(close[i]-close[i-1],close[i-1],0):0)));break;
 case 'mfi':{const flow=tp.map((v,i)=>v*vol[i]),up=sums(flow.map((v,i)=>i?tp[i]>tp[i-1]?v:0:N),n),dn=sums(flow.map((v,i)=>i?tp[i]<tp[i-1]?v:0:N),n);add('MFI',zip(up,dn,(a,b)=>!Number.isFinite(a+b)?N:b===0?a===0?50:100:100-100/(1+a/b)));range=[0,100];levels=[20,80];break;}
 case 'volume':add('Volume',vol,{histogram:true,colors:data.map(b=>b.close>=b.open?'#12a58a80':'#ec547580')});add('Average',mean(vol,n));break;
 case 'volume-oscillator':add('Volume oscillator %',zip(E(vol,p.fast),E(vol,p.slow),(a,b)=>100*div(a-b,b)));levels=[0];break;
 case 'vwma':add('VWMA',zip(sums(src.map((v,i)=>v*vol[i]),n),sums(vol,n),(a,b)=>div(a,b)));break;
 case 'vwap':{let day='',pv=0,v=0;add('Session VWAP',tp.map((price,i)=>{const next=new Date((data[i].time+19800)*1000).toISOString().slice(0,10);if(day!==next){day=next;pv=0;v=0;}pv+=price*vol[i];v+=vol[i];return div(pv,v);}));break;}
 case 'vortex':{const a=sums(hi.map((v,i)=>i?Math.abs(v-lo[i-1]):N),n),b=sums(lo.map((v,i)=>i?Math.abs(v-hi[i-1]):N),n),t=sums(tr,n);add('VI+',zip(a,t,(x,y)=>div(x,y)));add('VI−',zip(b,t,(x,y)=>div(x,y)));levels=[1];break;}
 case 'williams':add('%R',stoch(close,n,hi,lo).map(v=>v-100));range=[-100,0];levels=[-80,-20];break;
 case 'alligator':add('Jaw',R(hl2,n),{offset:8});add('Teeth',R(hl2,p.teeth),{offset:5});add('Lips',R(hl2,p.lips),{offset:3});break;
 case 'ichimoku':{const midpoint=(len:number)=>zip(high(hi,len),low(lo,len),(a,b)=>(a+b)/2),a=midpoint(p.fast),b=midpoint(p.slow);add('Conversion',a);add('Base',b);add('Span A',zip(a,b,(a,b)=>(a+b)/2),{offset:p.shift});add('Span B',midpoint(n),{offset:p.shift});add('Lagging close',close,{offset:-p.shift});break;}
 case 'fractals':{const upper=hi.map(()=>N),lower=lo.map(()=>N);for(let i=n;i<data.length-n-1;i++){if(hi.slice(i-n,i+n+1).every((v,j)=>j===n||v<hi[i]))upper[i]=hi[i];if(lo.slice(i-n,i+n+1).every((v,j)=>j===n||v>lo[i]))lower[i]=lo[i];}add('Upper fractal',upper,{points:true});add('Lower fractal',lower,{points:true});break;}
 case 'zigzag':{const values=src.map(()=>N);let direction=0,extreme=src[0],idx=0;values[0]=src[0];for(let i=1;i<src.length;i++){const v=src[i];if(direction>=0){if(v>=extreme){extreme=v;idx=i;}else if((extreme-v)/Math.abs(extreme)*100>=p.percent){values[idx]=extreme;direction=-1;extreme=v;idx=i;}}if(direction<=0){if(v<=extreme){extreme=v;idx=i;}else if((v-extreme)/Math.abs(extreme)*100>=p.percent){values[idx]=extreme;direction=1;extreme=v;idx=i;}}}values[idx]=extreme;add('Turning points',values);break;}
 case 'supertrend':{const a=atr(n);let upper=N,lower=N,up=false;add('Supertrend',close.map((price,i)=>{if(!Number.isFinite(a[i]))return N;const bu=hl2[i]+p.multiplier*a[i],bl=hl2[i]-p.multiplier*a[i],oldUpper=upper,oldLower=lower;upper=!Number.isFinite(upper)||bu<upper||close[i-1]>upper?bu:upper;lower=!Number.isFinite(lower)||bl>lower||close[i-1]<lower?bl:lower;up=!Number.isFinite(oldUpper)?false:up?price>=oldLower:price>oldUpper;return up?lower:upper;}),{colors:close.map(()=>c.colors[0])});const v=plots[0].values;plots[0].colors=v.map((value,i)=>close[i]>=value?'#12a58a':'#ec5475');break;}
 case 'chande-kroll':{const a=atr(n),hh=high(hi,n),ll=low(lo,n);add('Long stop',high(hh.map((v,i)=>v-p.multiplier*a[i]),p.lookback));add('Short stop',low(ll.map((v,i)=>v+p.multiplier*a[i]),p.lookback));break;}
 case 'pivots':{let session='',current={h:0,l:0,c:0},previous:typeof current|undefined;const output=Array.from({length:7},()=>[] as number[]);data.forEach(b=>{const key=new Date((b.time+19800)*1000).toISOString().slice(0,10);if(key!==session){previous=session?{...current}:undefined;current={h:b.high,l:b.low,c:b.close};session=key;}else {current.h=Math.max(current.h,b.high);current.l=Math.min(current.l,b.low);current.c=b.close;}const h=previous?.h??N,l=previous?.l??N,cl=previous?.c??N,pivot=(h+l+cl)/3,r=h-l;[pivot,2*pivot-l,2*pivot-h,pivot+r,pivot-r,h+2*(pivot-l),l-2*(h-pivot)].forEach((v,i)=>output[i].push(v));});['P','R1','S1','R2','S2','R3','S3'].slice(0,1+2*Math.min(3,p.levels)).forEach((name,i)=>add(name,output[i]));break;}
 case 'kst':{const r=[mean(roc(src,10),10),mean(roc(src,15),10),mean(roc(src,20),10),mean(roc(src,30),15)],v=src.map((_,i)=>sum(r.map((a,j)=>a[i]*(j+1))));add('KST',v);add('Signal',mean(v,p.signal));levels=[0];break;}
 case 'klinger':{let trend=1,cm=0,prevDm=0,prevSum=0;const force=data.map((b,i)=>{const total=b.high+b.low+b.close,dm=b.high-b.low,next=total>prevSum?1:-1;cm=i&&next===trend?cm+dm:prevDm+dm;trend=next;prevSum=total;prevDm=dm;return vol[i]*Math.abs(2*(div(dm,cm,0)-1))*trend*100;}),v=zip(E(force,p.fast),E(force,p.slow),(a,b)=>a-b);add('KVO',v);add('Signal',E(v,p.signal));levels=[0];break;}
 case 'asi':{const si=data.map((b,i)=>{if(!i)return 0;const prev=data[i-1],a=Math.abs(b.high-prev.close),d=Math.abs(b.low-prev.close),e=Math.abs(b.high-b.low),f=Math.abs(prev.close-prev.open),r=a>=Math.max(d,e)?a-d/2+f/4:d>=Math.max(a,e)?d-a/2+f/4:e+f/4;return 50*div((b.close-prev.close)+(b.close-b.open)/2+(prev.close-prev.open)/4,r,0)*Math.max(a,d)/p.limit;});add('ASI',cumulative(si));break;}
 case 'sar':{let up=data.length>1?close[1]>=close[0]:true,sar=up?lo[0]:hi[0],extreme=up?hi[0]:lo[0],af=p.start;const vals=close.map((_,i)=>{if(!i)return N;sar+=af*(extreme-sar);sar=up?Math.min(sar,lo[i-1],lo[Math.max(0,i-2)]):Math.max(sar,hi[i-1],hi[Math.max(0,i-2)]);if(up?lo[i]<sar:hi[i]>sar){sar=extreme;up=!up;extreme=up?hi[i]:lo[i];af=p.start;}else if(up?hi[i]>extreme:lo[i]<extreme){extreme=up?hi[i]:lo[i];af=Math.min(p.maximum,af+p.increment);}return sar;});add('SAR',vals,{points:true});break;}
 case 'entry':{const marks=entryPlots(data,p);add('EMA 21',marks.ema21);add('EMA 50',marks.ema50);add('VWAP',marks.vwap);add('Long',marks.long,{points:true});add('Short',marks.short,{points:true});break;}
 default:return {plots:[],message:'This indicator is not implemented.'};
 }
 return {plots,levels,range,message:plots.length&&plots.every(s=>!s.values.some(Number.isFinite))?'More candle history is needed for these settings.':undefined};
}
