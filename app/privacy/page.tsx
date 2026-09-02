import type { Metadata } from "next";
import Link from "next/link";
import { LegalFooter, LegalHeader } from "@/components/LegalChrome";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How PaperTrade IN collects, uses, protects, and deletes user information.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <LegalHeader />
        <article className={styles.card}>
          <span className={styles.eyebrow}>Your privacy</span>
          <h1>Privacy Policy</h1>
          <p className={styles.updated}>Effective 2 September 2026</p>
          <p className={styles.summary}>PaperTrade IN is a paper-trading simulator. We do not sell personal information, display behavioural advertising, see your Google password, or place real exchange orders.</p>

          <section className={styles.section}>
            <h2>1. Information we process</h2>
            <ul>
              <li><b>Google account information:</b> your account identifier, email address, display name, and profile image when you choose Google sign-in.</li>
              <li><b>Paper-trading information:</b> virtual balance, simulated orders and positions, holdings, watchlists, chart preferences, protections, and P&amp;L records that you save or generate.</li>
              <li><b>Technical information:</b> ordinary security and diagnostic information processed by our hosting and authentication providers, such as request timestamps, IP address, browser or device type, and error information.</li>
              <li><b>Optional notifications:</b> if you permit notifications, the Android app can show local alerts when a simulated target or stop-loss is reached.</li>
              <li><b>IPO allotment alerts:</b> when enabled, the website checks public IPO information while it is open. The alert preference and records used to avoid duplicate alerts are saved on your device, along with the notification centre history.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>2. How information is used</h2>
            <p>We use this information only to authenticate you, synchronize your paper portfolio across your devices, provide charts and simulated trading features, maintain service security, diagnose failures, and respond to support or privacy requests.</p>
          </section>

          <section className={styles.section}>
            <h2>3. Service providers and sharing</h2>
            <p>Google provides sign-in, Supabase provides authentication and cloud database services, Vercel hosts the website and secure server routes, and Upstox supplies market data. These providers process limited information needed to perform their services under their own privacy terms. We do not sell your information or share it for third-party advertising.</p>
            <p>IPO company logos are loaded from Chittorgarh’s image service. Loading these images sends ordinary connection information, such as your IP address, to that service; we omit referrer information and cross-origin credentials. Research links open Chittorgarh in a new tab. We do not attach your account, portfolio, PAN, or payment information to these requests or links.</p>
          </section>

          <section className={styles.section}>
            <h2>4. Broker and market data</h2>
            <p>Paper orders remain simulations and are not sent to Upstox, a broker, or an exchange. The production Upstox credential is held on the server and is not included in the Android application or sent to your browser.</p>
            <p>IPO allotment buttons open an official registrar or exchange website. Enter your PAN or application details only on that external website; PaperTrade does not request, receive or store those details. The external website handles information you enter under its own privacy policy.</p>
          </section>

          <section className={styles.section}>
            <h2>5. Storage and security</h2>
            <p>Information is transmitted using encrypted HTTPS connections. Supabase row-level security restricts cloud portfolio records to the signed-in user. Sensitive server credentials are kept outside the downloadable application. Some preferences may also be stored locally on your device. No online service can guarantee absolute security, but we use access controls and data minimisation to reduce risk.</p>
          </section>

          <section className={styles.section}>
            <h2>6. Retention and deletion</h2>
            <p>Your account profile and synchronized trading state are retained while your account is active. You may permanently delete them from the profile menu or through the <Link href="/delete-account">account deletion page</Link>. Deletion removes your Supabase authentication account and associated profile and cloud trading data. Hosting providers may retain limited security logs for their normal operational or legal periods.</p>
          </section>

          <section className={styles.section}>
            <h2>7. Children</h2>
            <p>PaperTrade IN is not directed to children under 18. It is an educational simulation and does not provide investment advice or real-money trading.</p>
          </section>

          <section className={styles.section}>
            <h2>8. Your choices and contact</h2>
            <p>You can sign out, decline notifications, remove local app data by uninstalling the app, or delete your account. For privacy questions, email <a href="mailto:foudjars@gmail.com?subject=PaperTrade%20IN%20Privacy">foudjars@gmail.com</a>.</p>
          </section>

          <section className={styles.section}>
            <h2>9. Policy updates</h2>
            <p>We may update this policy when the app or legal requirements change. The effective date shown above will be updated, and material changes will be communicated in the app or on this page.</p>
          </section>
        </article>
        <LegalFooter />
      </div>
    </main>
  );
}
