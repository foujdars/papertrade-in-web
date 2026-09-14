import { BrandMark } from "./BrandMark";
import { CandleLoader } from "./CandleLoader";
import { ArrowRight, ShieldAlert } from "lucide-react";

/** Responsive version of the supplied artwork; names remain real text, not baked into a GIF. */
export function WelcomeScreen({
  name,
  showDisclaimer = false,
  onAcceptDisclaimer,
}: {
  name?: string;
  showDisclaimer?: boolean;
  onAcceptDisclaimer?: () => void;
}) {
  const firstName = typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
  if (showDisclaimer) {
    return <main className="welcome-candle-screen welcome-disclaimer-screen" aria-label="SEBI disclaimer">
      <section className="welcome-disclaimer-card">
        <header className="welcome-disclaimer-brand"><BrandMark size={46} /><span><b>PaperTrade <em>IN</em></b><small>Learn · Practise · Trade Smarter</small></span></header>
        {firstName && <p className="welcome-disclaimer-personal">Before you begin, {firstName}</p>}
        <span className="welcome-disclaimer-icon" aria-hidden="true"><ShieldAlert size={38} /></span>
        <h1>SEBI Disclaimer</h1>
        <span className="welcome-disclaimer-rule" aria-hidden="true" />
        <p>PaperTrade IN is an educational and informational platform. It is <strong>not a SEBI-registered Investment Adviser or Research Analyst.</strong></p>
        <p>The information, IPO estimates, probabilities and market data provided are for educational purposes only and <strong>do not constitute investment, trading or financial advice.</strong></p>
        <p>Make independent decisions and consult a SEBI-registered professional where appropriate.</p>
        <strong className="welcome-disclaimer-risk">Investments in securities are subject to market risks.</strong>
        <button type="button" onClick={onAcceptDisclaimer}>I Understand <ArrowRight size={20} /></button>
        <small>Your acknowledgement is remembered on this device.</small>
      </section>
    </main>;
  }
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
