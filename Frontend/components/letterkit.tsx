"use client";

// Shared building blocks for the letter-reading experiences (the letter wall and
// the correspondence bundles). Keeping the paper, seals, cards, and reader views
// here means both features render identical stationery and stay in sync.

import { useCallback, useState } from "react";

import { useKeyClicks } from "@/lib/audio/useKeyClicks";
import { MAX_BODY } from "@/lib/limits";

// Decorative style unions — mirrored on the backend (services/derive.py) so a
// letter/bundle always renders the same seal/tie.
export type LetterSeal = "wax" | "clip" | "pin" | "tape" | "ribbon";
export type BundleTie =
  | "red-string"
  | "green-string"
  | "clip"
  | "twine-wax"
  | "green-band";

// Minimal card data (one pinned note / message excerpt).
export interface CardItem {
  summary: string | null;
  seal: LetterSeal;
  isReply?: boolean;
}

const TYPE_SFX = "/assets/audio/sound_effect/打字声.MP3";

// Warm paper / ink / walnut palette, shared with the login + writing screens.
export const PAPER_TOP = "#e7d8b3";
export const PAPER_BOT = "#ddcca2";
export const INK = "#3a2c22";
export const INK_SOFT = "#7d6a4c";
export const RULE = "#b9a06a";
export const WALNUT = "#6f4f2e";
export const AMBER = "#caa15c";
export const AMBER_EDGE = "#9c7b3a";
export const CREAM = "#f0e4c6";

// A sheet of letter paper — portrait, roughly US-letter proportion, with its own
// container so inner cqw units are relative to the sheet (matching the writing
// screen), not the full stage.
const SHEET_W = "36cqw";
const SHEET_RATIO = "1 / 1.29";

/* ------------------------------ components ---------------------------- */

export function Divider() {
  return (
    <div style={dividerStyle} aria-hidden>
      <span style={dividerLineStyle} />
      <span style={dividerDiamondStyle} />
      <span style={dividerLineStyle} />
    </div>
  );
}

export function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="返回书店"
      onClick={onClose}
      style={closeSquareStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#d8b26a";
        e.currentTarget.style.color = "#fff3d8";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = AMBER_EDGE;
        e.currentTarget.style.color = CREAM;
      }}
    >
      {"\u00d7"}
    </button>
  );
}

export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={backLinkStyle}
      onMouseEnter={(e) => (e.currentTarget.style.color = "#fff3d8")}
      onMouseLeave={(e) => (e.currentTarget.style.color = CREAM)}
    >
      <span aria-hidden style={{ marginRight: "1cqw" }}>{"\u2190"}</span>
      {label}
    </button>
  );
}

