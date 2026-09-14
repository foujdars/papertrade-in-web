import { BrandMark } from "./BrandMark";
import { CandleLoader } from "./CandleLoader";
import { ShieldAlert } from "lucide-react";

/** The single opening screen; automatically continues once the workspace is ready. */
export function WelcomeScreen({ name }: { name?: string }) {
  const firstName = typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
  return <main className="launch-disclaimer" aria-label="SEBI disclaimer">
    <header className="launch-brand">
      <BrandMark size={48} />
      <span><b>PaperTrade <em>IN</em></b><small>Learn · Practise · Trade smarter</small></span>
    </header>
    <section className="launch-message" aria-labelledby="launch-title">
      <span className="launch-shield" aria-hidden="true"><ShieldAlert size={36} strokeWidth={1.6} /></span>
      <p className="launch-personal">{firstName ? `Before you begin, ${firstName}` : "A little clarity before you begin"}</p>
      <h1 id="launch-title">SEBI disclaimer</h1>
      <span className="launch-rule" aria-hidden="true" />
      <div className="launch-copy">
        <p>PaperTrade IN is an educational and informational platform. It is not a SEBI-registered Investment Adviser or Research Analyst.</p>
        <p>The information, IPO estimates, probabilities and market data are for educational purposes only and do not constitute investment, trading or financial advice.</p>
        <p>Make independent decisions and consult a SEBI-registered professional where appropriate.</p>
      </div>
      <p className="launch-risk">Investments in securities are subject to market risks.</p>
    </section>
    <footer className="launch-loading"><CandleLoader label="Preparing your workspace" artwork /></footer>
  </main>;
}
