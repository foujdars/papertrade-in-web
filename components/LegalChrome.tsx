import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import styles from "@/app/legal.module.css";

export function LegalHeader() {
  return (
    <Link className={styles.brand} href="/" aria-label="Open PaperTrade IN">
      <BrandMark size={42} className={styles.legalLogo} />
      <span>PaperTrade <strong>IN</strong></span>
    </Link>
  );
}

export function LegalFooter() {
  return (
    <footer className={styles.footer}>
      <p>PaperTrade IN is an educational paper-trading simulator. Not investment advice.</p>
      <nav className={styles.footerLinks} aria-label="Legal links">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/delete-account">Delete account</Link>
      </nav>
    </footer>
  );
}
