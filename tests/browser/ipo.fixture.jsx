import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {IpoWorkspace} from '../../components/IpoWorkspace';
function App(){const [theme,setTheme]=useState('light'),[owner,setOwner]=useState('qa');window.qaTheme=setTheme;window.qaOwner=setOwner;return <main className="terminal-shell" data-theme={theme}><section className="ipo-modal"><IpoWorkspace key={owner} ownerId={owner}/></section></main>}
createRoot(document.getElementById('root')).render(<App/>);
