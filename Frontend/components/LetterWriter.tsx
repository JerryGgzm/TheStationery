"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import PixelBlurBg from "@/components/PixelBlurBg";
import { useKeyClicks } from "@/lib/audio/useKeyClicks";

// The letter-writing surface shown after the desk unfold animation.
// The desk stays as a dimmed, pixelated-blurred backdrop; the sheet of paper is
// enlarged as the sole focus and *is* the input area (no extra modal/toolbar).
// Palette stays no-radius, low-saturation walnut + warm paper.
const MAX_CHARS = 1000;
const DRAFT_KEY = "stationery_letter_draft";
const TYPE_SFX = "/assets/audio/sound_effect/打字声.MP3";

// Unique handle rules (kept in sync with the profiles.username design):
// 3–20 chars, must start with a letter, then letters / digits / underscore.
// Case-insensitive; normalised to lowercase before comparison / delivery.
const USERNAME_MAX = 20;
const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
const normalizeHandle = (v: string) =>
  v.trim().replace(/^@+/, "").toLowerCase();

export interface LetterDraft {
  text: string;
  // null when the letter is left for a stranger to find (public model).
  recipient: string | null;
}

// Warm paper / ink / walnut tokens (kept in sync with the login window).
const PAPER_TOP = "#e7d8b3";
const PAPER_BOT = "#ddcca2";
const INK = "#3a2c22";
const INK_SOFT = "#7d6a4c";
const RULE = "#b9a06a";
const WALNUT = "#6f4f2e";
const AMBER = "#caa15c";
const AMBER_EDGE = "#9c7b3a";

export default function LetterWriter({
  bgSrc,
  onClose,
  onPost,
}: {
  bgSrc: string;
  onClose: () => void;
  onPost?: (draft: LetterDraft) => void;
}) {
  const [text, setText] = useState("");
  const [to, setTo] = useState("");
  const [saved, setSaved] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const savedTimer = useRef<number | null>(null);
  const playKeyClick = useKeyClicks(TYPE_SFX);

  // Restore any saved draft and focus the sheet.
  useEffect(() => {
    try {
      const d = window.localStorage.getItem(DRAFT_KEY);
      if (d) {
        // Drafts are stored as JSON { text, recipient }; fall back to treating a
        // bare string as legacy body-only drafts.
        try {
          const parsed = JSON.parse(d) as Partial<LetterDraft>;
          if (parsed && typeof parsed === "object") {
            if (typeof parsed.text === "string") setText(parsed.text);
            if (typeof parsed.recipient === "string") setTo(parsed.recipient);
          } else {
            setText(d);
          }
        } catch {
          setText(d);
        }
      }
    } catch {
      // ignore storage errors (private mode, etc.)
    }
    taRef.current?.focus();
    return () => {
      if (savedTimer.current != null) window.clearTimeout(savedTimer.current);
    };
  }, []);

  const flashSaved = useCallback(() => {
    setSaved(true);
    if (savedTimer.current != null) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1600);
  }, []);

  const handleSaveDraft = useCallback(() => {
    try {
      const draft: LetterDraft = { text, recipient: to.trim() || null };
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignore
    }
    flashSaved();
  }, [text, to, flashSaved]);

  const handlePost = useCallback(() => {
    if (text.trim().length === 0) return;
    const handle = normalizeHandle(to);
    if (handle && !USERNAME_RE.test(handle)) return;
    // Backend delivery is wired later; clear the local draft and hand the
    // normalised recipient (null = public) to the parent, which plays the
    // "mail sent" animation and closes.
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    onPost?.({ text, recipient: handle || null });
  }, [text, to, onPost]);

  // One keystroke → one click. Skip modifiers/navigation and shortcut combos.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length === 1 || e.key === "Enter" || e.key === "Backspace") {
        playKeyClick();
      }
    },
    [playKeyClick],
  );

  const handle = normalizeHandle(to);
  const recipientInvalid = handle.length > 0 && !USERNAME_RE.test(handle);
  const canPost = text.trim().length > 0 && !recipientInvalid;

  return (
    <div style={stageStyle}>
      {/* Dimmed, pixelated-blurred desk backdrop. */}
      <PixelBlurBg src={bgSrc} />

      {/* The sheet of paper — this whole panel is the writing surface. */}
      <div style={paperStyle}>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          style={closeStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(111,79,46,0.14)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          {"\u00d7"}
        </button>

        <h2 style={titleStyle}>Write a letter</h2>
        <div style={dividerStyle} aria-hidden>
          <span style={dividerLineStyle} />
          <span style={dividerDiamondStyle} />
          <span style={dividerLineStyle} />
        </div>

        {/* Address line — optional recipient handle. Blank = left for a stranger. */}
        <div style={toRowStyle}>
          <span style={toLabelStyle}>To</span>
          <span style={toAtStyle} aria-hidden>
            @
          </span>
          <input
            type="text"
            value={to}
            maxLength={USERNAME_MAX}
            onChange={(e) => setTo(e.target.value.replace(/^@+/, ""))}
            onKeyDown={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1)
                playKeyClick();
            }}
            placeholder="username (leave blank for a stranger)"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            aria-label="Recipient username"
            aria-invalid={recipientInvalid}
            style={toInputStyle(recipientInvalid)}
          />
        </div>

        <textarea
          ref={taRef}
          value={text}
          maxLength={MAX_CHARS}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Begin writing…"
          spellCheck={false}
          style={textareaStyle}
        />

        <div style={footerStyle}>
          <span style={countStyle}>
            {recipientInvalid
              ? "Handle: 3–20 letters, digits or _"
              : saved
                ? "Draft saved"
                : `${text.length} / ${MAX_CHARS}`}
          </span>
          <div style={actionsStyle}>
            <button type="button" onClick={handleSaveDraft} style={saveLinkStyle}>
              Save draft
            </button>
            <button
              type="button"
              onClick={handlePost}
              disabled={!canPost}
              style={postStyle(canPost)}
            >
              Post letter
            </button>
          </div>
        </div>

        <span style={foldStyle} aria-hidden />
      </div>
    </div>
  );
}

const stageStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const paperStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  containerType: "inline-size",
  width: "37%",
  height: "86%",
  padding: "5.5% 6.5% 4.5%",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  background: `linear-gradient(180deg, ${PAPER_TOP} 0%, ${PAPER_BOT} 100%)`,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#c3ab77",
  borderRadius: 0,
  boxShadow:
    "0 22px 50px rgba(0,0,0,0.55), inset 0 0 60px rgba(120,92,48,0.12)",
  fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
};

const closeStyle: React.CSSProperties = {
  position: "absolute",
  top: "4.5%",
  right: "5%",
  width: "8cqw",
  height: "8cqw",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "5.5cqw",
  lineHeight: 1,
  color: INK,
  background: "transparent",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: WALNUT,
  borderRadius: 0,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "background 150ms ease",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  textAlign: "center",
  color: INK,
  fontSize: "6cqw",
  fontWeight: 700,
  letterSpacing: "0.5cqw",
};

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

const toRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "1.4cqw",
  marginBottom: "3.2cqw",
  paddingBottom: "1.6cqw",
  borderBottom: `1px solid ${RULE}`,
};

const toLabelStyle: React.CSSProperties = {
  color: INK_SOFT,
  fontSize: "3.4cqw",
  fontStyle: "italic",
  letterSpacing: "0.1cqw",
};

const toAtStyle: React.CSSProperties = {
  color: WALNUT,
  fontSize: "3.8cqw",
  fontWeight: 700,
};

const toInputStyle = (invalid: boolean): React.CSSProperties => ({
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: invalid ? "#a24a34" : INK,
  caretColor: WALNUT,
  fontFamily: "inherit",
  fontSize: "3.8cqw",
  letterSpacing: "0.15cqw",
});

const textareaStyle: React.CSSProperties = {
  flex: 1,
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

const footerStyle: React.CSSProperties = {
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

const actionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "4cqw",
};

const saveLinkStyle: React.CSSProperties = {
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

const postStyle = (enabled: boolean): React.CSSProperties => ({
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

// A subtle dog-eared fold in the bottom-right corner of the sheet.
const foldStyle: React.CSSProperties = {
  position: "absolute",
  right: 0,
  bottom: 0,
  width: "5cqw",
  height: "5cqw",
  background: "linear-gradient(315deg, #c6b079 0 50%, transparent 50%)",
  boxShadow: "-1px -1px 1px rgba(0,0,0,0.12)",
};