// Distinct fastener per letter — each reads as a physical way the note was left,
// so nothing is purely decorative.
export function Seal({ kind }: { kind: LetterSeal }) {
  return (
    <span style={sealWrapStyle} aria-hidden>
      {kind === "wax" && (
        <svg viewBox="0 0 24 24" style={sealSvgStyle}>
          <circle cx="12" cy="12" r="9" fill="#a5301f" stroke="#6f1d12" strokeWidth="2" />
          <path
            d="M12 6 l1.6 3.6 3.9 .3 -3 2.6 1 3.8 -3.5 -2.1 -3.5 2.1 1 -3.8 -3-2.6 3.9-.3z"
            fill="#7f2416"
          />
        </svg>
      )}
      {kind === "clip" && (
        <svg viewBox="0 0 24 24" style={sealSvgStyle}>
          <path
            d="M8 4 v11 a4 4 0 0 0 8 0 V6 a2.5 2.5 0 0 0 -5 0 v9"
            fill="none"
            stroke="#5f7d4a"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
      {kind === "pin" && (
        <svg viewBox="0 0 24 24" style={sealSvgStyle}>
          <circle cx="12" cy="11" r="7" fill="#c9a24a" stroke="#8a6a26" strokeWidth="2" />
          <circle cx="9.5" cy="8.5" r="2" fill="#f0d68e" />
          <rect x="11" y="16" width="2" height="5" fill="#7a5c22" />
        </svg>
      )}
      {kind === "tape" && (
        <svg viewBox="0 0 32 20" style={{ ...sealSvgStyle, width: "8cqw" }}>
          <rect
            x="2"
            y="4"
            width="28"
            height="11"
            rx="0"
            fill="rgba(213,196,150,0.55)"
            stroke="rgba(120,92,48,0.35)"
            strokeWidth="1"
            transform="rotate(-6 16 10)"
          />
        </svg>
      )}
      {kind === "ribbon" && (
        <svg viewBox="0 0 28 20" style={{ ...sealSvgStyle, width: "7cqw" }}>
          <path
            d="M14 10 L4 4 Q2 9 6 11 Q2 13 4 17 Z"
            fill="#6f4f2e"
            stroke="#4d3620"
            strokeWidth="1"
          />
          <path
            d="M14 10 L24 4 Q26 9 22 11 Q26 13 24 17 Z"
            fill="#6f4f2e"
            stroke="#4d3620"
            strokeWidth="1"
          />
          <circle cx="14" cy="10" r="2.4" fill="#4d3620" />
        </svg>
      )}
    </span>
  );
}

// Red cancellation postmark marking letters written back to the current user.
export function Postmark() {
  return (
    <svg viewBox="0 0 40 40" style={postmarkStyle} aria-hidden>
      <g fill="none" stroke="#b23a2b" strokeWidth="2" strokeLinecap="round" opacity="0.82">
        <circle cx="20" cy="20" r="16" />
        <circle cx="20" cy="20" r="11" strokeWidth="1.3" />
        <path
          d="M20 11 l2.2 5 5.4 .4 -4.1 3.5 1.3 5.3 -4.8-2.9 -4.8 2.9 1.3-5.3 -4.1-3.5 5.4-.4z"
          strokeWidth="1.3"
        />
      </g>
    </svg>
  );
}

// A pinned note summarizing one letter; replies carry the red postmark.
export function LetterCard({
  item,
  onOpen,
}: {
  item: CardItem;
  onOpen: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...cardStyle, ...(hover ? cardHoverStyle : null) }}
    >
      {/* Envelope flap so the note reads as sealed mail, not a plain card. */}
      <svg viewBox="0 0 100 22" preserveAspectRatio="none" style={flapStyle} aria-hidden>
        <polyline points="2,2 50,20 98,2" fill="none" stroke="rgba(58,44,34,0.35)" strokeWidth="1.2" />
      </svg>

      <Seal kind={item.seal} />
      {item.isReply && <Postmark />}

      <p style={cardSummaryStyle}>
        <span style={{ color: RULE, marginRight: "1cqw" }}>{"\u2726"}</span>
        {item.summary ?? "A letter waiting to be read."}
      </p>
      <span style={{ ...readLinkStyle, ...(hover ? { color: INK } : null) }}>Read letter</span>
    </button>
  );
}

// Full letter on a single sheet, with a Reply action. `body` may arrive after a
// network fetch, so a loading placeholder is shown until it's ready.
export function LetterDetail({
  title,
  body,
  loading,
  backLabel,
  onBack,
  onReply,
  onClose,
}: {
  title: string | null;
  body: string;
  loading?: boolean;
  backLabel: string;
  onBack: () => void;
  onReply: () => void;
  onClose: () => void;
}) {
  return (
    <div style={contentStyle}>
      <BackLink label={backLabel} onClick={onBack} />
      <CloseButton onClose={onClose} />
      <article style={{ ...sheetStyle, maxHeight: "90%" }}>
        <h3 style={letterTitleStyle}>{title || "A letter"}</h3>
        <Divider />
        <div style={letterBodyStyle}>{loading ? "Unfolding…" : body}</div>
        <Divider />
        <div style={{ display: "flex", justifyContent: "center", marginTop: "3cqw" }}>
          <button
            type="button"
            onClick={onReply}
            disabled={loading}
            style={amberButtonStyle(!loading)}
          >
            Reply
          </button>
        </div>
        <span style={foldStyle} aria-hidden />
      </article>
    </div>
  );
}

