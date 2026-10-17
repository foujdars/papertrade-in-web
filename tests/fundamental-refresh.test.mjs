import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveFundamentalReviews } from '../lib/fundamental-refresh.ts';
const row=(overrides={})=>({id:'old:0',isin:'INE002A01018',nseCode:'TEST',bseCode:'500001',decision:'pending',notes:'',metrics:{marketCapCr:null},...overrides});
test('refresh keeps uniquely matched research decisions and notes while replacing fundamentals',()=>{
 const next=row({id:'new:9',metrics:{marketCapCr:1500}}),previous=row({decision:'rejected',notes:'Review debt first'});
 const result=preserveFundamentalReviews([next],[previous])[0];assert.equal(result.decision,'rejected');assert.equal(result.notes,'Review debt first');assert.equal(result.metrics.marketCapCr,1500);assert.equal(result.id,'new:9');assert.equal(next.decision,'pending');
});
test('refresh does not transfer reviews across ambiguous or unrelated companies',()=>{
 const next=row(),previous=row({decision:'approved'});assert.equal(preserveFundamentalReviews([next],[previous,previous])[0].decision,'pending');assert.equal(preserveFundamentalReviews([next],[row({isin:'OTHER',decision:'approved'})])[0].decision,'pending');
});
test('a listing code can recover a review when both versions lack ISIN',()=>{
 assert.equal(preserveFundamentalReviews([row({isin:''})],[row({isin:'',decision:'approved'})])[0].decision,'approved');
 assert.equal(preserveFundamentalReviews([row({isin:'',nseCode:'',bseCode:''})],[row({isin:'',nseCode:'',bseCode:'',decision:'approved'})])[0].decision,'pending');
});
