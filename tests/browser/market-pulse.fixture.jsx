import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {IndiaPulse} from '../../components/IndiaPulse';
function App() {
  const [theme, setTheme] = useState('light');
  return <main className="terminal-shell" data-theme={theme} style={{height:'100dvh',display:'flex',flexDirection:'column'}}><header className="topbar" style={{flex:'0 0 56px'}}><span className="brand">PaperTrade <b>IN</b></span><button onClick={()=>setTheme(t=>t==='light'?'neon':'light')}>Theme</button></header><div className="home-hub home-studio" style={{minHeight:0,flex:1}}><div className="home-dashboard-scroll"><IndiaPulse/></div></div></main>;
}
createRoot(document.getElementById('root')).render(<App/>);