// The letter (full) above a fresh sheet to write a reply on. The whole page
// scrolls so the Post reply button is always reachable.
export function LetterReply({
  title,
  body,
  backLabel,
  onBack,
  onCancel,
  onClose,
  onPost,
  posting,
  error,
}: {
  title: string | null;
  body: string;
  backLabel: string;
  onBack: () => void;
  onCancel: () => void;
  onClose: () => void;
  onPost: (text: string) => void;
  posting?: boolean;
  error?: string | null;
}) {
  const [text, setText] = useState("");
  const playKeyClick = useKeyClicks(TYPE_SFX);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length === 1 || e.key === "Enter" || e.key === "Backspace") {
        playKeyClick();
      }
    },
    [playKeyClick],
  );

  const canPost = text.trim().length > 0 && !posting;

  return (
    <>
      <BackLink label={backLabel} onClick={onBack} />
      <CloseButton onClose={onClose} />
      <div style={replyScrollStyle}>
        <article style={sheetStyle}>
          <h3 style={letterTitleStyle}>{title || "A letter"}</h3>
          <Divider />
          <div style={letterBodyStyle}>{body}</div>
        </article>

        <article style={{ ...sheetStyle, marginTop: "3cqw" }}>
          <h3 style={letterTitleStyle}>Your reply</h3>
          <Divider />
          <textarea
            value={text}
            maxLength={MAX_BODY}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write your reply…"
            spellCheck={false}
            disabled={posting}
            style={replyTextareaStyle}
          />
          {error && (
            <p style={{ margin: "1.5cqw 0 0", color: "#b23a2b", fontSize: "3cqw" }}>
              {error}
            </p>
          )}
          <div style={replyFooterStyle}>
            <span style={countStyle}>
              {text.length} / {MAX_BODY}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "4cqw" }}>
              <button
                type="button"
                onClick={onCancel}
                disabled={posting}
                style={cancelLinkStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => canPost && onPost(text)}
                disabled={!canPost}
                style={amberButtonStyle(canPost)}
              >
                {posting ? "Sending…" : "Post reply"}
              </button>
            </div>
          </div>
        </article>
      </div>
    </>
  );
}

/* ------------------------------- styles ------------------------------- */

export const rootStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 20,
  containerType: "inline-size",
  overflow: "hidden",
  fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
};

export const contentStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "4cqw",
  boxSizing: "border-box",
};

export const titleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f3e8ca",
  fontSize: "3cqw",
  fontWeight: 700,
  letterSpacing: "0.3cqw",
  textShadow: "0 2px 6px rgba(0,0,0,0.6)",
};

export const subtitleStyle: React.CSSProperties = {
  margin: "1cqw 0 0",
  color: "#cbbb96",
  fontSize: "1.7cqw",
  letterSpacing: "0.1cqw",
  textShadow: "0 1px 4px rgba(0,0,0,0.6)",
};

export const gridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "3cqw",
  maxWidth: "84cqw",
};

const cardStyle: React.CSSProperties = {
  position: "relative",
  flex: "0 0 26cqw",
  minHeight: "15cqw",
  padding: "4cqw 3cqw 2.6cqw",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  textAlign: "left",
  background: `linear-gradient(180deg, ${PAPER_TOP} 0%, ${PAPER_BOT} 100%)`,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#c3ab77",
  borderRadius: 0,
  boxShadow: "3px 4px 0 0 rgba(0,0,0,0.4)",
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "transform 140ms ease, box-shadow 140ms ease",
};

const cardHoverStyle: React.CSSProperties = {
  transform: "translate(-1px, -2px)",
  boxShadow: "4px 6px 0 0 rgba(0,0,0,0.45)",
};

const flapStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "5cqw",
};

const sealWrapStyle: React.CSSProperties = {
  position: "absolute",
  top: "-2.4cqw",
  left: "50%",
  transform: "translateX(-50%)",
  filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.35))",
};

const sealSvgStyle: React.CSSProperties = {
  width: "5cqw",
  height: "auto",
  display: "block",
};

const postmarkStyle: React.CSSProperties = {
  position: "absolute",
  top: "3%",
  left: "3.5%",
  width: "7cqw",
  height: "7cqw",
  transform: "rotate(-14deg)",
  pointerEvents: "none",
};

const cardSummaryStyle: React.CSSProperties = {
  margin: "1.5cqw 0 0",
  color: INK,
  fontSize: "1.7cqw",
  lineHeight: 1.45,
  flex: 1,
};

const readLinkStyle: React.CSSProperties = {
  alignSelf: "flex-end",
  marginTop: "2cqw",
  color: INK_SOFT,
  fontSize: "1.5cqw",
  textDecoration: "underline",
  textUnderlineOffset: "2px",
};

