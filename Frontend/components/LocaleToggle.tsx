"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/messages";

const GOLD = "#e6a85c";
const NAVY = "#181c31";
const NAVY_DEEP = "#12162a";

/**
 * Pixel-style 中 / EN language toggle. Active locale is filled gold; the other
 * side is muted. Clicking either side (or the whole chip) switches locale.
 */
export default function LocaleToggle({
  variant = "panel",
}: {
  /** `panel` sits on the dark login card; `chip` is for light/scene corners. */
  variant?: "panel" | "chip";
}) {
  const { locale, setLocale, t } = useLocale();

  const pick = (next: Locale) => {
    if (next !== locale) setLocale(next);
  };

  const dark = variant === "panel";

  return (
    <div
      role="group"
      aria-label={locale === "zh" ? t("locale.switchToEn") : t("locale.switchToZh")}
      style={{
        ...baseStyle,
        background: dark
          ? `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`
          : `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
        borderColor: dark ? "rgba(230,168,92,0.7)" : "rgba(230,168,92,0.55)",
      }}
    >
      <i style={{ ...cornerStyle, top: -1, left: -1 }} />
      <i style={{ ...cornerStyle, top: -1, right: -1 }} />
      <i style={{ ...cornerStyle, bottom: -1, left: -1 }} />
      <i style={{ ...cornerStyle, bottom: -1, right: -1 }} />

      <button
        type="button"
        onClick={() => pick("zh")}
        aria-pressed={locale === "zh"}
        style={sideStyle(locale === "zh")}
      >
        中
      </button>
      <span aria-hidden style={slashStyle}>
        /
      </span>
      <button
        type="button"
        onClick={() => pick("en")}
        aria-pressed={locale === "en"}
        style={sideStyle(locale === "en")}
      >
        EN
      </button>
    </div>
  );
}

const baseStyle: React.CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: 0,
  padding: "3px 4px",
  border: "2px solid",
  boxShadow: "2px 2px 0 0 rgba(0,0,0,0.45)",
  fontFamily: '"Courier New", ui-monospace, monospace',
  userSelect: "none",
};

const cornerStyle: React.CSSProperties = {
  position: "absolute",
  width: 4,
  height: 4,
  background: GOLD,
  zIndex: 1,
  pointerEvents: "none",
};

const slashStyle: React.CSSProperties = {
  color: "rgba(230,168,92,0.55)",
  fontSize: 11,
  fontWeight: 700,
  padding: "0 1px",
  lineHeight: 1,
};

function sideStyle(active: boolean): React.CSSProperties {
  return {
    appearance: "none",
    border: "none",
    margin: 0,
    padding: "4px 7px",
    minWidth: 28,
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: active ? 0.5 : 0,
    lineHeight: 1,
    cursor: "pointer",
    color: active ? NAVY_DEEP : "rgba(239,228,201,0.55)",
    background: active
      ? `linear-gradient(180deg, #edb469 0%, ${GOLD} 55%, #d5993f 100%)`
      : "transparent",
    boxShadow: active ? "0 2px 0 0 #a9772f" : "none",
    borderRadius: 2,
  };
}
