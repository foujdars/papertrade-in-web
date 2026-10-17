import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DesktopChartSettingsDialog } from '../../components/DesktopChartSettingsDialog';
import { DrawingObjects } from '../../components/DrawingObjects';

const INITIAL = [
  { id:'a',study:false,title:'Horizontal ray',text:'Support',color:'#2962ff',locked:false,hidden:false },
  { id:'b',study:false,title:'Trend line',text:'Weekly trend',color:'#089981',locked:false,hidden:true },
  { id:'c',study:true,title:'Horizontal line',text:'RSI threshold',color:'#f23645',locked:true,hidden:false },
];
function App(){
  const [open,setOpen]=useState(null),[theme,setTheme]=useState('light'),[items,setItems]=useState(INITIAL);
  const action=(item,kind)=>setItems(current=>kind==='delete'?current.filter(row=>row.id!==item.id):current.map(row=>row.id!==item.id?row:kind==='hide'?{...row,hidden:!row.hidden}:kind==='lock'?{...row,locked:!row.locked}:row));
  const batch=(targets,kind)=>{window.qaBatchCount=(window.qaBatchCount||0)+1;const ids=new Set(targets.map(item=>item.id));setItems(current=>current.map(row=>!ids.has(row.id)?row:kind==='hide'||kind==='show'?{...row,hidden:kind==='hide'}:{...row,locked:kind==='lock'}));};
  return <main className="terminal-shell" data-platform="web" data-section="trade" data-theme={theme}>
    <div style={{padding:24,display:'flex',gap:12}}><button onClick={()=>setOpen('settings')}>Open chart settings</button><button onClick={()=>setOpen('objects')}>Open object tree</button><button onClick={()=>setOpen('legacy')}>Open legacy drawings</button><button onClick={()=>setTheme(current=>current==='light'?'neon':'light')}>Toggle theme</button></div>
    {open==='settings'&&<DesktopChartSettingsDialog symbol="NIFTY 50" theme={theme} onClose={()=>setOpen(null)}/>}
    {(open==='objects'||open==='legacy')&&<DrawingObjects advanced={open==='objects'} items={items} disabled={false} onAction={action} onBatchAction={batch} onClose={()=>setOpen(null)}/>}
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
