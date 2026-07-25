"use client";

import { useState } from "react";

import PixelBlurBg from "@/components/PixelBlurBg";
import {
  CloseButton,
  LetterCard,
  LetterDetail,
  LetterReply,
  contentStyle,
  gridStyle,
  rootStyle,
  subtitleStyle,
  titleStyle,
} from "@/components/letterkit";
import { SAMPLE_LETTERS, getLetter } from "@/lib/letters";

// The letter-wall reading experience shown after the wall fade transition.
// Three views over one dimmed, pixelated-blurred board backdrop:
//   list   → five pinned notes, each an AI summary (replies carry a red postmark)
//   detail → the full letter, with a Reply action
//   reply  → the letter with a fresh sheet to write back on
// Posting a reply hands off to the parent, which plays the shared "mail sent"
// animation — the same delivery flow as writing a new letter.
type View =
  | { kind: "list" }
  | { kind: "detail"; id: string }
  | { kind: "reply"; id: string };

export default function LetterWall({
  bgSrc,
  onClose,
  onReplyPosted,
}: {
  bgSrc: string;
  onClose: () => void;
  onReplyPosted: (letterId: string, text: string) => void;
}) {
  const [view, setView] = useState<View>({ kind: "list" });

  return (
    <div style={rootStyle}>
      <PixelBlurBg src={bgSrc} brightness={0.42} />

      {view.kind === "list" && (
        <div style={contentStyle}>
          <CloseButton onClose={onClose} />
          <header style={{ textAlign: "center", marginBottom: "3cqw" }}>
            <h2 style={titleStyle}>Letters on the wall</h2>
            <p style={subtitleStyle}>Choose one to unfold.</p>
          </header>
          <div style={gridStyle}>
            {SAMPLE_LETTERS.map((l) => (
              <LetterCard
                key={l.id}
                letter={l}
                onOpen={() => setView({ kind: "detail", id: l.id })}
              />
            ))}
          </div>
        </div>
      )}

      {view.kind === "detail" && (
        <LetterDetail
          letter={getLetter(view.id)!}
          backLabel="Back to letters"
          onBack={() => setView({ kind: "list" })}
          onReply={() => setView({ kind: "reply", id: view.id })}
          onClose={onClose}
        />
      )}

      {view.kind === "reply" && (
        <LetterReply
          letter={getLetter(view.id)!}
          backLabel="Back to letters"
          onBack={() => setView({ kind: "list" })}
          onCancel={() => setView({ kind: "detail", id: view.id })}
          onClose={onClose}
          onPost={(text) => onReplyPosted(view.id, text)}
        />
      )}
    </div>
  );
}
