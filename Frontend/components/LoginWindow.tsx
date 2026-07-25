"use client";

import { useEffect, useState } from "react";
import {
  login,
  normalizeHandle,
  register,
  resendConfirmation,
  USERNAME_RE,
} from "@/lib/auth";
import { checkUsernamePublic } from "@/lib/api";

type Mode = "login" | "register";

// Live username-availability states shown under the register handle field.
type HandleStatus = "idle" | "invalid" | "checking" | "available" | "taken" | "error";

// Pixel-art styled login / register window shown over the outdoor intro video.
// On success `onEnter()` fires so the door-opening sequence can play. Register
// runs Supabase signUp then bootstraps the profile via PATCH /me/profile.
export default function LoginWindow({ onEnter }: { onEnter: () => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [handleStatus, setHandleStatus] = useState<HandleStatus>("idle");
  // Set after a signup that needs email confirmation, so we can offer a
  // "resend confirmation email" action on the following login screen.
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const handle = normalizeHandle(username);

  // Debounced live availability check while registering. A stale-response guard
  // (`cancelled`) keeps fast typing from flashing an out-of-date result.
  useEffect(() => {
    if (mode !== "register") {
      setHandleStatus("idle");
      return;
    }
    if (!handle) {
      setHandleStatus("idle");
      return;
    }
    if (!USERNAME_RE.test(handle)) {
      setHandleStatus("invalid");
      return;
    }
    setHandleStatus("checking");
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const { available } = await checkUsernamePublic(handle);
        if (!cancelled) setHandleStatus(available ? "available" : "taken");
      } catch {
        // Couldn't reach the check — don't block signup; the server validates
        // uniqueness again on register.
        if (!cancelled) setHandleStatus("error");
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [handle, mode]);

  const handleOk = mode !== "register" || handleStatus === "available" || handleStatus === "error";

  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    (mode === "login" || (confirm.length > 0 && username.trim().length > 0 && handleOk)) &&
    !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setNotice(null);

    if (mode === "register") {
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
      if (!USERNAME_RE.test(normalizeHandle(username))) {
        setError("Username: 3–20 chars, start with a letter, letters/digits/_ only.");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
        onEnter();
      } else {
        const { needsConfirmation } = await register(
          email.trim(),
          password,
          username,
        );
        if (needsConfirmation) {
          setNotice("Check your email to confirm your account, then sign in.");
          setPendingConfirmEmail(email.trim());
          setMode("login");
          setConfirm("");
        } else {
          onEnter();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pendingConfirmEmail || resending) return;
    setResending(true);
    setError(null);
    try {
      await resendConfirmation(pendingConfirmEmail);
      setNotice(`Confirmation email re-sent to ${pendingConfirmEmail}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resend the email.");
    } finally {
      setResending(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
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

          {mode === "register" && (
            <label style={labelStyle}>
              USERNAME
              <div style={handleRowStyle}>
                <span style={atStyle} aria-hidden>
                  @
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/^@+/, ""))}
                  placeholder="yourname"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={20}
                  aria-invalid={handleStatus === "taken" || handleStatus === "invalid"}
                  style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                />
              </div>
              <HandleStatusLine status={handleStatus} handle={handle} />
            </label>
          )}

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
          {notice && <p style={noticeStyle}>{notice}</p>}
          {mode === "login" && pendingConfirmEmail && (
            <p style={resendRowStyle}>
              Didn&apos;t get it?{" "}
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                style={linkStyle}
              >
                {resending ? "Sending…" : "Resend confirmation email"}
              </button>
            </p>
          )}

          <button type="submit" disabled={!canSubmit} style={submitStyle(canSubmit)}>
            {loading
              ? "One moment…"
              : mode === "login"
                ? "Enter the Bookstore"
                : "Create Account"}
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

// Small hint / availability line under the register handle field.
function HandleStatusLine({ status, handle }: { status: HandleStatus; handle: string }) {
  switch (status) {
    case "invalid":
      return <span style={{ ...hintStyle, color: DANGER }}>3–20 chars, start with a letter (letters/digits/_).</span>;
    case "checking":
      return <span style={hintStyle}>Checking availability…</span>;
    case "available":
      return <span style={{ ...hintStyle, color: OK }}>@{handle} is available.</span>;
    case "taken":
      return <span style={{ ...hintStyle, color: DANGER }}>@{handle} is already taken.</span>;
    default:
      return (
        <span style={hintStyle}>
          Others write to you with @{handle || "yourname"}.
        </span>
      );
  }
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
const OK = "#8fbf6a";
const DANGER = "#e0897f";

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

const handleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: 6,
};

const atStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "0 10px",
  fontSize: 15,
  fontWeight: 700,
  color: INK,
  background: PAPER,
  border: "1px solid #b9a577",
  borderRadius: 4,
  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.15)",
};

const hintStyle: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: 0.2,
  fontWeight: 400,
  color: MUTED,
  textTransform: "none",
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

const noticeStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: GOLD_SOFT,
  fontWeight: 700,
  textAlign: "center",
};

const resendRowStyle: React.CSSProperties = {
  margin: "-4px 0 0",
  fontSize: 11.5,
  color: MUTED,
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
