"use client";

import { useEffect, useState } from "react";

import PixelBlurBg from "@/components/PixelBlurBg";
import {
  BackLink,
  CloseButton,
  INK,
  INK_SOFT,
  LetterCard,
  LetterDetail,
  LetterReply,
  RULE,
  contentStyle,
  gridStyle,
  rootStyle,
  subtitleStyle,
  titleStyle,
} from "@/components/letterkit";
import {
  CORRESPONDENTS,
  getCorrespondent,
  type BundleTie as TieKind,
  type Correspondent,
} from "@/lib/letters";

// The bookshelf behind the desk: past letters grouped by the person who sent
// them. A brief sharp "pile of letters" splash fades into the sorted bundles.
//   bundles → one card per correspondent (name + count)
//   letters → that person's letters (reusing the wall's card/detail/reply)
//   detail / reply → shared reader
const INTRO_HOLD_MS = 480; // how long the sharp pile stays before fading
const INTRO_FADE_MS = 420;

type CView =
  | { kind: "bundles" }
  | { kind: "letters"; cid: string }
  | { kind: "detail"; cid: string; lid: string }
  | { kind: "reply"; cid: string; lid: string };

export default function Correspondence({
  pileSrc,
  onClose,
  onReplyPosted,
}: {
  pileSrc: string;
  onClose: () => void;
  onReplyPosted: (letterId: string, text: string) => void;
}) {
  const [view, setView] = useState<CView>({ kind: "bundles" });
  const [introGone, setIntroGone] = useState(false);

  // Let the sharp pile linger a beat, then dissolve into the sorted bundles.
  useEffect(() => {
    const t = window.setTimeout(() => setIntroGone(true), INTRO_HOLD_MS);
    return () => window.clearTimeout(t);
  }, []);

  const letterFor = (cid: string, lid: string) =>
    getCorrespondent(cid)?.letters.find((l) => l.id === lid);

  return (
    <div style={rootStyle}>
      <PixelBlurBg src={pileSrc} brightness={0.42} />

      {view.kind === "bundles" && (
        <div style={contentStyle}>
          <BackLink label="Back to bookstore" onClick={onClose} />
          <CloseButton onClose={onClose} />
          <header style={{ textAlign: "center", marginBottom: "3.5cqw" }}>
            <h2 style={titleStyle}>Your correspondence</h2>
            <p style={subtitleStyle}>Letters gathered by sender.</p>
          </header>
          <div style={gridStyle}>
            {CORRESPONDENTS.map((c) => (
              <BundleCard
                key={c.id}
                person={c}
                onOpen={() => setView({ kind: "letters", cid: c.id })}
              />
            ))}
          </div>
        </div>
      )}

      {view.kind === "letters" &&
        (() => {
          const c = getCorrespondent(view.cid)!;
          return (
            <div style={contentStyle}>
              <BackLink
                label="Back to bundles"
                onClick={() => setView({ kind: "bundles" })}
              />
              <CloseButton onClose={onClose} />
              <header style={{ textAlign: "center", marginBottom: "3cqw" }}>
                <h2 style={titleStyle}>{c.name}</h2>
                <p style={subtitleStyle}>
                  {c.letters.length} {c.letters.length === 1 ? "letter" : "letters"}
                </p>
              </header>
              <div style={gridStyle}>
                {c.letters.map((l) => (
                  <LetterCard
                    key={l.id}
                    letter={l}
                    onOpen={() =>
                      setView({ kind: "detail", cid: c.id, lid: l.id })
                    }
                  />
                ))}
              </div>
            </div>
          );
        })()}

      {view.kind === "detail" && (
        <LetterDetail
          letter={letterFor(view.cid, view.lid)!}
          backLabel={`Back to ${getCorrespondent(view.cid)!.name}`}
          onBack={() => setView({ kind: "letters", cid: view.cid })}
          onReply={() =>
            setView({ kind: "reply", cid: view.cid, lid: view.lid })
          }
          onClose={onClose}
        />
      )}

      {view.kind === "reply" && (
        <LetterReply
          letter={letterFor(view.cid, view.lid)!}
          backLabel={`Back to ${getCorrespondent(view.cid)!.name}`}
          onBack={() => setView({ kind: "letters", cid: view.cid })}
          onCancel={() =>
            setView({ kind: "detail", cid: view.cid, lid: view.lid })
          }
          onClose={onClose}
          onPost={(text) => onReplyPosted(view.lid, text)}
        />
      )}

      {/* Sharp pile splash that dissolves into the sorted bundles on entry. */}
      {!introGone && (
        <img
          src={pileSrc}
          alt=""
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 6,
            opacity: 1,
            animation: `pileFade ${INTRO_FADE_MS}ms ease ${INTRO_HOLD_MS}ms forwards`,
            pointerEvents: "none",
          }}
        />
      )}
      <style>{`@keyframes pileFade { to { opacity: 0; } }`}</style>
    </div>
  );
}

/* ----------------------------- bundle card ---------------------------- */

