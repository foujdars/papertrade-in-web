import { BrandMark } from "./BrandMark";
import { CandleLoader } from "./CandleLoader";

/** Responsive version of the supplied artwork; names remain real text, not baked into a GIF. */
export function WelcomeScreen({ name }: { name?: string }) {
  const firstName = typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
  return <main className="welcome-candle-screen" aria-label="Preparing your paper trading workspace">
    <div className="welcome-candle-content">
      <div className="welcome-candle-brand"><BrandMark size={56} /><b>PaperTrade <em>IN</em></b></div>
      <div className="welcome-candle-greeting"><p>{firstName ? "Welcome back," : "Welcome to"}</p><h1>{firstName || "PaperTrade IN"}<span className="welcome-wave" aria-hidden="true">👋</span></h1><small>Your space to practise. Your pace to grow.</small></div>
      <div className="welcome-candle-divider" aria-hidden="true" />
      <p className="welcome-candle-motto"><em>A little practice.</em><br />A more confident you.</p>
      <CandleLoader label="Preparing your workspace" artwork />
      <p className="welcome-candle-footnote">One candle. One lesson. One step forward.</p>
    </div>
  </main>;
}
