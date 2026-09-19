import test from 'node:test';
import assert from 'node:assert/strict';
import {positionAttention,alertAttention,homeOpenChange} from '../lib/home-attention.ts';
const now=1800000000000,instrument={symbol:'TEST',instrumentKey:'NSE_EQ|TEST'};
test('Home day change covers carry longs, shorts, partial exits and same-day additions without ledger writes',()=>{
 const noon=Date.parse('2026-09-18T12:00:00+05:30');
 const order=(side,quantity,price,createdAt)=>({symbol:'TEST',product:'DELIVERY',side,quantity,price,createdAt,status:'COMPLETE'});
 const mark={symbol:'TEST',product:'DELIVERY',price:120,previousClose:110};
 const orders=[order('BUY',10,80,noon-86400000),order('SELL',4,115,noon-60000),order('BUY',2,118,noon-1000)],copy=JSON.stringify(orders);
 assert.equal(homeOpenChange(orders,[mark],noon),64);assert.equal(JSON.stringify(orders),copy);
 assert.equal(homeOpenChange([order('SELL',10,80,noon-86400000),order('BUY',4,115,noon-60000)],[mark],noon),-60);
 assert.equal(homeOpenChange(orders,[{...mark,previousClose:null}],noon),null);
 assert.equal(homeOpenChange(orders,[{...mark,price:NaN}],noon),null);
 assert.equal(homeOpenChange([order('BUY',2,118,noon-1000)],[{...mark,previousClose:null}],noon),4);
 assert.equal(homeOpenChange([],[],noon),0);
});
test('position attention matches symbol, product and direction; it never changes protection',()=>{
 const positions=[{symbol:'TEST',product:'INTRADAY',side:'LONG',quantity:2}],protection={symbol:'TEST',product:'INTRADAY',side:'LONG',stopLossPrice:90};
 assert.equal(positionAttention(positions,[protection]).length,0);
 for(const patch of [{product:'DELIVERY'},{side:'SHORT'},{stopLossPrice:0},{stopLossPrice:NaN}])assert.equal(positionAttention(positions,[{...protection,...patch}]).length,1);
 assert.deepEqual(positionAttention(positions,[])[0].target,{kind:'position',symbol:'TEST',product:'INTRADAY'});assert.equal(protection.stopLossPrice,90);
});
test('attention is empty without relevant alerts; paused and expired rules do not claim monitoring',()=>{
 assert.deepEqual(alertAttention([],[],[],false,'Unavailable','',now),[]);
 for(const status of ['paused','expired','completed'])assert.deepEqual(alertAttention([],[{status,expiresAt:now+1000}],[],false,'Unavailable','',now),[]);
});
test('device and server monitoring are labelled honestly',()=>{
 const rule={id:'r',status:'active',expiresAt:now+1000,delivery:'server'};
 assert.match(alertAttention([],[rule],[],false,'Scheduler unavailable','',now)[0].detail,/Scheduler/);
 assert.deepEqual(alertAttention([],[rule],[],true,'Ready','',now),[]);
 const device={...rule,delivery:'device'};assert.match(alertAttention([],[device],[],true,'Ready','',now)[0].title,/app open/);
 assert.match(alertAttention([],[device],[],false,'Disabled','',now)[0].title,/Closed-app monitoring unavailable/);
});
test('only latest recent triggered alert is linked, by exact id; orders and future/old events excluded',()=>{
 const tasks=[{id:'p',kind:'alert',status:'triggered',completedAt:now-5000,instrument,condition:'above',price:100},{id:'order',kind:'order',status:'filled',completedAt:now,instrument}];
 const event={id:'t',kind:'trigger',createdAt:now-1000,instrument,description:'RSI above 70'};
 assert.equal(alertAttention(tasks,[],[event],true,'','',now)[0].target.id,'t');
 for(const at of [now+1,now-86400000])assert.equal(alertAttention(tasks,[],[{...event,createdAt:at}],true,'','',now)[0].target.id,'p');
 assert.equal(alertAttention([],[],[{...event,kind:'expired'}],true,'','',now).length,0);
});
