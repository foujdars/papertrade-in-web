import React from 'react';
import {createRoot} from 'react-dom/client';
import {Capacitor} from '@capacitor/core';
import {AuthProvider} from '../../components/AuthProvider';
import {TradingDashboard} from '../../components/TradingDashboard';
const native=new URLSearchParams(location.search).has('native');
Capacitor.isNativePlatform=()=>native;Capacitor.getPlatform=()=>native?'android':'web';
createRoot(document.getElementById('root')).render(<AuthProvider><TradingDashboard/></AuthProvider>);
