import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundled = await build({entryPoints:['lib/technical-alerts.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {defaultTechnicalConfig,evaluatePriceQuote,advanceTechnical,technicalConfigError} = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const now=Date.parse('2026-09-18T11:00:00+05:30');
const make=(condition='crossing',repeat='repeat')=>({...defaultTechnicalConfig('price'),condition,repeat,id:'ray',revision:'v1',instrument:{symbol:'TEST',instrumentKey:'NSE_EQ|TEST'},createdAt:now,armedAt:now,expiresAt:now+86400000,status:'active'});
const step=(rule,price,offset)=>{const time=now+offset;return advanceTechnical(rule,evaluatePriceQuote(rule,{lastPrice:price,lastTradeAt:new Date(time).toISOString()},time),time);};
test('crossing baseline persists; duplicate and stale quotes cannot generate a crossing',()=>{
 let r=step(make(),99,1000);assert.equal(r.event,undefined);assert.equal(r.rule.lastQuotePrice,99);
 assert.equal(step(r.rule,101,1000).event,undefined);
 assert.equal(step(r.rule,101,500).event,undefined);
 assert.equal(evaluatePriceQuote(r.rule,{lastPrice:101,lastTradeAt:new Date(now+2000).toISOString()},now+92000).hit,undefined);
 r=step(r.rule,100,2000);assert.ok(r.event);assert.equal(r.rule.lastQuoteAt,now+2000);
 const above=step(r.rule,101,3000);assert.equal(above.event,undefined);
 assert.ok(step(above.rule,99,4000).event);
});
test('directions and equality touches are precise; once completes',()=>{
 for(const [condition,a,b,hit] of [['crossingUp',99,100,true],['crossingUp',101,100,false],['crossingDown',101,100,true],['crossingDown',99,100,false],['crossing',100,101,false]]){
 const baseline=step(make(condition,'once'),a,1000).rule;const result=step(baseline,b,2000);assert.equal(Boolean(result.event),hit);assert.equal(result.rule.status,hit?'completed':'active');
 }
 assert.ok(step(make('above','once'),100,1000).event);assert.ok(step(make('below','once'),100,1000).event);
});
test('repeat above/below fires on becoming true; cooldown consumes edges without delayed spam',()=>{
 let r=make('above');r.cooldown=1;
 let x=step(r,101,1000);assert.ok(x.event);r=x.rule;
 assert.equal(step(r,102,2000).event,undefined);
 r=step(r,99,3000).rule;r=step(r,101,4000).rule;
 assert.equal(step(r,102,62000).event,undefined);
 r=step(r,99,63000).rule;assert.ok(step(r,100,64000).event);
});
test('metadata validation and every price condition support repeats',()=>{
 for(const condition of ['above','below','crossing','crossingUp','crossingDown'])assert.equal(technicalConfigError({...make(condition),alertName:'Ray alert',message:'Watch this level'}),null);
 for(const extra of [{alertName:'a'.repeat(101)},{message:'m'.repeat(501)},{alertName:'bad\nname'}])assert.ok(technicalConfigError({...make(),...extra}));
});