const sheetStyle: React.CSSProperties = {
  position: "relative",
  flexShrink: 0,
  containerType: "inline-size",
  width: SHEET_W,
  aspectRatio: SHEET_RATIO,
  padding: "5.5% 6.5% 4.5%",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  background: `linear-gradient(180deg, ${PAPER_TOP} 0%, ${PAPER_BOT} 100%)`,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#c3ab77",
  borderRadius: 0,
  boxShadow: "0 22px 50px rgba(0,0,0,0.55), inset 0 0 60px rgba(120,92,48,0.12)",
};

const letterTitleStyle: React.CSSProperties = {
  margin: 0,
  textAlign: "center",
  color: INK,
  fontSize: "6cqw",
  fontWeight: 700,
  letterSpacing: "0.5cqw",
};

const letterBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  whiteSpace: "pre-line",
  color: INK,
  fontSize: "4cqw",
  lineHeight: 1.7,
  letterSpacing: "0.1cqw",
};

const replyScrollStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 1,
  overflowY: "auto",
  overflowX: "hidden",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  paddingTop: "9cqw",
  paddingBottom: "8cqw",
  boxSizing: "border-box",
};

const replyTextareaStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: "100%",
  resize: "none",
  border: "none",
  outline: "none",
  background: "transparent",
  color: INK,
  caretColor: WALNUT,
  fontFamily: "inherit",
  fontSize: "4cqw",
  lineHeight: 1.7,
  letterSpacing: "0.1cqw",
};

const replyFooterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3cqw",
  marginTop: "3cqw",
};

const countStyle: React.CSSProperties = {
  fontSize: "3.4cqw",
  color: INK_SOFT,
  letterSpacing: "0.2cqw",
};

const cancelLinkStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: INK_SOFT,
  fontFamily: "inherit",
  fontSize: "3.4cqw",
  textDecoration: "underline",
  textUnderlineOffset: "2px",
  cursor: "pointer",
};

export const amberButtonStyle = (enabled: boolean): React.CSSProperties => ({
  padding: "2cqw 4.5cqw",
  fontFamily: "inherit",
  fontSize: "3.6cqw",
  fontWeight: 700,
  letterSpacing: "0.2cqw",
  color: enabled ? INK : "#8f836a",
  background: enabled ? AMBER : "#c7bfa8",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: enabled ? AMBER_EDGE : "#a89f88",
  borderRadius: 0,
  boxShadow: enabled ? "1px 2px 0 0 rgba(0,0,0,0.28)" : "none",
  cursor: enabled ? "pointer" : "not-allowed",
});

const dividerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "2.5cqw",
  margin: "2.5cqw auto 4cqw",
  width: "34%",
};

const dividerLineStyle: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: RULE,
};

const dividerDiamondStyle: React.CSSProperties = {
  width: "2cqw",
  height: "2cqw",
  background: RULE,
  transform: "rotate(45deg)",
};

const foldStyle: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: 0,
  width: "5cqw",
  height: "5cqw",
  background: "linear-gradient(225deg, #c6b079 0 50%, transparent 50%)",
  boxShadow: "-1px 1px 1px rgba(0,0,0,0.12)",
};

const closeSquareStyle: React.CSSProperties = {
  position: "absolute",
  top: "2.5cqw",
  right: "2.5cqw",
  zIndex: 5,
  width: "3.2cqw",
  height: "3.2cqw",
  minWidth: 26,
  minHeight: 26,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "2.2cqw",
  lineHeight: 1,
  color: CREAM,
  background: "linear-gradient(180deg, #3c2b1d 0%, #2a1d13 100%)",
  borderWidth: 2,
  borderStyle: "solid",
  borderColor: AMBER_EDGE,
  borderRadius: 3,
  boxShadow: "2px 2px 0 0 rgba(0,0,0,0.5)",
  cursor: "pointer",
  fontFamily: '"Courier New", ui-monospace, monospace',
  transition: "color 150ms ease, border-color 150ms ease",
};

const backLinkStyle: React.CSSProperties = {
  position: "absolute",
  top: "2.7cqw",
  left: "2.7cqw",
  zIndex: 5,
  display: "inline-flex",
  alignItems: "center",
  background: "none",
  border: "none",
  padding: 0,
  color: CREAM,
  fontFamily: '"Courier New", ui-monospace, monospace',
  fontSize: "1.8cqw",
  fontWeight: 700,
  letterSpacing: "0.1cqw",
  cursor: "pointer",
  textShadow: "0 1px 4px rgba(0,0,0,0.6)",
  transition: "color 150ms ease",
};
