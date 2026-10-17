import type { Candle } from './market';
import type { StudyPlot } from './study-calculations';

export type PineInput = { id:string; title:string; type:'int'|'float'|'bool'|'source'; defaultValue:number|boolean|string; value:number|boolean|string; min?:number; max?:number; step?:number };
export type PineAlert = { title:string; message:string; values:boolean[] };
export type PineScriptRun = { plots:StudyPlot[]; levels:number[]; levelStyles:{price:number;title:string;color:string;width?:number;style?:string}[]; overlay:boolean; title:string; inputs:PineInput[]; alerts:PineAlert[]; error:string|null };
type Atom = number | boolean | string;
type Value = Atom | Atom[];
type Token = { text:string; line:number; kind:string };
type Expr = { kind:string; text:string; line:number; children:Expr[]; names?:string[] };
const COLORS:Record<string,string>={red:'#f23645',green:'#4caf50',blue:'#2196f3',orange:'#ff9800',yellow:'#ffeb3b',purple:'#9c27b0',white:'#ffffff',black:'#000000',gray:'#787b86',silver:'#b2b5be',lime:'#00e676',aqua:'#00bcd4',teal:'#00897b',navy:'#311b92',maroon:'#880e4f',fuchsia:'#e040fb',olive:'#808000'};
const MAX_SOURCE=32000,MAX_CANDLES=20000,MAX_OPS=8000000;
function fail(line:number,message:string):never { throw new Error(`Line ${line}: ${message}`); }

