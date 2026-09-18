import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesIpoFilter, normalizeIpoChoices, normalizeSavedIpos, validIpoDay, ipoEvents, nextIpoEvent, sortExplorerIpos } from '../lib/ipo-explorer.ts';
import { normalizePnlScope, readPreference, writePreference } from '../lib/interface-preferences.ts';
import { loadPublicGmpFeed } from '../lib/ipo-gmp-server.ts';
const ipo=(extra={})=>({id:'alpha',name:'Alpha IPO',symbol:'ALPHA',status:'open',issueType:'regular',issueSizeCrore:100,biddingStartDate:'2026-09-15',biddingEndDate:'2026-09-18',details:{dailyEndTime:'17:00:00',allotmentDate:'2026-09-21',listingDate:'2026-09-23'},...extra});
test('Explore filters never mix waiting or published allotments with open bidding',()=>{
 for(const stage of ['open','upcoming','waiting','allotted','listed'])for(const filter of ['open','upcoming','allotment','listed'])assert.equal(matchesIpoFilter(stage,filter),filter==='allotment'?['waiting','allotted'].includes(stage):stage===filter);
});
test('IPO preferences validate enums and retain the deliberate view and board',()=>{
 assert.deepEqual(normalizeIpoChoices({board:'sme',view:'saved',sort:'size',filter:'allotment'}),{board:'sme',view:'saved',sort:'size',filter:'allotment'});
 assert.deepEqual(normalizeIpoChoices({board:'bad',view:4,sort:null,filter:'all'}),{board:'regular',view:'explore',sort:'event',filter:'open'});
});
test('Saved IPOs are bounded, deduplicated identifiers, not application records',()=>{
 assert.deepEqual(normalizeSavedIpos(null),[]);
 assert.deepEqual(normalizeSavedIpos([{id:'a',name:'A',pan:'not retained'},{id:'a',name:'Duplicate'},{id:'',name:'Empty'},null,{id:'b',name:'B'}]),[{id:'a',name:'A'},{id:'b',name:'B'}]);
 assert.equal(normalizeSavedIpos(Array.from({length:510},(_,i)=>({id:String(i),name:'Issue'}))).length,500);
});
test('Calendar does not invent dates or convert expected dates into publication proof',()=>{
 assert.equal(validIpoDay('2026-02-30'),false);assert.equal(validIpoDay('bad'),false);assert.equal(validIpoDay('2026-09-18'),true);
 const rows=ipoEvents([ipo({details:{allotmentDate:'2026-09-16',allotmentPublished:true,listingDate:'2026-09-17'}})],'2026-09-18','18:00:00');
 assert.equal(rows.find(e=>e.kind==='allotment').label,'Expected allotment');assert.equal(rows.find(e=>e.kind==='listing').expected,true);
 assert.equal(ipoEvents([ipo({biddingStartDate:'',biddingEndDate:'bad',details:{allotmentDate:'2026-02-30'}})],'2026-09-18').length,0);
 const listed=ipoEvents([ipo({status:'listed'})],'2026-09-24');assert.equal(listed.find(e=>e.kind==='listing').label,'Listed');
});
test('Next milestone and sorting preserve originals and put unknown dates last',()=>{
 assert.equal(nextIpoEvent(ipo(),'open','2026-09-18').label,'Closes today');
 const rows=[ipo({id:'z',name:'Zulu',issueSizeCrore:50,biddingEndDate:'2026-09-20'}),ipo(),ipo({id:'u',name:'Unknown',status:'closed',details:{}})];
 assert.deepEqual(sortExplorerIpos(rows,'event','2026-09-18','12:00:00').map(x=>x.id),['alpha','z','u']);
 assert.equal(sortExplorerIpos(rows,'size','2026-09-18','12:00:00')[0].id,'alpha');assert.equal(rows[0].id,'z');
});
test('P&L stored choices validate dates and discard transient day drill-down',()=>{
 const scope=normalizePnlScope({period:'custom',asset:'fno',product:'INTRADAY',start:'2026-09-01',end:'2026-09-18',day:'2026-09-03'});
 assert.equal(scope.period,'custom');assert.equal(scope.day,undefined);assert.equal(scope.asset,'fno');assert.equal(scope.product,'INTRADAY');
 assert.equal(normalizePnlScope({period:'custom',start:'2026-09-19',end:'2026-09-18'}).period,'all');
 assert.equal(normalizePnlScope({period:'custom',start:'2026-02-30',end:'2026-09-18'}).period,'all');
 assert.equal(readPreference('missing'),null);assert.equal(writePreference('missing',{}),false);
});
test('Cached GMP retains its actual check time instead of claiming a new publication',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('<div class="ipg-gp-card-top"><a class="ipg-gp-card-name">Alpha IPO GMP</a><div class="ipg-gp-card-gmp"><span class="ipg-gp-card-val">₹5</span></div>');};
 try{const first=await loadPublicGmpFeed(),second=await loadPublicGmpFeed();assert.equal(calls,1);assert.ok(Number.isFinite(Date.parse(first[0].checkedAt)));assert.equal(first[0].checkedAt,second[0].checkedAt);assert.equal(first[0].updatedAt,undefined);}finally{globalThis.fetch=original;}
});
