import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
const templates=await server.ssrLoadModule('/lib/indicator-templates.ts');
const {applyStudySettings}=await server.ssrLoadModule('/lib/indicator-settings.ts');
const {studyDefaults}=await server.ssrLoadModule('/lib/indicator-catalog.ts');
test.after(()=>{delete globalThis.window;delete globalThis.localStorage;return server.close();});
function storage(){const rows=new Map();let failure=false,writes=0;const events=[];const target={getItem:k=>rows.get(k)??null,setItem:(k,v)=>{writes++;if(failure)throw Error('quota');rows.set(k,v);}};globalThis.window={localStorage:target,dispatchEvent:e=>events.push(e.type)};globalThis.localStorage=target;return {rows,target,events,fail:v=>failure=v,writes:()=>writes};}
const make=(name='Trend',id=name)=>templates.captureIndicatorTemplate(name,{ema21:true,rsi:true},{rsi:{...studyDefaults('rsi'),inputs:{length:7},hidden:true,colors:['#123456'],timeframes:['1D']}},id);
const lower=['rsi','adx','atr','macd','cci','mfi','bop'];

test('templates roundtrip normalized inputs, colors, visibility and exclude unavailable or unknown studies',()=>{
 const s=storage();const template=templates.normalizeIndicatorTemplate({...make(),enabled:['rsi','advance-decline','not-real','rsi'],settings:{rsi:{inputs:{length:99999},colors:['bad'],opacity:1000,timeframes:['1D','nonsense'],hidden:true,source:'invalid'}}});
 assert.deepEqual(template.enabled,['rsi']);assert.equal(template.settings.rsi.inputs.length,500);assert.equal(template.settings.rsi.hidden,true);assert.deepEqual(template.settings.rsi.timeframes,['1D']);assert.equal(template.settings.rsi.source,'close');assert.equal(template.settings.rsi.opacity,100);assert.match(template.settings.rsi.colors[0],/^#[a-f\d]{6}$/i);
 assert.equal(templates.saveIndicatorTemplate(template,s.target).ok,true);assert.deepEqual(templates.loadIndicatorTemplates(s.target),[template]);
 s.rows.set(templates.INDICATOR_TEMPLATE_KEY,'{broken');assert.deepEqual(templates.loadIndicatorTemplates(s.target),[]);
 assert.equal(templates.normalizeIndicatorTemplate({...make(),name:' '}),null);assert.equal(templates.normalizeIndicatorTemplate({...make(),updatedAt:NaN}),null);
});

test('twelve-template cap and duplicate names never evict or overwrite existing presets',()=>{
 const s=storage();for(let i=0;i<12;i++)assert.equal(templates.saveIndicatorTemplate(make('Setup '+i,'id'+i),s.target).ok,true);
 const before=s.rows.get(templates.INDICATOR_TEMPLATE_KEY);assert.equal(templates.saveIndicatorTemplate(make('Thirteenth'),s.target).ok,false);assert.equal(s.rows.get(templates.INDICATOR_TEMPLATE_KEY),before);
 assert.equal(templates.saveIndicatorTemplate(make('SETUP 0','other'),s.target).ok,false);assert.equal(s.rows.get(templates.INDICATOR_TEMPLATE_KEY),before);
 assert.equal(templates.deleteIndicatorTemplate('id0',s.target).ok,true);assert.equal(templates.loadIndicatorTemplates(s.target).length,11);assert.equal(templates.saveIndicatorTemplate(make('Replacement'),s.target).ok,true);
});

test('six-pane cap counts enabled nonhidden lower studies, preserving excluded studies in plans',()=>{
 const all=Object.fromEntries(lower.map(id=>[id,true]));assert.equal(templates.visibleLowerPaneCount(all,{}),7);
 assert.equal(templates.captureIndicatorTemplate('Too many',all,{},'too-many'),null);
 const withHidden={bop:{...studyDefaults('bop'),hidden:true}};assert.equal(templates.visibleLowerPaneCount(all,withHidden),6);assert.ok(templates.captureIndicatorTemplate('Six visible',all,withHidden,'six'));
 const template=templates.captureIndicatorTemplate('Six',Object.fromEntries(lower.slice(1).map(id=>[id,true])),{},'six2');
 const blocked=templates.planIndicatorTemplate(template,{rsi:true},{},['rsi']);assert.equal(blocked.ok,false);assert.match(blocked.error,/preserved/);
 const plan=templates.planIndicatorTemplate(make(),{macd:true,ema21:true,script:true,external:true},{},[]);assert.equal(plan.ok,true);assert.equal(plan.enabled.script,true);assert.equal(plan.enabled.external,true);assert.deepEqual(plan.toggles.sort(),['macd','rsi']);
});

test('apply settings is atomic: one persisted snapshot and event, favorites preserved, failed writes leave live settings unchanged',()=>{
 const s=storage(),key='papertrade-indicator-settings-v1';s.rows.set(key,JSON.stringify({settings:{adx:studyDefaults('adx')},favorites:['macd']}));
 assert.equal(applyStudySettings({rsi:{...studyDefaults('rsi'),inputs:{length:7}},ema21:studyDefaults('ema21')}),true);
 assert.equal(s.writes(),1);assert.deepEqual(s.events,['papertrade:indicator-settings']);const saved=JSON.parse(s.rows.get(key));assert.deepEqual(saved.favorites,['macd']);assert.equal(saved.settings.rsi.inputs.length,7);assert.ok(saved.settings.adx);
 const before=s.rows.get(key);s.fail(true);assert.equal(applyStudySettings({rsi:{...studyDefaults('rsi'),inputs:{length:99}}}),false);assert.equal(s.rows.get(key),before);assert.equal(s.events.length,1);
 s.fail(false);assert.equal(applyStudySettings({ema50:studyDefaults('ema50')}),true);assert.equal(JSON.parse(s.rows.get(key)).settings.rsi.inputs.length,7);
});

test('template selection changes only after successful settings commit; failures preserve chart selection and saved data',()=>{
 const s=storage(),calls=[];let selection={ema50:true,script:true};const toggle=id=>{calls.push(id);selection={...selection,[id]:!selection[id]};};
 const template=make();const failed=templates.applyIndicatorTemplate(template,selection,{},()=>false,toggle);assert.equal(failed.ok,false);assert.deepEqual(calls,[]);assert.equal(selection.ema50,true);
 const result=templates.applyIndicatorTemplate(template,selection,{},configs=>{assert.deepEqual(calls,[]);assert.equal(configs.rsi.hidden,true);return applyStudySettings(configs);},toggle);
 assert.equal(result.ok,true);assert.equal(selection.ema50,false);assert.equal(selection.ema21,true);assert.equal(selection.rsi,true);assert.equal(selection.script,true);
 assert.equal(templates.saveIndicatorTemplate(template,s.target).ok,true);const before=s.rows.get(templates.INDICATOR_TEMPLATE_KEY);s.fail(true);assert.equal(templates.deleteIndicatorTemplate(template.id,s.target).ok,false);assert.equal(s.rows.get(templates.INDICATOR_TEMPLATE_KEY),before);
});
