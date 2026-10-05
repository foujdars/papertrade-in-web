import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import { useGlobalTrading } from '../../components/useGlobalTrading';
import { BotWorkspace } from '../../components/BotWorkspace';
function Fixture() {
  const trading = useGlobalTrading('11111111-1111-4111-8111-111111111111', null, null, true);
  useEffect(() => { window.botState = { account: trading.account, background: trading.background }; }, [trading.account, trading.background]);
  return <main className="terminal-shell" data-theme="light"><BotWorkspace trading={trading} onClose={() => {}} onPnl={() => {}} /><button style={{ position: 'fixed', zIndex: 500, bottom: 0, right: 0 }} onClick={() => trading.transact(a => ({ ...a, wallet: a.wallet + 1, revision: a.revision + 1 }))}>Test wallet edit</button></main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
