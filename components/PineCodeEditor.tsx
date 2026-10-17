"use client";
import { useEffect, useRef, useState } from 'react';
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js';

type Props = { value:string; onChange:(value:string)=>void; error?:string|null; theme?:string; onSave:()=>void; onRun:()=>void };
let languageReady = false;
const reference:Record<string,string> = {
 'indicator':'Declare an indicator. indicator("My indicator", overlay=true)',
 'strategy':'Declare a strategy. Historical execution is simulated on supplied candles.',
 'plot':'Plot a numerical series with a title, color and linewidth.',
 'hline':'Draw a constant horizontal level.',
 'alertcondition':'Declare a condition. Notifications require separately configured app alerts.',
 'input.int':'Integer input with optional minval and maxval.',
 'input.float':'Numeric input with optional minval, maxval and step.',
 'input.bool':'Boolean script input.', 'input.source':'Select an OHLCV source.',
 'ta.sma':'Simple moving average: ta.sma(source, length).',
 'ta.ema':'Exponential moving average: ta.ema(source, length).',
 'ta.rsi':'Relative strength index: ta.rsi(source, length).',
 'ta.atr':'Average true range: ta.atr(length).',
 'ta.crossover':'True when the first series crosses above the second.',
 'ta.crossunder':'True when the first series crosses below the second.',
 'ta.highest':'Highest value over a lookback.', 'ta.lowest':'Lowest value over a lookback.',
 'request.security':'Evaluate an expression for another symbol/timeframe when data is available.',
 'strategy.entry':'Create a simulated strategy entry.', 'strategy.exit':'Create a simulated strategy exit.',
 'strategy.close':'Close a simulated strategy position.',
 'close':'Current candle close.', 'open':'Current candle open.', 'high':'Current candle high.',
 'low':'Current candle low.', 'volume':'Current candle volume.', 'bar_index':'Zero-based index of the current bar.',
};
function configureLanguage(monaco:typeof Monaco){
 if(languageReady)return;
 languageReady=true;
 monaco.languages.register({id:'papertrade-pine'});
 monaco.languages.setLanguageConfiguration('papertrade-pine',{
  comments:{lineComment:'//'},brackets:[['(',')'],['[',']']],
  autoClosingPairs:[{open:'(',close:')'},{open:'[',close:']'},{open:'"',close:'"'},{open:"'",close:"'"}],
  indentationRules:{increaseIndentPattern:/^\s*(if|else|for|while|switch|.*=>)\b.*$/,decreaseIndentPattern:/^\s*else\b/},
  folding:{offSide:true},wordPattern:/[a-zA-Z_][\w.]*/,
 });
 monaco.languages.setMonarchTokensProvider('papertrade-pine',{
  keywords:['indicator','strategy','if','else','for','while','switch','var','varip','and','or','not','import','export','type','method','true','false','na'],
  tokenizer:{root:[[/\/\/.*$/,'comment'],[/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/,'string'],[/#[\da-fA-F]{6,8}/,'number.hex'],[/\b(?:\d*\.)?\d+\b/,'number'],[/\b(?:ta|math|input|request|strategy|color|array|string|str)\.[\w]+/,'type.identifier'],[/[a-zA-Z_]\w*/,{cases:{'@keywords':'keyword','@default':'identifier'}}],[/[()[\]]/,'@brackets'],[/[+\-*/%=<>?:]+/,'operator']]},
 });
 monaco.languages.registerCompletionItemProvider('papertrade-pine',{
  triggerCharacters:['.'],
  provideCompletionItems(model,position){const word=model.getWordUntilPosition(position);const range={startLineNumber:position.lineNumber,endLineNumber:position.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn};return{suggestions:Object.entries(reference).map(([label,documentation])=>({label,kind:monaco.languages.CompletionItemKind.Function,documentation,insertText:label,range}))};},
 });
 monaco.languages.registerHoverProvider('papertrade-pine',{
  provideHover(model,position){const word=model.getWordAtPosition(position);const description=word&&reference[word.word];return description?{contents:[{value:description}]}:null;},
 });
}
export function PineCodeEditor({value,onChange,error,theme,onSave,onRun}:Props){
 const host=useRef<HTMLDivElement>(null),editor=useRef<Monaco.editor.IStandaloneCodeEditor|null>(null),api=useRef<typeof Monaco|null>(null);
 const callbacks=useRef({onChange,onSave,onRun});
 const initial=useRef(value);
 const syncing=useRef(false);
 const [failed,setFailed]=useState('');
 const [ready,setReady]=useState(false);
 useEffect(()=>{callbacks.current={onChange,onSave,onRun};},[onChange,onSave,onRun]);
 useEffect(()=>{
  let disposed=false;let instance:Monaco.editor.IStandaloneCodeEditor|undefined;let model:Monaco.editor.ITextModel|undefined;
  let change:Monaco.IDisposable|undefined;
  void import('monaco-editor/esm/vs/editor/editor.api.js').then(async monaco=>{
   await import('monaco-editor/esm/vs/editor/editor.all.js');
   const {default:EditorWorker}=await import('monaco-editor/esm/vs/editor/editor.worker?worker');
   if(disposed||!host.current)return;
   (globalThis as typeof globalThis&{MonacoEnvironment?:{getWorker:()=>Worker}}).MonacoEnvironment={getWorker:()=>new EditorWorker()};
   configureLanguage(monaco);api.current=monaco;
   model=monaco.editor.createModel(initial.current,'papertrade-pine');
   instance=monaco.editor.create(host.current,{model,theme:'vs',editContext:false,automaticLayout:true,fontSize:13,lineHeight:22,fontFamily:'Consolas, "SFMono-Regular", monospace',minimap:{enabled:false},scrollBeyondLastLine:false,wordWrap:'off',padding:{top:14,bottom:14},lineNumbers:'on',glyphMargin:true,folding:true,bracketPairColorization:{enabled:true},matchBrackets:'always',renderLineHighlight:'line',quickSuggestions:true,suggestOnTriggerCharacters:true,tabSize:4,insertSpaces:true,ariaLabel:'Pine source code',fixedOverflowWidgets:true});
   editor.current=instance;
   change=instance.onDidChangeModelContent(()=>{if(!syncing.current)callbacks.current.onChange(instance!.getValue());});
   instance.addAction({id:'papertrade-save',label:'Save script',keybindings:[monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyS],run:()=>callbacks.current.onSave()});
   instance.addAction({id:'papertrade-run',label:'Add to chart',keybindings:[monaco.KeyMod.CtrlCmd|monaco.KeyCode.Enter],run:()=>callbacks.current.onRun()});
   setReady(true);
  }).catch(()=>{if(!disposed)setFailed('Code editor could not load. The plain text editor remains available.');});
  return()=>{disposed=true;change?.dispose();instance?.dispose();model?.dispose();editor.current=null;api.current=null;};
 },[]);
 useEffect(()=>{const instance=editor.current;if(instance&&instance.getValue()!==value){const model=instance.getModel();if(model){syncing.current=true;try{instance.executeEdits('script-load',[{range:model.getFullModelRange(),text:value}]);instance.pushUndoStop();}finally{syncing.current=false;}}}},[value,ready]);
 useEffect(()=>{api.current?.editor.setTheme(theme==='neon'?'vs-dark':'vs');},[theme,ready]);
 useEffect(()=>{const monaco=api.current,model=editor.current?.getModel();if(!monaco||!model)return;const match=error&&/(?:line\s*|:)(\d+)(?::(\d+))?/i.exec(error);monaco.editor.setModelMarkers(model,'pine-runtime',error?[{severity:monaco.MarkerSeverity.Error,message:error,startLineNumber:Math.min(model.getLineCount(),Number(match?.[1])||1),endLineNumber:Math.min(model.getLineCount(),Number(match?.[1])||1),startColumn:Number(match?.[2])||1,endColumn:Number(match?.[2])||2}]:[]);},[error,ready]);
 return <div className="pine-monaco-wrap">{failed?<><p role="alert">{failed}</p><textarea aria-label="Pine source code" value={value} onChange={event=>onChange(event.target.value)} spellCheck={false}/></>:<><div ref={host} className="pine-monaco"/>{!ready&&<p className="pine-code-loading" role="status">Loading code editor…</p>}</>}</div>;
}
