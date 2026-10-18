const {setChartColor,chartColorValue}=require('./chart-color-helper.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const output=path.resolve(process.env.CHART_UI_QA_OUTPUT_DIR||'work/chart-settings-qa');fs.mkdirSync(output,{recursive:true});
(async()=>{
  const {createServer}=await import('vite');
  const server=await createServer({configFile:false,root:process.cwd(),appType:'custom',cacheDir:'node_modules/.vite-chart-settings-qa',resolve:{alias:{'@':process.cwd()}},optimizeDeps:{include:['react','react-dom/client','react/jsx-dev-runtime','lucide-react']},server:{host:'127.0.0.1',port:3273,strictPort:true,watch:{ignored:['**/*']}},plugins:[{name:'chart-settings-qa',configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(req.url!=='/')return next();
    const cssFiles=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,name])=>name);
    if(!cssFiles.includes('desktop-chart-settings.css'))cssFiles.push('desktop-chart-settings.css');
    const css=cssFiles.map(name=>fs.readFileSync('app/'+name,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
    const html=await server.transformIndexHtml('/',`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}.terminal-shell{display:block!important;min-height:100dvh}</style><div id="root"></div><script type="module" src="/tests/browser/chart-settings.fixture.jsx"></script>`);
    res.setHeader('Content-Type','text/html');res.end(html);
  });}}]});
  await server.listen();const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:3273');
    const open=page.getByRole('button',{name:'Open chart settings',exact:true});await open.click();
    const dialog=page.getByRole('dialog',{name:'Chart settings',exact:true});await dialog.waitFor();
    await dialog.getByRole('button',{name:'Up candle color',exact:true}).click();await page.getByRole('dialog',{name:'Up candle color palette',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true,'Escape dismisses only the nested colour palette');
    await setChartColor(page,dialog,'Up candle color','#112233');
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('papertrade-desktop-chart-settings-v1')),null);
    assert.equal(await open.evaluate(node=>node===document.activeElement),true);
    await open.click();await setChartColor(page,dialog,'Up candle color','#123456');
    await dialog.getByRole('tab',{name:'Scales and lines',exact:true}).click();
    await dialog.getByLabel('Price scale mode',{exact:true}).selectOption('log');await dialog.getByLabel('Invert scale',{exact:false}).check();
    await dialog.getByLabel('Top scale margin',{exact:true}).fill('22');await dialog.getByRole('button',{name:'Apply',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>{const value=JSON.parse(localStorage.getItem('papertrade-desktop-chart-settings-v1'));return[value.upColor,value.scaleMode,value.invertScale,value.scaleMarginTop];}),['#123456','log',true,22]);
    await dialog.getByRole('tab',{name:'Templates',exact:true}).click();await dialog.getByLabel('Template name',{exact:true}).fill('Evening charts');await dialog.getByRole('button',{name:'Save',exact:true}).click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-desktop-chart-templates-v1')).length),1);
    await dialog.getByRole('button',{name:'Defaults',exact:true}).click();await dialog.getByRole('button',{name:'Apply',exact:true}).click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-desktop-chart-settings-v1')).scaleMode),'normal');
    await dialog.getByRole('button',{name:'Load Evening charts template',exact:true}).click();await dialog.getByRole('button',{name:'Apply',exact:true}).click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-desktop-chart-settings-v1')).scaleMode),'log');
    await dialog.getByRole('tab',{name:'Symbol',exact:true}).click();await page.screenshot({path:path.join(output,'chart-settings-symbol-light.png')});
    await page.keyboard.press('End');assert.equal(await dialog.getByRole('tab',{name:'Templates',exact:true}).getAttribute('aria-selected'),'true');
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Toggle theme',exact:true}).click();await open.click();
    await dialog.getByRole('tab',{name:'Canvas',exact:true}).click();await dialog.getByLabel('Vertical grid lines',{exact:true}).uncheck();await setChartColor(page,dialog,'Chart background color','#141924');
    await page.screenshot({path:path.join(output,'chart-settings-canvas-dark.png')});await dialog.getByRole('button',{name:'OK',exact:true}).click();
    await page.reload();await open.click();await dialog.getByRole('tab',{name:'Canvas',exact:true}).click();assert.equal(await dialog.getByLabel('Vertical grid lines',{exact:true}).isChecked(),false);assert.equal(await chartColorValue(dialog,'Chart background color'),'#141924');
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Open object tree',exact:true}).click();
    const tree=page.getByRole('dialog',{name:'Drawing object tree',exact:true});await tree.getByLabel('Search drawing objects',{exact:true}).fill('support');assert.equal(await tree.locator('.drawing-object-row').count(),1);
    await tree.getByRole('button',{name:'Hide matching drawings',exact:true}).click();assert.equal(await tree.getByRole('button',{name:'Show Horizontal ray',exact:true}).count(),1);assert.equal(await page.evaluate(()=>window.qaBatchCount),1);
    await tree.getByRole('button',{name:'Clear drawing search',exact:true}).click();await tree.getByLabel('Filter drawing objects',{exact:true}).selectOption('study');assert.equal(await tree.locator('.drawing-object-row').count(),1);
    assert.equal(await tree.getByRole('button',{name:'Settings for Horizontal line',exact:true}).isDisabled(),true);await tree.getByRole('button',{name:'Unlock matching drawings',exact:true}).click();assert.equal(await tree.getByRole('button',{name:'Settings for Horizontal line',exact:true}).isDisabled(),false);
    await tree.getByLabel('Filter drawing objects',{exact:true}).selectOption('all');await page.screenshot({path:path.join(output,'chart-object-tree.png')});await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Open legacy drawings',exact:true}).click();const legacy=page.getByRole('dialog',{name:'Chart drawings',exact:true});assert.equal(await legacy.getByLabel('Search drawing objects',{exact:true}).count(),0);assert.equal(await legacy.getAttribute('class'),'drawing-objects');await page.keyboard.press('Escape');

    // Simulate quota/privacy failures independently for each storage key. A successful
    // template write or another-tab update must never roll back unsaved settings.
    await page.evaluate(()=>{
      window.qaStorage={set:Storage.prototype.setItem,get:Storage.prototype.getItem};window.qaWriteFailures=['papertrade-desktop-chart-settings-v1'];window.qaReadFailures=[];
      Storage.prototype.setItem=function(key,value){if(window.qaWriteFailures.includes(key))throw new DOMException('Quota exceeded','QuotaExceededError');return window.qaStorage.set.call(this,key,value);};
      Storage.prototype.getItem=function(key){if(window.qaReadFailures.includes(key))throw new DOMException('Storage blocked','SecurityError');return window.qaStorage.get.call(this,key);};
    });
    const persistedUp=await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-desktop-chart-settings-v1')).upColor);
    await open.click();await setChartColor(page,dialog,'Up candle color','#334455');await dialog.getByRole('button',{name:'OK',exact:true}).click();
    await dialog.getByRole('alert').waitFor();assert.match(await dialog.getByRole('alert').innerText(),/Could not save chart settings.*session only/);assert.equal(await dialog.isVisible(),true);assert.equal(await dialog.getByRole('button',{name:'Apply',exact:true}).isEnabled(),true);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-desktop-chart-settings-v1')).upColor),persistedUp);
    await dialog.getByRole('tab',{name:'Templates',exact:true}).click();await dialog.getByLabel('Template name',{exact:true}).fill('Durable template');await dialog.getByRole('button',{name:'Save',exact:true}).click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-desktop-chart-templates-v1')).some(item=>item.name==='Durable template')),true);
    await page.evaluate(()=>{
      window.qaReadFailures=['papertrade-desktop-chart-settings-v1'];
      const key='papertrade-desktop-chart-templates-v1',items=JSON.parse(localStorage.getItem(key));items.push({id:'another-tab',name:'Another tab',savedAt:Date.now(),settings:items[0].settings});localStorage.setItem(key,JSON.stringify(items));window.dispatchEvent(new StorageEvent('storage',{key}));
    });
    await dialog.getByRole('button',{name:'Load Another tab template',exact:true}).waitFor();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await open.click();assert.equal(await chartColorValue(dialog,'Up candle color'),'#334455');
    await page.evaluate(()=>{window.qaReadFailures=[];window.qaWriteFailures=['papertrade-desktop-chart-templates-v1'];});
    await dialog.getByRole('button',{name:'Apply',exact:true}).click();assert.equal(await dialog.getByRole('alert').count(),0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-desktop-chart-settings-v1')).upColor),'#334455');

    // A failed template save remains explicitly session-only across successful settings
    // writes, cross-tab settings updates, dialog closes, and temporarily blocked reads.
    await dialog.getByRole('tab',{name:'Templates',exact:true}).click();await dialog.getByLabel('Template name',{exact:true}).fill('Session template');await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.getByRole('alert').waitFor();
    assert.match(await dialog.getByRole('alert').innerText(),/Could not save templates.*session only/);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-desktop-chart-templates-v1')).some(item=>item.name==='Session template')),false);
    await dialog.getByRole('tab',{name:'Symbol',exact:true}).click();await setChartColor(page,dialog,'Up candle color','#556677');await dialog.getByRole('button',{name:'Apply',exact:true}).click();
    await page.evaluate(()=>{const key='papertrade-desktop-chart-settings-v1',settings=JSON.parse(localStorage.getItem(key));settings.upColor='#667788';localStorage.setItem(key,JSON.stringify(settings));window.dispatchEvent(new StorageEvent('storage',{key}));window.qaReadFailures=['papertrade-desktop-chart-settings-v1','papertrade-desktop-chart-templates-v1'];});
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await open.click();await dialog.getByRole('tab',{name:'Templates',exact:true}).click();await dialog.getByRole('button',{name:'Load Session template template',exact:true}).waitFor();assert.match(await dialog.getByRole('alert').innerText(),/session only/);
    await page.evaluate(()=>{window.qaReadFailures=[];window.qaWriteFailures=[];});await dialog.getByRole('button',{name:'Retry saving templates',exact:true}).click();assert.equal(await dialog.getByRole('alert').count(),0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-desktop-chart-templates-v1')).some(item=>item.name==='Session template')),true);
    await dialog.getByRole('button',{name:'OK',exact:true}).click();await page.reload();await open.click();await dialog.getByRole('tab',{name:'Templates',exact:true}).click();await dialog.getByRole('button',{name:'Load Session template template',exact:true}).waitFor();assert.equal(await dialog.getByRole('alert').count(),0);
    assert.deepEqual(errors,[]);console.log('Chart settings UI passed: staged Cancel/Apply, persisted colors and axes, template save/load, keyboard tabs/focus/Escape, dark theme, object search/filter/batch, legacy dialog preservation, failed storage/session-only warnings, independent-key recovery and retry.');
  }finally{await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
