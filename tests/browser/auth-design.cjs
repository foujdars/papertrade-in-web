/* eslint-disable @typescript-eslint/no-require-imports -- Isolated presentation regression harness. */
// Render the real signed-out AuthProvider with a fixture-only Supabase configuration.
const path=require('node:path'),fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const repo=process.cwd(),esbuild=require(path.join(repo,'node_modules/esbuild'));
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const bundle=await esbuild.build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {AuthProvider} from './components/AuthProvider';createRoot(document.getElementById('root')).render(<AuthProvider><span>Authenticated</span></AuthProvider>);",resolveDir:repo,loader:'jsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_SUPABASE_URL':'"https://design-fixture.supabase.co"','process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY':'"fixture-public-key"','process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY':'""','process.env':'{}'},plugins:[{name:'framework-elements',setup(build){
  // Framework link/image wrappers are native elements in this standalone renderer.
  build.onResolve({filter:/^next\/(image|link)$/},args=>({path:args.path,namespace:'framework'}));
  build.onLoad({filter:/.*/,namespace:'framework'},args=>({resolveDir:repo,loader:'jsx',contents:args.path==='next/image'?'import React from "react";export default function Image({priority,unoptimized,...props}){return <img {...props}/>;}':'import React from "react";export default function Link(props){return <a {...props}/>;}'}));
 }}]});
 const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
 const server=http.createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','application/javascript');return res.end(bundle.outputFiles[0].text);}if(req.url.endsWith('.png')){res.setHeader('Content-Type','image/png');return res.end(fs.readFileSync(path.join(repo,'public',req.url)));}res.setHeader('Content-Type','text/html');res.end(`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/fixture.js"></script>`);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const launch={headless:true};if(process.env.CHROMIUM_PACKAGE){const pkg=require(process.env.CHROMIUM_PACKAGE),binary=pkg.default||pkg;Object.assign(launch,{executablePath:await binary.executablePath(),args:binary.args});}
 const browser=await chromium.launch(launch);
 const shots=process.env.DESIGN_SCREENSHOTS;if(shots)fs.mkdirSync(shots,{recursive:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*.supabase.co/**',r=>r.abort());await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('.auth-screen').waitFor().catch(async error=>{console.error({errors,body:await page.locator('body').innerText()});throw error;});
 for(const colorScheme of ['light','dark']){await page.emulateMedia({colorScheme});for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.locator('.auth-screen').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.getByRole('button',{name:'Continue with Google'}).waitFor();if(shots&&width===390)await page.screenshot({path:`${shots}/auth-${colorScheme}.png`});}}
 assert.deepEqual(errors,[]);
 if(process.env.TEST_BASE_URL)for(let attempt=0;attempt<60;attempt++){try{if((await fetch(process.env.TEST_BASE_URL)).ok)break;}catch{}if(attempt===59)throw new Error('App server unavailable');await new Promise(resolve=>setTimeout(resolve,1000));}
 if(process.env.TEST_BASE_URL)for(const route of ['privacy','terms','delete-account']){for(const colorScheme of ['light','dark']){await page.emulateMedia({colorScheme});await page.setViewportSize({width:390,height:844});await page.goto(`${process.env.TEST_BASE_URL}/${route}`);await page.locator('main article h1').waitFor();assert.ok(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1));if(shots&&route==='privacy')await page.screenshot({path:`${shots}/privacy-${colorScheme}.png`});}}
 assert.deepEqual(errors,[]);
 console.log('PASS: real signed-out AuthProvider layout at 320/390/1280 in both device themes; optional legal/account routes checked when TEST_BASE_URL is set. No sign-in or account mutation performed.');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
