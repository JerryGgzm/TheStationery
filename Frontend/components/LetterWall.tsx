"use client";

import { useCallback, useEffect, useState } from "react";

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
import {
  getBoard,
  openDelivery,
  replyToDelivery,
  type BoardDelivery,
  type OpenedLetter,
} from "@/lib/api";

// The letter-wall reading experience shown after the wall fade transition.
// Three views over one dimmed, pixelated-blurred board backdrop:
//   list   → pinned notes from GET /board (each an AI summary; replies get a
//            red postmark)
//   detail → the full letter, fetched on open via POST /deliveries/{id}/open
//   reply  → the letter with a fresh sheet; posting hits
//            POST /deliveries/{id}/reply, then hands off to the shared "mail
//            sent" animation via onReplyPosted.
type View =
  | { kind: "list" }
  | { kind: "detail"; deliveryId: string }
  | { kind: "reply"; deliveryId: string };

export default function LetterWall({
  bgSrc,
  onClose,
  onReplyPosted,
}: {
  bgSrc: string;
  onClose: () => void;
  onReplyPosted: () => void;
}) {
  const [view, setView] = useState<View>({ kind: "list" });

  const [deliveries, setDeliveries] = useState<BoardDelivery[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The opened letter body (fetched lazily when a card is opened).
  const [letter, setLetter] = useState<OpenedLetter | null>(null);
  const [letterLoading, setLetterLoading] = useState(false);

  const [posting, setPosting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getBoard()
      .then((res) => alive && setDeliveries(res.deliveries))
      .catch((e) => alive && setLoadError(e?.message || "Couldn't load the wall."));
    return () => {
      alive = false;
    };
  }, []);

  const open = useCallback(async (deliveryId: string) => {
    setView({ kind: "detail", deliveryId });
    setLetter(null);
    setLetterLoading(true);
    try {
      const res = await openDelivery(deliveryId);
      setLetter(res.letter);
    } catch (e) {
      setLetter({
        id: "",
        subject: null,
        title: "Couldn't open this letter",
        body: (e as Error)?.message || "Please try again.",
        author_display: null,
        language_code: "en",
      });
    } finally {
      setLetterLoading(false);
    }
  }, []);

  const post = useCallback(
    async (deliveryId: string, text: string) => {
      setPosting(true);
      setReplyError(null);
      try {
        await replyToDelivery(deliveryId, text);
        onReplyPosted();
      } catch (e) {
        setReplyError((e as Error)?.message || "Couldn't send your reply.");
      } finally {
        setPosting(false);
      }
    },
    [onReplyPosted],
  );

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

          {loadError ? (
            <p style={subtitleStyle}>{loadError}</p>
          ) : deliveries === null ? (
            <p style={subtitleStyle}>Gathering letters…</p>
          ) : deliveries.length === 0 ? (
            <p style={subtitleStyle}>
              The wall is quiet for now. Check back soon.
            </p>
          ) : (
            <div style={gridStyle}>
              {deliveries.map((d) => (
                <LetterCard
                  key={d.delivery_id}
                  item={{ summary: d.summary, seal: d.seal, isReply: d.is_reply }}
                  onOpen={() => open(d.delivery_id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {view.kind === "detail" && (
        <LetterDetail
          title={letter?.title ?? null}
          body={letter?.body ?? ""}
          loading={letterLoading}
          backLabel="Back to letters"
          onBack={() => setView({ kind: "list" })}
          onReply={() => {
            setReplyError(null);
            setView({ kind: "reply", deliveryId: view.deliveryId });
          }}
          onClose={onClose}
        />
      )}

      {view.kind === "reply" && (
        <LetterReply
          title={letter?.title ?? null}
          body={letter?.body ?? ""}
          backLabel="Back to letters"
          onBack={() => setView({ kind: "list" })}
          onCancel={() => setView({ kind: "detail", deliveryId: view.deliveryId })}
          onClose={onClose}
          onPost={(text) => post(view.deliveryId, text)}
          posting={posting}
          error={replyError}
        />
      )}
    </div>
  );
}