function BundleCard({
  person,
  onOpen,
}: {
  person: Correspondent;
  onOpen: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...bundleStyle, ...(hover ? bundleHoverStyle : null) }}
    >
      {/* Offset paper edges behind the label suggest a thick stack of letters. */}
      <span style={{ ...stackLayerStyle, transform: "rotate(-3deg) translate(-4%, 3%)" }} />
      <span style={{ ...stackLayerStyle, transform: "rotate(2.5deg) translate(4%, -2%)" }} />
      <span style={stackTopStyle} />

      <BundleTieMark kind={person.tie} />

      <div style={labelCardStyle}>
        <div style={nameStyle}>{person.name}</div>
        <div style={letterCountStyle}>
          {person.letters.length} {person.letters.length === 1 ? "letter" : "letters"}
        </div>
        <span style={{ ...openLinkStyle, ...(hover ? { color: INK } : null) }}>
          Open bundle
        </span>
      </div>
    </button>
  );
}

// How a given bundle is bound together — cosmetic but consistent per person.
function BundleTieMark({ kind }: { kind: TieKind }) {
  if (kind === "clip") {
    return (
      <svg viewBox="0 0 24 24" style={clipStyle} aria-hidden>
        <path
          d="M8 4 v11 a4 4 0 0 0 8 0 V6 a2.5 2.5 0 0 0 -5 0 v9"
          fill="none"
          stroke="#7d8a52"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === "green-band") {
    return <span style={{ ...bandStyle, background: "linear-gradient(90deg,#4f6b3a,#5c7a44)" }} aria-hidden />;
  }
  const color =
    kind === "red-string" ? "#9e3b30" : kind === "green-string" ? "#4f6b3a" : "#8a6f43";
  const edge =
    kind === "red-string" ? "#7a2b22" : kind === "green-string" ? "#3a5029" : "#5f4c2d";
  return (
    <>
      <span style={{ ...strapStyle, background: color }} aria-hidden />
      <svg viewBox="0 0 40 22" style={bowStyle} aria-hidden>
        <path d="M20 11 L6 4 Q2 11 8 12 Q2 13 6 18 Z" fill={color} stroke={edge} strokeWidth="1" />
        <path d="M20 11 L34 4 Q38 11 32 12 Q38 13 34 18 Z" fill={color} stroke={edge} strokeWidth="1" />
        <circle cx="20" cy="11" r="3" fill={edge} />
      </svg>
      {kind === "twine-wax" && <span style={waxDotStyle} aria-hidden />}
    </>
  );
}

/* ------------------------------- styles ------------------------------- */

const bundleStyle: React.CSSProperties = {
  position: "relative",
  flex: "0 0 26cqw",
  height: "18cqw",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "transform 140ms ease",
};

const bundleHoverStyle: React.CSSProperties = {
  transform: "translateY(-3px)",
};

// Envelope-toned paper making up the stack body.
const stackTopStyle: React.CSSProperties = {
  position: "absolute",
  inset: "8% 4%",
  background: "linear-gradient(180deg, #ddc79c 0%, #cdb384 100%)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#a98f5c",
  boxShadow: "3px 5px 0 0 rgba(0,0,0,0.4)",
};

const stackLayerStyle: React.CSSProperties = {
  position: "absolute",
  inset: "10% 5%",
  background: "linear-gradient(180deg, #d3bd90 0%, #c3a878 100%)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#a98f5c",
  boxShadow: "2px 3px 0 0 rgba(0,0,0,0.3)",
};

// The lighter label card sitting on top of the stack.
const labelCardStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  minWidth: "52%",
  padding: "1.6cqw 2.4cqw",
  textAlign: "center",
  background: "linear-gradient(180deg, #efe3c2 0%, #e7d8b3 100%)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#c3ab77",
  boxShadow: "2px 3px 0 0 rgba(0,0,0,0.3)",
};

const nameStyle: React.CSSProperties = {
  color: INK,
  fontSize: "2.4cqw",
  fontWeight: 700,
  letterSpacing: "0.1cqw",
};

const letterCountStyle: React.CSSProperties = {
  margin: "0.4cqw 0 0.8cqw",
  color: INK_SOFT,
  fontSize: "1.5cqw",
};

const openLinkStyle: React.CSSProperties = {
  color: RULE,
  fontSize: "1.5cqw",
  textDecoration: "underline",
  textUnderlineOffset: "2px",
};

// Vertical string wrapping the bundle (red / green / twine).
const strapStyle: React.CSSProperties = {
  position: "absolute",
  top: "6%",
  bottom: "6%",
  left: "50%",
  width: "2.2cqw",
  transform: "translateX(-50%)",
  zIndex: 1,
  opacity: 0.92,
  borderRadius: 1,
};

const bowStyle: React.CSSProperties = {
  position: "absolute",
  top: "2%",
  left: "50%",
  width: "9cqw",
  height: "auto",
  transform: "translateX(-50%)",
  zIndex: 3,
  filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.35))",
};

const waxDotStyle: React.CSSProperties = {
  position: "absolute",
  top: "9%",
  left: "50%",
  width: "2.6cqw",
  height: "2.6cqw",
  transform: "translateX(-50%)",
  borderRadius: "50%",
  background: "#a5301f",
  border: "1px solid #6f1d12",
  zIndex: 4,
};

const bandStyle: React.CSSProperties = {
  position: "absolute",
  left: "6%",
  right: "6%",
  bottom: "26%",
  height: "3.4cqw",
  zIndex: 1,
  boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
  opacity: 0.95,
};

const clipStyle: React.CSSProperties = {
  position: "absolute",
  top: "-1.5cqw",
  right: "16%",
  width: "6cqw",
  height: "auto",
  zIndex: 3,
  filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.35))",
};
