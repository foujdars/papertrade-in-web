import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import postcss from 'postcss';
test('every desktop theme selector is constrained to desktop mouse browser Trade/F&O',()=>{
 const root=postcss.parse(fs.readFileSync(new URL('../app/tradingview-desktop.css',import.meta.url),'utf8'));
 let count=0;
 root.walkRules(rule=>{
  count++;
  for(const selector of rule.selectors){assert.match(selector,/^\.terminal-shell\[data-platform="web"\]\[data-section="(?:trade|fno)"\]/,selector);}
  let parent=rule.parent,guarded=false;
  while(parent){if(parent.type==='atrule'&&parent.name==='media'&&/min-width:\s*941px/.test(parent.params)&&/hover:\s*hover/.test(parent.params)&&/pointer:\s*fine/.test(parent.params))guarded=true;parent=parent.parent;}
  assert.equal(guarded,true,rule.selector);
 });
 assert.ok(count>30);
});