/** Bounded, non-executable Pine v5/v6 indicator subset. Unsupported syntax fails closed. */
export function runPineScript(source:string,candles:Candle[],inputOverrides:Record<string,number|boolean|string>={}):PineScriptRun {
 const out:PineScriptRun={plots:[],levels:[],levelStyles:[],overlay:false,title:'Custom indicator',inputs:[],alerts:[],error:null};
 let operations=0;
 const spend=(amount:number,line:number)=>{operations+=amount;if(operations>MAX_OPS)fail(line,'Script operation budget exceeded');};
 try {
  if(source.length>MAX_SOURCE)fail(1,`Source exceeds ${MAX_SOURCE} characters`);
  if(candles.length>MAX_CANDLES)fail(1,`Candle limit is ${MAX_CANDLES}`);
  const version=/^\s*\/\/@version\s*=\s*(\S+)/m.exec(source);
  if(version&&!['5','6'].includes(version[1]))fail(source.slice(0,version.index).split('\n').length,'Only the Pine v5/v6 indicator subset is supported');
  const tokens:Token[]=[];let cursor=0,line=1,depth=0;
  while(cursor<source.length){
   const c=source[cursor];
   if(c==='\n'){if(!depth)tokens.push({text:';',line,kind:'separator'});line++;cursor++;continue;}
   if(/\s/.test(c)){cursor++;continue;}
   if(source.slice(cursor,cursor+2)==='//'){while(cursor<source.length&&source[cursor]!=='\n')cursor++;continue;}
   if(c==='"'||c==="'"){
    const start=line;let value='';cursor++;let closed=false;
    while(cursor<source.length){const next=source[cursor++];if(next===c){closed=true;break;}if(next==='\n')fail(start,'Unterminated string');if(next==='\\'){const esc=source[cursor++];if(!['n','t','\\','"',"'"].includes(esc))fail(start,'Unsupported string escape');value+=esc==='n'?'\n':esc==='t'?'\t':esc;}else value+=next;}
    if(!closed)fail(start,'Unterminated string');tokens.push({text:value,line:start,kind:'string'});continue;
   }
   const rest=source.slice(cursor),number=/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest),name=/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/.exec(rest),hex=/^#[\da-fA-F]{6}(?:[\da-fA-F]{2})?/.exec(rest);
   if(number||name||hex){const text=(number||name||hex)![0];tokens.push({text,line,kind:number?'number':hex?'string':'name'});cursor+=text.length;continue;}
   const pair=rest.slice(0,2);if(['==','!=','<=','>='].includes(pair)){tokens.push({text:pair,line,kind:'op'});cursor+=2;continue;}
   if('()+-*/%<>=?:,[]'.includes(c)){if(c==='('||c==='['){depth++;if(depth>64)fail(line,'Nesting limit exceeded');}if(c===')'||c===']'){depth--;if(depth<0)fail(line,'Unmatched closing delimiter');}tokens.push({text:c,line,kind:'op'});cursor++;continue;}
   fail(line,`Unsupported character ${c}`);
  }
  if(depth)fail(line,'Unclosed delimiter');tokens.push({text:';',line,kind:'separator'},{text:'EOF',line,kind:'end'});
  const env=new Map<string,Value>();
  for(const key of ['open','high','low','close','volume'] as const)env.set(key,candles.map(c=>c[key]));
  env.set('time',candles.map(c=>c.time*1000));
  env.set('bar_index',candles.map((_,i)=>i));
  env.set('hl2',candles.map(c=>(c.high+c.low)/2));env.set('hlc3',candles.map(c=>(c.high+c.low+c.close)/3));env.set('ohlc4',candles.map(c=>(c.open+c.high+c.low+c.close)/4));
  let pos=0,parseDepth=0,declared=false,assignment='';
  const peek=()=>tokens[pos];const take=()=>tokens[pos++];
  const expect=(text:string)=>{if(peek().text!==text)fail(peek().line,`Expected ${text}`);take();};
  const precedence:Record<string,number>={or:1,and:2,'==':3,'!=':3,'<':4,'>':4,'<=':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6};
  function expression(min=0):Expr {
   if(++parseDepth>64)fail(peek().line,'Expression nesting limit exceeded');
   const t=take();let node:Expr;
   if(['-','+','not'].includes(t.text))node={kind:'unary',text:t.text,line:t.line,children:[expression(7)]};
   else if(t.text==='('){node=expression();expect(')');}
   else if(t.kind==='number'||t.kind==='string')node={kind:t.kind,text:t.text,line:t.line,children:[]};
   else if(t.kind==='name'){
    node={kind:'name',text:t.text,line:t.line,children:[]};
    if(peek().text==='('){take();const children:Expr[]=[],names:string[]=[];if(peek().text!==')')do{let name='';if(peek().kind==='name'&&tokens[pos+1].text==='='){name=take().text;take();}names.push(name);children.push(expression());if(peek().text!==',')break;take();}while(true);expect(')');node={kind:'call',text:t.text,line:t.line,children,names};}
   }else fail(t.line,'Expected an expression');
   while(peek().text==='['){take();const index=expression();expect(']');node={kind:'history',text:'',line:t.line,children:[node,index]};}
   while(precedence[peek().text]!==undefined&&precedence[peek().text]>=min){const op=take();node={kind:'binary',text:op.text,line:op.line,children:[node,expression(precedence[op.text]+1)]};}
   if(min===0&&peek().text==='?'){take();const yes=expression();expect(':');node={kind:'ternary',text:'',line:t.line,children:[node,yes,expression()]};}
   parseDepth--;return node;
  }
  const at=(v:Value,i:number):Atom=>Array.isArray(v)?v[i]:v;
  const numeric=(v:Atom,l:number):number=>{if(typeof v!=='number')fail(l,'Expected numeric value');return v;};
  const truth=(v:Atom)=>typeof v==='boolean'?v:typeof v==='number'&&Number.isFinite(v)&&v!==0;
  function vector(values:Value[],fn:(v:Atom[])=>Atom,l:number):Value {const size=values.some(Array.isArray)?candles.length:1;spend(size,l);return size===1&&!values.some(Array.isArray)?fn(values as Atom[]):Array.from({length:candles.length},(_,i)=>fn(values.map(v=>at(v,i))));}
  function series(v:Value,l:number):number[]{spend(candles.length,l);return Array.from({length:candles.length},(_,i)=>numeric(at(v,i),l));}
  function scalar(v:Value,l:number):Atom{if(Array.isArray(v))fail(l,'Expected a constant');return v;}
  function evaluate(e:Expr):Value {
   spend(1,e.line);const l=e.line;
   if(e.kind==='number'){const value=Number(e.text);if(!Number.isFinite(value))fail(l,'Number literal must be finite');return value;}
   if(e.kind==='string')return e.text;
   if(e.kind==='name'){
    if(e.text==='true'||e.text==='false')return e.text==='true';if(e.text==='na')return NaN;
    if(e.text.startsWith('color.')&&COLORS[e.text.slice(6)])return COLORS[e.text.slice(6)];
    if(['plot.style_line','plot.style_histogram','plot.style_columns','plot.style_circles','plot.style_cross'].includes(e.text))return e.text;
    if(!env.has(e.text))fail(l,`Unknown or unsupported identifier ${e.text}`);return env.get(e.text)!;
   }
   const args=e.children.map(evaluate);
   if(e.kind==='history'){const distance=scalar(args[1],l);if(typeof distance!=='number'||!Number.isInteger(distance)||distance<0||distance>MAX_CANDLES)fail(l,'History index must be a nonnegative constant integer');spend(candles.length,l);return Array.from({length:candles.length},(_,i)=>i<distance?NaN:at(args[0],i-distance));}
   if(e.kind==='ternary')return vector(args,([a,b,c])=>truth(a)?b:c,l);
   if(e.kind==='unary')return vector(args,([a])=>e.text==='not'?!truth(a):e.text==='-'?-numeric(a,l):numeric(a,l),l);
   if(e.kind==='binary')return vector(args,([a,b])=>{
    if(e.text==='and')return truth(a)&&truth(b);if(e.text==='or')return truth(a)||truth(b);
    if(['==','!=','<','>','<=','>='].includes(e.text)){if(typeof a==='number'&&Number.isNaN(a)||typeof b==='number'&&Number.isNaN(b))return false;if(e.text==='==')return a===b;if(e.text==='!=')return a!==b;const x=numeric(a,l),y=numeric(b,l);return e.text==='<'?x<y:e.text==='>'?x>y:e.text==='<='?x<=y:x>=y;}
    const x=numeric(a,l),y=numeric(b,l);return e.text==='+'?x+y:e.text==='-'?x-y:e.text==='*'?x*y:y===0?NaN:e.text==='/'?x/y:x%y;
   },l);
   if(e.kind==='call')return call(e,args);
   fail(l,'Unsupported expression');
  }
  function call(e:Expr,args:Value[]):Value {
   const l=e.line,name=e.text;
   const bind=(allowed:string[],required:string[]=[])=>{
    const result=new Map<string,Value>();let next=0,named=false;
    args.forEach((v,i)=>{const key=e.names![i]||allowed[next++];if(e.names![i])named=true;else if(named)fail(l,'Positional argument after named argument');if(!key||!allowed.includes(key)||result.has(key))fail(l,`Unsupported or duplicate argument ${key??i+1} in ${name}`);result.set(key,v);});
    for(const key of required)if(!result.has(key))fail(l,`${name} requires ${key}`);return result;
   };
   const constant=(v:Value|undefined,fallback:Atom):Atom=>v===undefined?fallback:scalar(v,l);
   const text=(v:Value|undefined,fallback:string)=>{const x=constant(v,fallback);if(typeof x!=='string')fail(l,'Expected string');return x;};
   if(name==='indicator'){
    const p=bind(['title','shorttitle','overlay'],['title']);if(declared)fail(l,'Only one indicator declaration is supported');out.title=text(p.get('title'),'Custom indicator');const overlay=constant(p.get('overlay'),false);if(typeof overlay!=='boolean')fail(l,'overlay must be bool');out.overlay=overlay;declared=true;return NaN;
   }
   if(name.startsWith('input.')){
    const type=name.slice(6) as PineInput['type'];if(!['int','float','bool','source'].includes(type))fail(l,`Unsupported function ${name}`);
    const p=bind(['defval','title','minval','maxval','step'],['defval']);
    let def:Atom=type==='source'?'close':scalar(p.get('defval')!,l);
    if(type==='source'){const node=e.children[e.names!.indexOf('defval')>=0?e.names!.indexOf('defval'):0];if(node.kind!=='name'||!['open','high','low','close','hl2','hlc3','ohlc4','volume'].includes(node.text))fail(l,'input.source requires an OHLCV source');def=node.text;}
    const title=text(p.get('title'),assignment||`Input ${out.inputs.length+1}`),id=assignment||title;
    if(out.inputs.some(i=>i.id===id))fail(l,'Duplicate input identifier');
    const chosen=inputOverrides[id]??inputOverrides[title]??def;
    const min=p.has('minval')?numeric(scalar(p.get('minval')!,l),l):undefined,max=p.has('maxval')?numeric(scalar(p.get('maxval')!,l),l):undefined,step=p.has('step')?numeric(scalar(p.get('step')!,l),l):undefined;
    if(min!==undefined&&!Number.isFinite(min)||max!==undefined&&!Number.isFinite(max)||step!==undefined&&(!Number.isFinite(step)||step<=0)||min!==undefined&&max!==undefined&&min>max)fail(l,'Invalid input bounds');
    if(type==='int'||type==='float'){if(typeof def!=='number'||!Number.isFinite(def)||typeof chosen!=='number'||!Number.isFinite(chosen)||type==='int'&&(!Number.isInteger(def)||!Number.isInteger(chosen))||min!==undefined&&chosen<min||max!==undefined&&chosen>max)fail(l,`Invalid value for input ${id}`);}
    if(type==='bool'&&(typeof def!=='boolean'||typeof chosen!=='boolean'))fail(l,`Invalid bool input ${id}`);
    if(type==='source'&&(typeof chosen!=='string'||!['open','high','low','close','hl2','hlc3','ohlc4','volume'].includes(chosen)))fail(l,`Invalid source input ${id}`);
    out.inputs.push({id,title,type,defaultValue:def,value:chosen,min,max,step});return type==='source'?env.get(chosen as string)!:chosen;
   }
   if(name==='plot'){
    const p=bind(['series','title','color','linewidth','style','offset'],['series']);if(out.plots.length>=32)fail(l,'Plot limit is 32');
    const values=series(p.get('series')!,l),style=text(p.get('style'),'plot.style_line'),offset=numeric(constant(p.get('offset'),0),l),width=numeric(constant(p.get('linewidth'),1),l);
    if(!Number.isInteger(offset)||Math.abs(offset)>500||!Number.isInteger(width)||width<1||width>4)fail(l,'Invalid plot offset or width');
    if(!['plot.style_line','plot.style_histogram','plot.style_columns','plot.style_circles','plot.style_cross'].includes(style))fail(l,'Unsupported plot style');
    const color=p.get('color')??'#8054da';const colors=Array.from({length:candles.length},(_,i)=>{const v=at(color,i);if(typeof v!=='string'||!/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(v))fail(l,'Invalid plot color');return v;});spend(candles.length,l);
    out.plots.push({name:text(p.get('title'),`Plot ${out.plots.length+1}`),values,colors,offset,width,histogram:style==='plot.style_histogram'||style==='plot.style_columns',points:style==='plot.style_circles'||style==='plot.style_cross'});return NaN;
   }
   if(name==='hline'){const p=bind(['price','title','color'],['price']);const value=numeric(scalar(p.get('price')!,l),l);if(!Number.isFinite(value))fail(l,'hline requires finite price');if(out.levels.length>=32)fail(l,'Level limit is 32');const color=text(p.get('color'),'#787b86');if(!/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(color))fail(l,'Invalid hline color');out.levels.push(value);out.levelStyles.push({price:value,title:text(p.get('title'),''),color});return NaN;}
   if(name==='alertcondition'){const p=bind(['condition','title','message'],['condition']);if(out.alerts.length>=32)fail(l,'Alert limit is 32');spend(candles.length,l);out.alerts.push({title:text(p.get('title'),'Alert'),message:text(p.get('message'),''),values:Array.from({length:candles.length},(_,i)=>truth(at(p.get('condition')!,i)))});return NaN;}
   if(name==='color.new'){const p=bind(['color','transp'],['color','transp']);return vector([p.get('color')!,p.get('transp')!],([c,t])=>{if(typeof c!=='string'||!/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(c)||typeof t!=='number'||!Number.isFinite(t)||t<0||t>100)fail(l,'Invalid color.new arguments');return c.slice(0,7)+Math.round(255*(1-t/100)).toString(16).padStart(2,'0');},l);}
   if(name==='na'||name==='nz'){const p=bind(name==='na'?['x']:['source','replacement'],[name==='na'?'x':'source']);return vector(name==='na'?[p.get('x')!]:[p.get('source')!,p.get('replacement')??0],([x,replacement])=>name==='na'?typeof x==='number'&&Number.isNaN(x):typeof x==='number'&&Number.isNaN(x)?replacement:x,l);}
   if(name.startsWith('math.')){
    const key=name.slice(5);const unary:Record<string,(n:number)=>number>={abs:Math.abs,sqrt:Math.sqrt,log:Math.log,log10:Math.log10,exp:Math.exp,floor:Math.floor,ceil:Math.ceil,round:Math.round,sin:Math.sin,cos:Math.cos};
    if(unary[key]){const p=bind(['number'],['number']);return vector([p.get('number')!],([x])=>unary[key](numeric(x,l)),l);}
    if(['max','min','pow'].includes(key)){const p=bind(['number1','number2'],['number1','number2']);return vector([p.get('number1')!,p.get('number2')!],([a,b])=>key==='max'?Math.max(numeric(a,l),numeric(b,l)):key==='min'?Math.min(numeric(a,l),numeric(b,l)):Math.pow(numeric(a,l),numeric(b,l)),l);}fail(l,`Unsupported function ${name}`);
   }
   if(name==='ta.crossover'||name==='ta.crossunder'){const p=bind(['source1','source2'],['source1','source2']),a=series(p.get('source1')!,l),b=series(p.get('source2')!,l);spend(candles.length,l);return a.map((v,i)=>i>0&&[v,b[i],a[i-1],b[i-1]].every(Number.isFinite)&&(name==='ta.crossover'?v>b[i]&&a[i-1]<=b[i-1]:v<b[i]&&a[i-1]>=b[i-1]));}
   if(name.startsWith('ta.')){
    const key=name.slice(3);if(!['sma','ema','rma','rsi','atr','stdev','highest','lowest'].includes(key))fail(l,`Unsupported function ${name}`);
    const p=bind(key==='atr'?['length']:['source','length',...(key==='stdev'?['biased']:[])],key==='atr'?['length']:['source','length']);
    const n=numeric(scalar(p.get('length')!,l),l);if(!Number.isInteger(n)||n<1||n>5000)fail(l,'Length must be an integer from 1 to 5000');
    const values=key==='atr'?candles.map((c,i)=>i?Math.max(c.high-c.low,Math.abs(c.high-candles[i-1].close),Math.abs(c.low-candles[i-1].close)):c.high-c.low):series(p.get('source')!,l);
    if(key==='ema')return smooth(values,n,false,l);
    if(key==='rma'||key==='atr')return smooth(values,n,true,l);
    if(key==='rsi'){const changes=values.map((v,i)=>i?v-values[i-1]:NaN),up=smooth(changes.map(v=>Math.max(v,0)),n,true,l),down=smooth(changes.map(v=>Math.max(-v,0)),n,true,l);spend(values.length,l);return up.map((u,i)=>!Number.isFinite(u+down[i])?NaN:down[i]===0?u===0?NaN:100:u===0?0:100-100/(1+u/down[i]));}
    const biased=constant(p.get('biased'),true);if(typeof biased!=='boolean')fail(l,'biased must be bool');spend(values.length*n,l);
    // SMA/deviation count non-na observations; extrema inspect the last n bar positions.
    const observed:number[]=[];
    return values.map((value,i)=>{
     if(key==='highest'||key==='lowest'){const window=values.slice(Math.max(0,i-n+1),i+1).filter(Number.isFinite);return !window.length?NaN:key==='highest'?Math.max(...window):Math.min(...window);}
     if(Number.isFinite(value)){observed.push(value);if(observed.length>n)observed.shift();}
     if(observed.length<n)return NaN;const mean=observed.reduce((a,b)=>a+b,0)/n;
     return key==='sma'?mean:n===1&&!biased?NaN:Math.sqrt(observed.reduce((a,b)=>a+(b-mean)**2,0)/(biased?n:n-1));
    });
   }
   fail(l,`Unsupported function ${name}`);
  }
  function smooth(values:number[],length:number,wilder:boolean,l:number):number[]{spend(values.length,l);let state=NaN;const seed:number[]=[];return values.map(v=>{if(!Number.isFinite(v))return state;if(!Number.isFinite(state)){if(wilder){seed.push(v);if(seed.length<length)return NaN;state=seed.reduce((a,b)=>a+b,0)/length;}else state=v;}else state+=(wilder?1/length:2/(length+1))*(v-state);return state;});}
  function validateStatement(expr:Expr,assigned:boolean){
   const effects=['indicator','plot','hline','alertcondition'];
   function visit(node:Expr,root:boolean){
    if(node.kind==='call'){
     if(effects.includes(node.text)&&(!root||assigned))fail(node.line,`${node.text} is only supported as a standalone statement`);
     if(node.text.startsWith('input.')&&(!root||!assigned))fail(node.line,'Inputs must be directly assigned to a unique variable');
    }
    node.children.forEach(child=>visit(child,false));
   }
   visit(expr,true);
  }
  while(peek().kind!=='end'){
   if(peek().kind==='separator'){take();continue;}
   const first=peek();let name='';if(peek().kind==='name'&&tokens[pos+1].text==='='){name=take().text;take();if(env.has(name)||['true','false','na'].includes(name)||name.includes('.'))fail(first.line,'Reassignment and reserved names are unsupported');}
   assignment=name;const expr=expression();if(peek().kind!=='separator'&&peek().kind!=='end')fail(peek().line,'Unsupported statement or trailing text');
   if(!declared&&(expr.kind!=='call'||expr.text!=='indicator'))fail(first.line,'Start with indicator(title, overlay=...)');
   if(!name&&(expr.kind!=='call'||!['indicator','plot','hline','alertcondition'].includes(expr.text)))fail(first.line,'Expected assignment, plot, hline or alertcondition');
   validateStatement(expr,!!name);
   const result=evaluate(expr);if(name)env.set(name,result);assignment='';
  }
  if(!declared)fail(1,'Missing indicator declaration');if(!out.plots.length&&!out.levels.length)fail(1,'Add plot(...) or hline(...)');
  return out;
 }catch(error){return {...out,plots:[],levels:[],levelStyles:[],alerts:[],error:error instanceof Error?error.message:'Script could not run'};}
}
