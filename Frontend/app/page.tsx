import Link from "next/link";
import type { CSSProperties } from "react";

/**
 * Quiet landing before the bookshop door. Bilingual verse:
 * Chinese — 李清照；English — Emily Dickinson (non-Chinese poet).
 * Layout: copy on the left, pixel art on the right.
 */
export default function Home() {
  return (
    <main className="landing" style={mainStyle}>
      <style>{`
        @media (max-width: 820px) {
          .landing {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto minmax(42vh, 48vh);
          }
          .landing-art {
            min-height: 42vh !important;
            order: -1;
          }
        }
      `}</style>

      <div style={copyColStyle}>
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
            Welcome to The Stationery — a quiet place to write, and to wait for
            a letter worth the waiting.
          </span>
        </p>

        <p style={ctaWrapStyle}>
          <Link href="/bookshop" style={ctaStyle}>
            → 推门入店 · Enter the bookstore
          </Link>
        </p>
      </div>

      <div className="landing-art" style={artColStyle} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/pixel/scene/letters-becoming-birds-pixel-hd.png"
          alt=""
          style={artImgStyle}
        />
      </div>
    </main>
  );
}

const mainStyle: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.05fr)",
  alignItems: "stretch",
  background:
    "radial-gradient(ellipse 70% 50% at 18% 20%, rgba(230,168,92,0.10) 0%, transparent 55%), var(--night-bg)",
};

const copyColStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  padding: "min(10vh, 72px) clamp(28px, 5vw, 64px) 56px",
  maxWidth: 560,
  boxSizing: "border-box",
};

const artColStyle: CSSProperties = {
  position: "relative",
  minHeight: "100vh",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const artImgStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center",
  imageRendering: "pixelated",
  display: "block",
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
  fontSize: "clamp(28px, 4.2vw, 40px)",
  fontWeight: 400,
  letterSpacing: "0.12em",
  lineHeight: 1.35,
};

const zhLineStyle: CSSProperties = {
  margin: "10px 0 0",
  opacity: 0.78,
  fontFamily: '"Ma Shan Zheng", "Songti SC", serif',
  fontSize: "clamp(18px, 2.6vw, 22px)",
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
  fontSize: "clamp(22px, 3.2vw, 30px)",
  fontWeight: 600,
  lineHeight: 1.3,
  opacity: 0.95,
};

const enLineStyle: CSSProperties = {
  margin: "6px 0 0",
  fontFamily: '"Caveat", Georgia, cursive',
  fontSize: "clamp(18px, 2.8vw, 24px)",
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
