import type { Metadata } from "next";
import Link from "next/link";
import { LegalFooter, LegalHeader } from "@/components/LegalChrome";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms governing use of the PaperTrade IN educational trading simulator.",
};

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <LegalHeader />
        <article className={styles.card}>
          <span className={styles.eyebrow}>Using PaperTrade IN</span>
          <h1>Terms of Use</h1>
          <p className={styles.updated}>Effective 20 August 2026</p>
          <p className={styles.summary}>PaperTrade IN is an educational paper-trading simulator. It does not provide investment advice, execute real trades, or guarantee that simulated results can be achieved in live markets.</p>

          <section className={styles.section}>
            <h2>1. Eligibility and acceptance</h2>
            <p>You must be at least 18 years old to use PaperTrade IN. By accessing the website or application, you agree to these terms and our <Link href="/privacy">Privacy Policy</Link>.</p>
          </section>
          <section className={styles.section}>
            <h2>2. Simulation only</h2>
            <p>All balances, orders, positions, holdings, profit and loss, charges, targets, and stop-losses shown by PaperTrade IN are simulated. No order is sent to a broker or exchange, and virtual funds have no cash value.</p>
          </section>
          <section className={styles.section}>
            <h2>3. Market data and calculations</h2>
            <p>Market data may be delayed, incomplete, interrupted, or different from another trading platform. Simulated fills, taxes, fees, margin, returns, scanners, and indicators are estimates and may differ from actual broker or exchange calculations.</p>
          </section>
          <section className={styles.section}>
            <h2>4. Your responsibility</h2>
            <p>You are responsible for independently checking information before making any financial decision. Past or simulated performance does not predict future results. Seek advice from a qualified professional when appropriate.</p>
          </section>
          <section className={styles.section}>
            <h2>5. Acceptable use</h2>
            <p>Do not misuse the service, interfere with its security or availability, attempt unauthorized access, reverse engineer protected components, abuse market-data services, or use the service for unlawful activity.</p>
          </section>
          <section className={styles.section}>
            <h2>6. Availability and liability</h2>
            <p>The service is provided on an “as available” basis and may change or be unavailable without notice. To the extent permitted by law, PaperTrade IN is not responsible for trading losses, missed opportunities, data errors, service interruptions, or decisions made using the simulator.</p>
          </section>
          <section className={styles.section}>
            <h2>7. Accounts and termination</h2>
            <p>You are responsible for activity under your account. We may restrict abusive or unlawful use. You can permanently remove your account through the <Link href="/delete-account">account deletion page</Link>.</p>
          </section>
          <section className={styles.section}>
            <h2>8. Changes and contact</h2>
            <p>We may update these terms as the service changes. The effective date above will identify the latest version. Questions can be sent to <a href="mailto:foudjars@gmail.com?subject=PaperTrade%20IN%20Terms">foudjars@gmail.com</a>.</p>
          </section>
        </article>
        <LegalFooter />
      </div>
    </main>
  );
}
