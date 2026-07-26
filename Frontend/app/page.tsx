import Link from "next/link";
import type { CSSProperties } from "react";

/**
 * Quiet landing before the bookshop door. Bilingual verse:
 * Chinese — 李清照；English — Emily Dickinson (non-Chinese poet).
 */
export default function Home() {
  return (
    <main style={mainStyle}>
      <p style={brandStyle}>见信 · The Stationery</p>

      <section style={verseBlockStyle} aria-label="Verse">
        <h1 style={zhTitleStyle}>云中谁寄锦书来</h1>
        <p style={zhLineStyle}>雁字回时，月满西楼。</p>

        <div style={ruleStyle} aria-hidden />

        <p style={enTitleStyle}>This is my letter to the World</p>
        <p style={enLineStyle}>That never wrote to Me —</p>
        <p style={attributionStyle}>— Emily Dickinson</p>
      </section>

      <p style={bodyStyle}>
        欢迎来到见信。在这里写下，也静候一封值得等待的信。
        <br />
        <span style={enBodyStyle}>
          Welcome to The Stationery — a quiet place to write, and to wait for a
          letter worth the waiting.
        </span>
      </p>

      <p style={ctaWrapStyle}>
        <Link href="/bookshop" style={ctaStyle}>
          → 推门入店 · Enter the bookstore
        </Link>
      </p>
    </main>
  );
}

const mainStyle: CSSProperties = {
  minHeight: "100vh",
  padding: "min(12vh, 80px) 28px 64px",
  maxWidth: 560,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  background:
    "radial-gradient(ellipse 80% 55% at 50% 0%, rgba(230,168,92,0.12) 0%, transparent 55%), var(--night-bg)",
};

const brandStyle: CSSProperties = {
  margin: "0 0 36px",
  color: "var(--lamp)",
  fontSize: 13,
  letterSpacing: "0.28em",
  fontWeight: 600,
};

const verseBlockStyle: CSSProperties = {
  margin: 0,
};

const zhTitleStyle: CSSProperties = {
  margin: 0,
  color: "var(--lamp)",
  fontFamily: '"Ma Shan Zheng", "Songti SC", serif',
  fontSize: "clamp(28px, 6vw, 40px)",
  fontWeight: 400,
  letterSpacing: "0.12em",
  lineHeight: 1.35,
};

const zhLineStyle: CSSProperties = {
  margin: "10px 0 0",
  opacity: 0.78,
  fontFamily: '"Ma Shan Zheng", "Songti SC", serif',
  fontSize: "clamp(18px, 3.5vw, 22px)",
  letterSpacing: "0.18em",
};

const ruleStyle: CSSProperties = {
  width: 48,
  height: 1,
  margin: "28px 0",
  background: "rgba(230,168,92,0.45)",
};

const enTitleStyle: CSSProperties = {
  margin: 0,
  color: "var(--paper)",
  fontFamily: '"Caveat", Georgia, cursive',
  fontSize: "clamp(22px, 4.5vw, 30px)",
  fontWeight: 600,
  lineHeight: 1.3,
  opacity: 0.95,
};

const enLineStyle: CSSProperties = {
  margin: "6px 0 0",
  fontFamily: '"Caveat", Georgia, cursive',
  fontSize: "clamp(18px, 3.8vw, 24px)",
  opacity: 0.72,
  fontStyle: "italic",
};

const attributionStyle: CSSProperties = {
  margin: "14px 0 0",
  fontSize: 11,
  letterSpacing: "0.12em",
  opacity: 0.45,
};

const bodyStyle: CSSProperties = {
  marginTop: 40,
  lineHeight: 1.9,
  fontSize: 15,
  opacity: 0.88,
};

const enBodyStyle: CSSProperties = {
  display: "block",
  marginTop: 10,
  fontSize: 13.5,
  opacity: 0.65,
  fontStyle: "italic",
  lineHeight: 1.7,
};

const ctaWrapStyle: CSSProperties = {
  marginTop: 36,
};

const ctaStyle: CSSProperties = {
  color: "var(--lamp)",
  textDecoration: "none",
  fontSize: 15,
  letterSpacing: "0.04em",
  borderBottom: "1px solid rgba(230,168,92,0.35)",
  paddingBottom: 2,
};
