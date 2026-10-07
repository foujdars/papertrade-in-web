import React from 'react';
import { createRoot } from 'react-dom/client';
import { HomeDerivatives } from '../../components/HomeDerivatives';
createRoot(document.getElementById('root')).render(<main className="terminal-shell" data-theme="light"><HomeDerivatives onOpenStock={symbol => { window.qaOpened = symbol; }} onOpenInstrument={instrument => { window.qaInstrument = instrument; }}/></main>);
