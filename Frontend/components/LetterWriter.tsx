"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import DraftBox from "@/components/DraftBox";
import PixelBlurBg from "@/components/PixelBlurBg";
import { useKeyClicks } from "@/lib/audio/useKeyClicks";
import { ApiError, postLetter, saveDraft, type MyLetter } from "@/lib/api";
import { USERNAME_RE, normalizeHandle } from "@/lib/auth";
import { useT, type MessageKey } from "@/lib/i18n";
import { MAX_BODY } from "@/lib/limits";

// The letter-writing surface shown after the desk unfold animation.
// The desk stays as a dimmed, pixelated-blurred backdrop; the sheet of paper is
// enlarged as the sole focus and *is* the input area (no extra modal/toolbar).
// Palette stays no-radius, low-saturation walnut + warm paper.
const SUBJECT_MAX = 80;
const TYPE_SFX = "/assets/audio/sound_effect/打字声.MP3";

// Longest @handle accepted in the "to" field (matches USERNAME_RE in lib/auth).
const USERNAME_MAX = 20;

type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

export interface LetterDraft {
  text: string;
  // null when the letter is left for a stranger to find (public model).
  recipient: string | null;
}

// Turn backend error codes into a short, human line shown under the sheet.
function postErrorMessage(e: unknown, t: TFn): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "recipient_not_found":
        return t("writer.err.recipientNotFound");
      case "recipient_self":
        return t("writer.err.recipientSelf");
      case "recipient_format":
        return t("writer.err.recipientFormat");
      case "safety_rejected":
        return t("writer.err.safety");
      case "rate_limited":
        return t("writer.err.rateLimited");
      case "body_length":
        return t("writer.err.bodyLength");
    }
    return e.message;
  }
  return (e as Error)?.message || t("writer.err.generic");
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
  const t = useT();
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [to, setTo] = useState("");
  // Set when continuing an existing server-side draft, so saving/publishing
  // updates that row instead of creating a new one.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftBoxOpen, setDraftBoxOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const playKeyClick = useKeyClicks(TYPE_SFX);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  const handleContinueDraft = useCallback((d: MyLetter) => {
    setText(d.body);
    setSubject(d.subject ?? "");
    setTo(d.recipient_username ?? "");
    setDraftId(d.letter_id);
    setDraftBoxOpen(false);
    setPostError(null);
  }, []);

  const handlePutInDrafts = useCallback(async () => {
    if (text.trim().length === 0 || savingDraft || posting) return;
    const handle = normalizeHandle(to);
    if (handle && !USERNAME_RE.test(handle)) return;
    setSavingDraft(true);
    setPostError(null);
    try {
      await saveDraft({
        draftId,
        body: text,
        subject: subject.trim() || null,
        recipient_username: handle || null,
      });
      // Save-and-close: tuck it away and return to the bookstore.
      onClose();
    } catch (e) {
      setPostError(postErrorMessage(e, t));
      setSavingDraft(false);
    }
  }, [text, subject, to, draftId, savingDraft, posting, onClose, t]);

  const handlePost = useCallback(async () => {
    if (text.trim().length === 0 || posting) return;
    const handle = normalizeHandle(to);
    if (handle && !USERNAME_RE.test(handle)) return;

    setPosting(true);
    setPostError(null);
    try {
      // Update/create the draft then publish it (safety review + AI summary run
      // on publish). On success, hand off to the parent, which plays the shared
      // "mail sent" animation and closes.
      await postLetter({
        draftId,
        body: text,
        subject: subject.trim() || null,
        recipient_username: handle || null,
      });
      onPost?.({ text, recipient: handle || null });
    } catch (e) {
      setPostError(postErrorMessage(e, t));
      setPosting(false);
    }
  }, [text, subject, to, draftId, posting, onPost, t]);

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
  const canPost = text.trim().length > 0 && !recipientInvalid && !posting;

  return (
    <div style={stageStyle}>
      {/* Dimmed, pixelated-blurred desk backdrop. */}
      <PixelBlurBg src={bgSrc} />

      {/* The sheet of paper — this whole panel is the writing surface. */}
      <div style={paperStyle}>
        <button
          type="button"
          aria-label={t("common.close")}
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

        <h2 style={titleStyle}>{t("writer.title")}</h2>
        <div style={dividerStyle} aria-hidden>
          <span style={dividerLineStyle} />
          <span style={dividerDiamondStyle} />
          <span style={dividerLineStyle} />
        </div>

        {/* Title / subject — optional; doubles as the draft box label and the
            heading shown when someone reads the letter. */}
        <div style={subjectRowStyle}>
          <input
            type="text"
            value={subject}
            maxLength={SUBJECT_MAX}
            onChange={(e) => setSubject(e.target.value)}
            onKeyDown={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1)
                playKeyClick();
            }}
            placeholder={t("writer.subjectPlaceholder")}
            spellCheck={false}
            aria-label={t("writer.subjectAria")}
            style={subjectInputStyle}
          />
        </div>

        {/* Address line — optional recipient handle. Blank = left for a stranger. */}
        <div style={toRowStyle}>
          <span style={toLabelStyle}>{t("writer.to")}</span>
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
            placeholder={t("writer.toPlaceholder")}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            aria-label={t("writer.toAria")}
            aria-invalid={recipientInvalid}
            style={toInputStyle(recipientInvalid)}
          />
        </div>

        <textarea
          ref={taRef}
          value={text}
          maxLength={MAX_BODY}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("writer.bodyPlaceholder")}
          spellCheck={false}
          style={textareaStyle}
        />

        <div style={footerStyle}>
          <span style={{ ...countStyle, ...((postError || recipientInvalid) ? errorTextStyle : null) }}>
            {postError
              ? postError
              : recipientInvalid
                ? t("writer.handleFormat")
                : savingDraft
                  ? t("writer.tucking")
                  : `${text.length} / ${MAX_BODY}`}
          </span>
          <div style={actionsStyle}>
            <button
              type="button"
              onClick={handlePutInDrafts}
              disabled={text.trim().length === 0 || savingDraft || posting}
              style={saveLinkStyle}
            >
              {t("writer.putInDrafts")}
            </button>
            <button
              type="button"
              onClick={handlePost}
              disabled={!canPost}
              style={postStyle(canPost)}
            >
              {posting ? t("common.sending") : t("writer.post")}
            </button>
          </div>
        </div>

        <span style={foldStyle} aria-hidden />
      </div>

      {/* Drafts drawer on the desk — opens the saved-drafts picker. */}
      <button
        type="button"
        onClick={() => setDraftBoxOpen(true)}
        style={draftsIconStyle}
        aria-label={t("writer.draftsAria")}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
        }}
      >
        <span style={draftsDrawerStyle} aria-hidden>
          <span style={draftsPapersStyle} />
          <span style={draftsHandleStyle} />
        </span>
        <span style={draftsLabelStyle}>{t("writer.drafts")}</span>
      </button>

      {draftBoxOpen && (
        <DraftBox onClose={() => setDraftBoxOpen(false)} onContinue={handleContinueDraft} />
      )}
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

