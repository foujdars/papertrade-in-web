import { BrandMark } from "./BrandMark";

/** Responsive version of the supplied artwork; names remain real text, not baked into a GIF. */
export function WelcomeScreen({ name }: { name?: string }) {
  const firstName = typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
  return <main className="welcome-candle-screen" aria-label="Preparing your paper trading workspace">
    <div className="welcome-candle-brand"><BrandMark size={72} /><b>PaperTrade <em>IN</em></b></div>
    <div className="welcome-candle-greeting"><p>{firstName ? "Welcome back," : "Welcome to"}</p><h1>{firstName || "PaperTrade IN"} <span aria-hidden="true">👋</span></h1></div>
    <p className="welcome-candle-motto"><em>Practise</em> makes<br />a man perfect</p>
    <div className="welcome-candle-loader" role="status" aria-label="Loading your workspace"><i /><i /><i /><i /></div>
  </main>;
}
