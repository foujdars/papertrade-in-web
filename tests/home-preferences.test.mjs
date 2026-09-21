import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHomePreferences,rememberHomeSearch,deferHomeReminder,isHomeReminderHidden,homePreferenceKey,HOME_REMIND_LATER_MS} from '../lib/home-preferences.ts';
import {positionAttention,alertAttention} from '../lib/home-attention.ts';

const now=1800000000000;
const item={id:'test',title:'Review',detail:'Details',tone:'info',target:{kind:'alerts',tab:'list'}};
test('Home preferences tolerate damaged storage and scope each account',()=>{
 assert.deepEqual(normalizeHomePreferences(null),{privateBalances:false,market:'india',recentSearches:[],reminders:{}});
 assert.deepEqual(normalizeHomePreferences({privateBalances:'true',recentSearches:['A',null,'A','B','C','D'],reminders:{bad:{until:'later'}}},now),{privateBalances:false,market:'india',recentSearches:['A','B','C'],reminders:{}});
 assert.notEqual(homePreferenceKey('a'),homePreferenceKey('b'));
});
test('Home remembers only a valid market choice',()=>{
 assert.equal(normalizeHomePreferences({market:'global'}).market,'global');
 assert.equal(normalizeHomePreferences({market:'unknown'}).market,'india');
});
test('Home searches keep only three most recent unique selections',()=>{
 let prefs=normalizeHomePreferences(null);for(const symbol of ['A','B','C','D','B'])prefs=rememberHomeSearch(prefs,symbol);
 assert.deepEqual(prefs.recentSearches,['B','D','C']);
});
test('review affects only Home, persists and resurfaces on changed details or target',()=>{
 const prefs=normalizeHomePreferences(null),before=JSON.stringify(item);
 const reviewed=deferHomeReminder(prefs,item,true,now);
 assert.ok(isHomeReminderHidden(normalizeHomePreferences(JSON.parse(JSON.stringify(reviewed)),now),item,now+86400000));
 for(const change of [{detail:'Changed'},{tone:'warning'},{target:{kind:'alerts',tab:'log'}}])assert.equal(isHomeReminderHidden(reviewed,{...item,...change},now),false);
 assert.equal(JSON.stringify(item),before);assert.deepEqual(prefs.reminders,{});
});
test('snoozed reminder expires exactly after one hour and returns earlier on change',()=>{
 const prefs=deferHomeReminder(normalizeHomePreferences(null),item,false,now);
 assert.ok(isHomeReminderHidden(prefs,item,now+HOME_REMIND_LATER_MS-1));
 assert.equal(isHomeReminderHidden(prefs,item,now+HOME_REMIND_LATER_MS),false);
 assert.equal(isHomeReminderHidden(prefs,{...item,detail:'New warning'},now+1),false);
 assert.deepEqual(normalizeHomePreferences(prefs,now+HOME_REMIND_LATER_MS).reminders,{});
});
test('a direction or quantity change resurfaces a reviewed position',()=>{
 const position={symbol:'TEST',product:'INTRADAY',side:'LONG',quantity:2};
 const initial=positionAttention([position],[])[0],prefs=deferHomeReminder(normalizeHomePreferences(null),initial,true,now);
 for(const patch of [{quantity:3},{side:'SHORT'}])assert.equal(isHomeReminderHidden(prefs,positionAttention([{...position,...patch}],[])[0],now),false);
 const newFill={id:'new-entry',status:'COMPLETE',symbol:'TEST',product:'INTRADAY'};
 assert.equal(isHomeReminderHidden(prefs,positionAttention([position],[],[newFill])[0],now),false);
});
test('replacing a device alert resurfaces monitoring even when the count stays the same',()=>{
 const rule={id:'old',status:'active',delivery:'device',expiresAt:now+100000};
 const initial=alertAttention([],[rule],[],false,'','',now)[0];
 const prefs=deferHomeReminder(normalizeHomePreferences(null),initial,true,now);
 const changed=alertAttention([],[{...rule,id:'new'}],[],false,'','',now)[0];
 assert.equal(isHomeReminderHidden(prefs,changed,now),false);
});
