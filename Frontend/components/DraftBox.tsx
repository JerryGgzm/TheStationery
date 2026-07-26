"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AMBER_EDGE,
  CREAM,
  INK,
  INK_SOFT,
  PAPER_BOT,
  PAPER_TOP,
  Seal,
  WALNUT,
} from "@/components/letterkit";
import { deleteLetter, listMyLetters, type MyLetter } from "@/lib/api";
import { sealFor } from "@/lib/derive";

// The "Draft box" picker: a walnut drawer of saved drafts. Opened from the
// Drafts icon on the writing desk. Each slip shows a title + "Edited X ago" and
// a Continue action that loads the draft back into the writer. Drafts can also
// be discarded (DELETE /letters/{id}).

// A draft with no explicit title falls back to its opening line.
function draftTitle(d: MyLetter): string {
  if (d.subject && d.subject.trim()) return d.subject.trim();
  const firstLine = d.body.replace(/\s+/g, " ").trim();
  if (!firstLine) return "Untitled letter";
  return firstLine.length > 48 ? `${firstLine.slice(0, 48).trimEnd()}…` : firstLine;
}

function editedLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "Edited just now";
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `Edited ${m} minute${m > 1 ? "s" : ""} ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `Edited ${h} hour${h > 1 ? "s" : ""} ago`;
  }
  const days = Math.floor(diff / 86400);
  if (days === 1) return "Edited yesterday";
  if (days < 7) return `Edited ${days} days ago`;
  return `Edited ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export default function DraftBox({
  onClose,
  onContinue,
}: {
  onClose: () => void;
  onContinue: (draft: MyLetter) => void;
}) {
  const [drafts, setDrafts] = useState<MyLetter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listMyLetters("draft")
      .then((res) => alive && setDrafts(res.letters))
      .catch((e) => alive && setError(e?.message || "Couldn't open the draft box."));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const discard = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      await deleteLetter(id);
      setDrafts((prev) => (prev ? prev.filter((d) => d.letter_id !== id) : prev));
    } catch (e) {
      setError((e as Error)?.message || "Couldn't discard that draft.");
    } finally {
      setBusyId(null);
    }
  }, []);

  return (
    <div style={backdropStyle} onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
      <div style={drawerStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <button type="button" aria-label="关闭" onClick={onClose} style={closeStyle}>
            {"\u00d7"}
          </button>
          <h2 style={titleStyle}>Draft box</h2>
          <p style={subtitleStyle}>Choose a letter to continue.</p>
        </div>

        <div style={listStyle}>
          {error ? (
            <p style={emptyStyle}>{error}</p>
          ) : drafts === null ? (
            <p style={emptyStyle}>Opening the drawer…</p>
          ) : drafts.length === 0 ? (
            <p style={emptyStyle}>No drafts yet. Half-written letters you tuck away land here.</p>
          ) : (
            drafts.map((d) => (
              <div key={d.letter_id} style={slipStyle}>
                <Seal kind={sealFor(d.letter_id)} />
                <div style={slipTextStyle}>
                  <div style={slipTitleStyle}>{draftTitle(d)}</div>
                  <div style={slipMetaStyle}>
                    {editedLabel(d.updated_at ?? d.created_at)}
                    {d.recipient_username ? `  ·  to @${d.recipient_username}` : ""}
                  </div>
                </div>
                <div style={slipActionsStyle}>
                  <button
                    type="button"
                    onClick={() => onContinue(d)}
                    style={continueStyle}
                    onMouseEnter={(e) => (e.currentTarget.style.color = INK)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = INK_SOFT)}
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    onClick={() => discard(d.letter_id)}
                    disabled={busyId === d.letter_id}
                    style={discardStyle}
                  >
                    {busyId === d.letter_id ? "…" : "Discard"}
                  </button>
                </div>
                <span style={foldStyle} aria-hidden />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- styles ------------------------------- */

const backdropStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(6,8,16,0.55)",
  containerType: "inline-size",
  fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
};

// Walnut drawer shell matching the desk.
const drawerStyle: React.CSSProperties = {
  position: "relative",
  width: "min(52cqw, 620px)",
  maxWidth: "90%",
  maxHeight: "86%",
  display: "flex",
  flexDirection: "column",
  background: "linear-gradient(180deg, #3a281a 0%, #2c1f14 100%)",
  border: "3px solid #6f4f2e",
  borderRadius: 4,
  boxShadow: "0 22px 50px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(202,161,92,0.25)",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  position: "relative",
  padding: "14px 18px 12px",
  textAlign: "center",
  background: "linear-gradient(180deg, #4a3320 0%, #3a281a 100%)",
  borderBottom: `1px solid ${WALNUT}`,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: CREAM,
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: 0.5,
};

const subtitleStyle: React.CSSProperties = {
  margin: "3px 0 0",
  color: "#c9b48a",
  fontSize: 12.5,
  letterSpacing: 0.3,
};

const closeStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  width: 26,
  height: 26,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 16,
  lineHeight: 1,
  color: CREAM,
  background: "transparent",
  border: `1px solid ${AMBER_EDGE}`,
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: '"Courier New", ui-monospace, monospace',
};

const listStyle: React.CSSProperties = {
  padding: "16px 18px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  overflowY: "auto",
};

const emptyStyle: React.CSSProperties = {
  margin: "18px 0",
  textAlign: "center",
  color: "#c9b48a",
  fontSize: 14,
};

// Each draft is a paper slip peeking out of the drawer.
const slipStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "16px 20px",
  background: `linear-gradient(180deg, ${PAPER_TOP} 0%, ${PAPER_BOT} 100%)`,
  border: "1px solid #c3ab77",
  boxShadow: "2px 3px 0 0 rgba(0,0,0,0.35)",
};

const slipTextStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const slipTitleStyle: React.CSSProperties = {
  color: INK,
  fontSize: 16,
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const slipMetaStyle: React.CSSProperties = {
  marginTop: 3,
  color: INK_SOFT,
  fontSize: 12,
  letterSpacing: 0.2,
};

const slipActionsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 6,
  flexShrink: 0,
};

const continueStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: INK_SOFT,
  fontFamily: "inherit",
  fontSize: 14,
  textDecoration: "underline",
  textUnderlineOffset: 2,
  cursor: "pointer",
  transition: "color 150ms ease",
};

const discardStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#a4643f",
  fontFamily: '"Courier New", ui-monospace, monospace',
  fontSize: 11,
  letterSpacing: 0.3,
  cursor: "pointer",
};

const foldStyle: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: 0,
  width: 16,
  height: 16,
  background: "linear-gradient(225deg, #c6b079 0 50%, transparent 50%)",
  boxShadow: "-1px 1px 1px rgba(0,0,0,0.12)",
};
