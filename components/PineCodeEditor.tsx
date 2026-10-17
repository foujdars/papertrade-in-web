"use client";
import { useEffect, useRef, useState } from 'react';
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import { PINE_REFERENCE, pineCallAt, pineErrorLocation } from '@/lib/pine-language';

export type PineEditorCommand = { id:number; type:'find'|'replace'|'goto'|'undo'|'redo'|'diagnostic' };
export type PineEditorPosition = { line:number; column:number };
type Props = { value:string; onChange:(value:string)=>void; error?:string|null; theme?:string; onSave:()=>void; onRun:()=>void; command?:PineEditorCommand; onPositionChange?:(position:PineEditorPosition)=>void };
let languageReady = false;
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
  tokenizer:{root:[[/\/\/.*$/,'comment'],[/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/,'string'],[/#[\da-fA-F]{6,8}/,'number.hex'],[/\b(?:\d*\.)?\d+\b/,'number'],[/\b(?:ta|math|input|request|strategy|color|array|string|str|line|label|box|table|matrix|map|log|barstate|syminfo|timeframe)\.[\w]+/,'type.identifier'],[/[a-zA-Z_]\w*/,{cases:{'@keywords':'keyword','@default':'identifier'}}],[/[()[\]]/,'@brackets'],[/[+\-*/%=<>?:]+/,'operator']]},
 });
 monaco.languages.registerCompletionItemProvider('papertrade-pine',{
  triggerCharacters:['.'],
  provideCompletionItems(model,position){
   const word=model.getWordUntilPosition(position);const range={startLineNumber:position.lineNumber,endLineNumber:position.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn};
   const suggestions:PineCompletion[]=PINE_REFERENCE.map(item=>({label:item.name,kind:item.variable?monaco.languages.CompletionItemKind.Variable:monaco.languages.CompletionItemKind.Function,detail:item.signature,documentation:item.description,insertText:item.snippet??item.name,insertTextRules:item.snippet?monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet:undefined,range}));
   const names=new Set(PINE_REFERENCE.map(item=>item.name));
   for(const match of model.getValue().matchAll(/^\s*(?:(?:var|varip|float|int|bool|string|color)\s+)*([a-zA-Z_]\w*)\s*(?:=|\([^\n]*\)\s*=>)/gm)){
    if(!names.has(match[1])){names.add(match[1]);suggestions.push({label:match[1],kind:monaco.languages.CompletionItemKind.Variable,detail:'Script symbol',insertText:match[1],range});}
   }
   return {suggestions};
  },
 });
 monaco.languages.registerHoverProvider('papertrade-pine',{
  provideHover(model,position){const word=model.getWordAtPosition(position);const item=PINE_REFERENCE.find(entry=>entry.name===word?.word);return item?{contents:[{value:`\`\`\`pine\n${item.signature}\n\`\`\``},{value:item.description}]}:null;},
 });
 monaco.languages.registerSignatureHelpProvider('papertrade-pine',{
  signatureHelpTriggerCharacters:['(', ','],signatureHelpRetriggerCharacters:[','],
  provideSignatureHelp(model,position){
   const call=pineCallAt(model.getValueInRange({startLineNumber:1,startColumn:1,endLineNumber:position.lineNumber,endColumn:position.column}));
   const item=PINE_REFERENCE.find(entry=>entry.name===call?.name&&!entry.variable);if(!call||!item)return null;
   const parameters=item.signature.slice(item.signature.indexOf('(')+1,-1).split(',').filter(Boolean).map(label=>({label:label.trim()}));
   return {value:{signatures:[{label:item.signature,documentation:item.description,parameters}],activeSignature:0,activeParameter:Math.min(call.parameter,Math.max(0,parameters.length-1))},dispose(){}};
  },
 });
}
type PineCompletion=Monaco.languages.CompletionItem;
export function PineCodeEditor({value,onChange,error,theme,onSave,onRun,command,onPositionChange}:Props){
 const host=useRef<HTMLDivElement>(null),editor=useRef<Monaco.editor.IStandaloneCodeEditor|null>(null),api=useRef<typeof Monaco|null>(null);
 const callbacks=useRef({onChange,onSave,onRun,onPositionChange,error});
 const initial=useRef(value);
 const syncing=useRef(false);
 const [failed,setFailed]=useState('');
 const [ready,setReady]=useState(false);
 useEffect(()=>{callbacks.current={onChange,onSave,onRun,onPositionChange,error};},[onChange,onSave,onRun,onPositionChange,error]);
 useEffect(()=>{
  let disposed=false;let instance:Monaco.editor.IStandaloneCodeEditor|undefined;let model:Monaco.editor.ITextModel|undefined;
  let change:Monaco.IDisposable|undefined;let cursor:Monaco.IDisposable|undefined;
  void import('monaco-editor/esm/vs/editor/editor.api.js').then(async monaco=>{
   await import('monaco-editor/esm/vs/editor/editor.all.js');
   const {default:EditorWorker}=await import('monaco-editor/esm/vs/editor/editor.worker?worker');
   if(disposed||!host.current)return;
   (globalThis as typeof globalThis&{MonacoEnvironment?:{getWorker:()=>Worker}}).MonacoEnvironment={getWorker:()=>new EditorWorker()};
   configureLanguage(monaco);api.current=monaco;
   model=monaco.editor.createModel(initial.current,'papertrade-pine');
   instance=monaco.editor.create(host.current,{model,theme:'vs',editContext:false,automaticLayout:true,fontSize:13,lineHeight:21,fontFamily:'Consolas, "SFMono-Regular", monospace',minimap:{enabled:false},scrollBeyondLastLine:false,wordWrap:'off',padding:{top:8,bottom:8},lineNumbers:'on',glyphMargin:true,folding:true,bracketPairColorization:{enabled:true},matchBrackets:'always',renderLineHighlight:'line',quickSuggestions:true,suggestOnTriggerCharacters:true,parameterHints:{enabled:true},tabSize:4,insertSpaces:true,ariaLabel:'Pine source code',fixedOverflowWidgets:true});
   editor.current=instance;
   change=instance.onDidChangeModelContent(()=>{if(!syncing.current)callbacks.current.onChange(instance!.getValue());});
   cursor=instance.onDidChangeCursorPosition(event=>callbacks.current.onPositionChange?.({line:event.position.lineNumber,column:event.position.column}));
   instance.addAction({id:'papertrade-save',label:'Save script',keybindings:[monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyS],run:()=>callbacks.current.onSave()});
   instance.addAction({id:'papertrade-run',label:'Add to chart',keybindings:[monaco.KeyMod.CtrlCmd|monaco.KeyCode.Enter],run:()=>callbacks.current.onRun()});
   setReady(true);
  }).catch(()=>{if(!disposed)setFailed('Code editor could not load. The plain text editor remains available.');});
  return()=>{disposed=true;change?.dispose();cursor?.dispose();instance?.dispose();model?.dispose();editor.current=null;api.current=null;};
 },[]);
 useEffect(()=>{const instance=editor.current;if(instance&&instance.getValue()!==value){const model=instance.getModel();if(model){syncing.current=true;try{instance.executeEdits('script-load',[{range:model.getFullModelRange(),text:value}]);instance.pushUndoStop();}finally{syncing.current=false;}}}},[value,ready]);
 useEffect(()=>{api.current?.editor.setTheme(theme==='neon'?'vs-dark':'vs');},[theme,ready]);
 useEffect(()=>{const monaco=api.current,model=editor.current?.getModel();if(!monaco||!model)return;const position=pineErrorLocation(error,model.getLineCount());monaco.editor.setModelMarkers(model,'pine-runtime',error?[{severity:monaco.MarkerSeverity.Error,message:error,startLineNumber:position.line,endLineNumber:position.line,startColumn:position.column,endColumn:model.getLineMaxColumn(position.line)}]:[]);},[error,ready]);
 useEffect(()=>{
  const instance=editor.current;if(!instance||!command)return;
  instance.focus();
  if(command.type==='diagnostic'){const position=pineErrorLocation(callbacks.current.error,instance.getModel()?.getLineCount()??1);instance.setPosition({lineNumber:position.line,column:position.column});instance.revealLineInCenter(position.line);return;}
  const actions={find:'actions.find',replace:'editor.action.startFindReplaceAction',goto:'editor.action.gotoLine',undo:'undo',redo:'redo'};
  instance.trigger('pine-toolbar',actions[command.type],null);
 },[command,ready]);
 return <div className="pine-monaco-wrap">{failed?<><p role="alert">{failed}</p><textarea aria-label="Pine source code" value={value} onChange={event=>onChange(event.target.value)} spellCheck={false}/></>:<><div ref={host} className="pine-monaco"/>{!ready&&<p className="pine-code-loading" role="status">Loading code editor…</p>}</>}</div>;
}
