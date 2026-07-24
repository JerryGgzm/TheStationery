"use client";

import { useState } from "react";

type Mode = "login" | "register";

// Pixel-art styled login / register window shown over the outdoor intro video.
// NOTE: This is UI-only for now — `onEnter` fires on submit so the door-opening
// sequence can play. Real Supabase auth will be wired in here later.
export default function LoginWindow({ onEnter }: { onEnter: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    (mode === "login" || confirm.length > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (mode === "register" && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    // TODO: replace with Supabase auth before playing the door sequence.
    onEnter();
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <div style={backdropStyle}>
      <form onSubmit={handleSubmit} style={panelStyle}>
        <i style={{ ...cornerStyle, top: 7, left: 7 }} />
        <i style={{ ...cornerStyle, top: 7, right: 7 }} />
        <i style={{ ...cornerStyle, bottom: 7, left: 7 }} />
        <i style={{ ...cornerStyle, bottom: 7, right: 7 }} />

        <div style={innerStyle}>
          <EnvelopeIcon />

          <h1 style={titleStyle}>
            {mode === "login" ? "Visit The Stationery" : "Join The Stationery"}
          </h1>
          <p style={subtitleStyle}>
            {mode === "login"
              ? "The bookstore has been waiting."
              : "A quiet place for your words."}
          </p>

          <label style={labelStyle}>
            EMAIL
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            PASSWORD
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              style={inputStyle}
            />
          </label>

          {mode === "register" && (
            <label style={labelStyle}>
              CONFIRM PASSWORD
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                style={inputStyle}
              />
            </label>
          )}

          {mode === "login" && (
            <div style={forgotRowStyle}>
              <button type="button" style={linkStyle} onClick={() => {}}>
                Forgot password?
              </button>
            </div>
          )}

          {error && <p style={errorStyle}>{error}</p>}

          <button type="submit" disabled={!canSubmit} style={submitStyle(canSubmit)}>
            {mode === "login" ? "Enter the Bookstore" : "Create Account"}
          </button>

          <div style={dividerStyle}>
            <span style={dividerLineStyle} />
            <span style={dividerDotStyle} />
            <span style={dividerLineStyle} />
          </div>

          <p style={footerStyle}>
            {mode === "login" ? (
              <>
                New here?{" "}
                <button type="button" onClick={() => switchMode("register")} style={linkStyle}>
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => switchMode("login")} style={linkStyle}>
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </form>
    </div>
  );
}

function EnvelopeIcon() {
  return (
    <svg
      width="46"
      height="34"
      viewBox="0 0 46 34"
      fill="none"
      stroke={GOLD}
      strokeWidth="2.4"
      strokeLinejoin="round"
      style={{ margin: "0 auto 4px", display: "block" }}
      aria-hidden
    >
      <rect x="2" y="3" width="42" height="28" rx="2" />
      <path d="M3 5 L23 20 L43 5" />
    </svg>
  );
}

const NAVY = "#181c31";
const NAVY_DEEP = "#12162a";
const GOLD = "#e6a85c";
const GOLD_SOFT = "#d8b877";
const CREAM = "#efe4c9";
const MUTED = "#9a9078";
const PAPER = "#e7d8b6";
const INK = "#3a2c22";
const BORDER = "rgba(230,168,92,0.55)";

const backdropStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 3,
};

const panelStyle: React.CSSProperties = {
  position: "relative",
  width: 360,
  maxWidth: "86vw",
  background: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
  border: `2px solid ${BORDER}`,
  boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
  fontFamily: '"Courier New", ui-monospace, monospace',
};

const cornerStyle: React.CSSProperties = {
  position: "absolute",
  width: 7,
  height: 7,
  background: GOLD,
  zIndex: 1,
};

const innerStyle: React.CSSProperties = {
  padding: "26px 30px 24px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  textAlign: "center",
  color: CREAM,
  fontSize: 25,
  fontWeight: 700,
  letterSpacing: 0.5,
  fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
};

const subtitleStyle: React.CSSProperties = {
  margin: "0 0 6px",
  textAlign: "center",
  color: MUTED,
  fontSize: 12.5,
  letterSpacing: 0.3,
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 11,
  letterSpacing: 2,
  color: GOLD_SOFT,
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  color: INK,
  background: PAPER,
  border: "1px solid #b9a577",
  borderRadius: 4,
  outline: "none",
  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.15)",
};

const forgotRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: -4,
};

const errorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "#e0897f",
  fontWeight: 700,
  textAlign: "center",
};

const submitStyle = (enabled: boolean): React.CSSProperties => ({
  marginTop: 4,
  padding: "12px 0",
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: 0.5,
  fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
  color: INK,
  background: enabled
    ? `linear-gradient(180deg, #edb469 0%, ${GOLD} 55%, #d5993f 100%)`
    : "#7a7360",
  border: `1px solid ${enabled ? "#c9923f" : "#6b6452"}`,
  borderRadius: 5,
  boxShadow: enabled ? "0 3px 0 0 #a9772f, 0 5px 10px rgba(0,0,0,0.35)" : "none",
  cursor: enabled ? "pointer" : "not-allowed",
});

const dividerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginTop: 8,
};

const dividerLineStyle: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: "rgba(230,168,92,0.3)",
};

const dividerDotStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  background: GOLD,
};

const footerStyle: React.CSSProperties = {
  margin: 0,
  textAlign: "center",
  fontSize: 12.5,
  color: MUTED,
};

const linkStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: GOLD,
  fontFamily: "inherit",
  fontSize: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};
