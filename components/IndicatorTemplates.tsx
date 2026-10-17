"use client";
import { useEffect, useState } from 'react';
import { BookmarkPlus, Layers, Trash2 } from 'lucide-react';
import type { StudyConfig } from '@/lib/indicator-catalog';
import { applyStudySettings } from '@/lib/indicator-settings';
import { applyIndicatorTemplate, captureIndicatorTemplate, deleteIndicatorTemplate, loadIndicatorTemplates, saveIndicatorTemplate, visibleLowerPaneCount, INDICATOR_TEMPLATE_KEY, type IndicatorTemplate } from '@/lib/indicator-templates';

type Props={indicators:Record<string,boolean>;settings:Record<string,StudyConfig>;onToggle:(id:string)=>void;excluded?:string[];query?:string};
export function IndicatorTemplates({indicators,settings,onToggle,excluded=[],query=''}:Props){
 const [templates,setTemplates]=useState<IndicatorTemplate[]>([]),[name,setName]=useState(''),[notice,setNotice]=useState('');
 const refresh=()=>setTemplates(loadIndicatorTemplates());
 useEffect(()=>{const timer=window.setTimeout(refresh,0);const changed=(event:StorageEvent)=>{if(event.key===INDICATOR_TEMPLATE_KEY)refresh();};window.addEventListener('storage',changed);return()=>{window.clearTimeout(timer);window.removeEventListener('storage',changed);};},[]);
 const shown=templates.filter(t=>t.name.toLowerCase().includes(query.trim().toLowerCase()));
 function save(){
  const template=captureIndicatorTemplate(name,indicators,settings);
  if(!template){setNotice('Enter a name of 1–60 characters and keep at most six visible lower panes.');return;}
  const result=saveIndicatorTemplate(template);if(!result.ok){setNotice(result.error);return;}
  refresh();setName('');setNotice(`Saved ${template.name} on this device.`);
 }
 function apply(template:IndicatorTemplate){const result=applyIndicatorTemplate(template,indicators,settings,applyStudySettings,onToggle,excluded);setNotice(result.ok?`Applied ${template.name}. Pine scripts were preserved.`:result.error);}
 function remove(template:IndicatorTemplate){const result=deleteIndicatorTemplate(template.id);if(result.ok)refresh();setNotice(result.ok?`Deleted ${template.name}. The chart was not changed.`:result.error);}
 return <div className="indicator-template-panel">
  <div className="indicator-template-intro"><Layers size={20}/><div><h3>Indicator templates</h3><p>Save indicators, inputs, colors and visibility together. Pine scripts stay separate.</p></div></div>
  <form className="indicator-template-save" onSubmit={event=>{event.preventDefault();save();}}><label htmlFor="indicator-template-name">Save current indicators</label><div><input id="indicator-template-name" aria-label="Indicator template name" value={name} maxLength={60} placeholder="e.g. Trend and momentum" onChange={event=>setName(event.target.value)}/><button type="submit" disabled={!name.trim()||templates.length>=12}><BookmarkPlus size={16}/>Save new</button></div><small>{templates.length}/12 saved · {visibleLowerPaneCount(indicators,settings)}/6 visible lower panes</small></form>
  {notice&&<p className="indicator-template-notice" role="status">{notice}</p>}
  <div className="indicator-template-list" aria-label="Saved indicator templates">{shown.map(template=><article key={template.id}><button className="indicator-template-apply" onClick={()=>apply(template)} aria-label={`Apply template ${template.name}`}><b>{template.name}</b><small>{template.enabled.length} indicators · {visibleLowerPaneCount(Object.fromEntries(template.enabled.map(id=>[id,true])),template.settings)} visible lower panes</small></button><button className="indicator-template-delete" aria-label={`Delete template ${template.name}`} onClick={()=>remove(template)}><Trash2 size={16}/></button></article>)}{!shown.length&&<p className="indicator-template-empty">{templates.length?'No templates match this search.':'Save your current setup to reuse it on another chart.'}</p>}</div>
  <p className="indicator-template-footnote">Applying replaces available built-in indicators on this chart. Settings are stored on this device; drawings and Pine scripts are preserved.</p>
 </div>;
}