const subjectRowStyle: React.CSSProperties = {
  marginBottom: "2.4cqw",
  paddingBottom: "1.6cqw",
  borderBottom: `1px solid ${RULE}`,
};

const subjectInputStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  color: INK,
  caretColor: WALNUT,
  fontFamily: "inherit",
  fontSize: "4.6cqw",
  fontWeight: 700,
  letterSpacing: "0.15cqw",
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

const errorTextStyle: React.CSSProperties = {
  color: "#a24a34",
  fontWeight: 700,
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

// Drafts drawer sitting on the desk to the right of the paper.
const draftsIconStyle: React.CSSProperties = {
  position: "absolute",
  zIndex: 2,
  top: "20%",
  right: "5%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  transition: "transform 160ms ease",
};

const draftsDrawerStyle: React.CSSProperties = {
  position: "relative",
  display: "block",
  width: 58,
  height: 40,
  background: "linear-gradient(180deg, #6f4f2e 0%, #4a3320 100%)",
  border: "2px solid #855f38",
  borderRadius: 3,
  boxShadow: "0 6px 14px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(202,161,92,0.25)",
};

// A few sheets of paper peeking out the top of the drawer.
const draftsPapersStyle: React.CSSProperties = {
  position: "absolute",
  top: -7,
  left: "50%",
  transform: "translateX(-50%)",
  width: 40,
  height: 12,
  background: `linear-gradient(180deg, ${PAPER_TOP} 0%, ${PAPER_BOT} 100%)`,
  border: "1px solid #c3ab77",
  borderBottom: "none",
  boxShadow: "3px -3px 0 -1px #d9c79c, -3px -3px 0 -1px #d9c79c",
};

const draftsHandleStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 8,
  left: "50%",
  transform: "translateX(-50%)",
  width: 22,
  height: 6,
  background: AMBER,
  border: `1px solid ${AMBER_EDGE}`,
  borderRadius: 2,
};

const draftsLabelStyle: React.CSSProperties = {
  color: "#e7d8b3",
  fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
  fontSize: 13,
  letterSpacing: 0.4,
  textShadow: "0 1px 3px rgba(0,0,0,0.8)",
};
