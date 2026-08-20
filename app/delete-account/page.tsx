import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { DeleteAccountClient } from "@/components/DeleteAccountClient";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Delete Account",
  description: "Permanently delete your PaperTrade IN account and associated data.",
};

export default function DeleteAccountPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.brand} href="/"><BrandMark size={38} /><span>PaperTrade <strong>IN</strong></span></Link>
        <article className={styles.card}>
          <span className={styles.eyebrow}>Account controls</span>
          <h1>Delete your account</h1>
          <p className={styles.updated}>A secure, direct deletion process for PaperTrade IN</p>
          <p className={styles.summary}>Deleting your account permanently removes your Google-linked PaperTrade IN identity and associated synchronized paper-trading information. It does not affect your Google account.</p>
          <DeleteAccountClient />
          <section className={styles.section}>
            <h2>What is deleted?</h2>
            <p>Your PaperTrade IN profile, cloud trading state, virtual balance, simulated orders and positions, holdings, watchlists, chart preferences, and P&amp;L records associated with the account.</p>
          </section>
          <section className={styles.section}>
            <h2>Need assistance?</h2>
            <p>Email <a href="mailto:foudjars@gmail.com?subject=PaperTrade%20IN%20Account%20Deletion">foudjars@gmail.com</a> from your registered email address. Read our <Link href="/privacy">Privacy Policy</Link> for additional information.</p>
          </section>
        </article>
        <footer className={styles.footer}><span>© 2026 PaperTrade IN</span><span><Link href="/">Open app</Link> · <Link href="/privacy">Privacy policy</Link></span></footer>
      </div>
    </main>
  );
}
