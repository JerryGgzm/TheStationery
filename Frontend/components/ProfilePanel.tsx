"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, getMe, patchProfile, uploadAvatar } from "@/lib/api";
import { USERNAME_RE, changePassword, logout, normalizeHandle } from "@/lib/auth";

// Top-left pixel profile chip + "Profile settings" modal.
// Styling mirrors the login window (navy panel, gold border + corner squares).
// On mount the chip loads the signed-in profile (GET /me). Saving persists the
// username + avatar via PATCH /me/profile (avatar image is uploaded to the
// Supabase Storage `avatars` bucket first) and changes the password through
// Supabase Auth.

const MIN_PASSWORD = 8;

const NAVY = "#181c31";
const NAVY_DEEP = "#12162a";
const GOLD = "#e6a85c";
const GOLD_SOFT = "#d8b877";
const CREAM = "#efe4c9";
const MUTED = "#9a9078";
const PAPER = "#e7d8b6";
const INK = "#3a2c22";
const BORDER = "rgba(230,168,92,0.55)";

export interface ProfileData {
  username: string;
  avatarUrl: string | null;
}

export default function ProfilePanel({
  onSave,
}: {
  onSave?: (data: ProfileData) => void;
}) {
  const [open, setOpen] = useState(false);
  // Committed values shown on the chip. Populated from GET /me on mount.
  const [profile, setProfile] = useState<ProfileData>({
    username: "reader",
    avatarUrl: null,
  });

  useEffect(() => {
    let alive = true;
    getMe()
      .then((me) => {
        if (alive) setProfile({ username: me.username, avatarUrl: me.avatar_url });
      })
      .catch(() => {
        /* not signed in / no profile yet — keep the placeholder chip */
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="打开个人资料"
        onClick={() => setOpen(true)}
        // Keep the chip click from falling through to the scene hotspots.
        onPointerDown={(e) => e.stopPropagation()}
        style={chipStyle}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#d8b26a")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
      >
        <i style={{ ...chipCornerStyle, top: 3, left: 3 }} />
        <i style={{ ...chipCornerStyle, top: 3, right: 3 }} />
        <i style={{ ...chipCornerStyle, bottom: 3, left: 3 }} />
        <i style={{ ...chipCornerStyle, bottom: 3, right: 3 }} />
        <Avatar url={profile.avatarUrl} name={profile.username} size={34} />
        <span style={chipTextStyle}>
          <span style={chipNameStyle}>{profile.username}</span>
          <span style={chipSubStyle}>Profile</span>
        </span>
        <span style={chipCaretStyle} aria-hidden>
          {"\u25be"}
        </span>
      </button>

      {open && (
        <ProfileModal
          profile={profile}
          onClose={() => setOpen(false)}
          onSave={(data) => {
            setProfile(data);
            onSave?.(data);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function ProfileModal({
  profile,
  onClose,
  onSave,
}: {
  profile: ProfileData;
  onClose: () => void;
  onSave: (data: ProfileData) => void;
}) {
  const [username, setUsername] = useState(profile.username);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Object URL we created here (so we can revoke it and avoid leaks).
  const createdUrl = useRef<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (createdUrl.current) URL.revokeObjectURL(createdUrl.current);
    };
  }, [onClose]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (createdUrl.current) URL.revokeObjectURL(createdUrl.current);
    const url = URL.createObjectURL(f);
    createdUrl.current = url;
    setAvatarUrl(url);
    setAvatarFile(f);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    const handle = normalizeHandle(username);
    if (!USERNAME_RE.test(handle)) {
      setError("Username: 3–20 letters, digits or _ (start with a letter).");
      return;
    }
    // Password is optional; only validate when the user is changing it.
    if (newPass || confirm) {
      if (newPass.length < MIN_PASSWORD) {
        setError(`New password must be at least ${MIN_PASSWORD} characters.`);
        return;
      }
      if (newPass !== confirm) {
        setError("Passwords do not match.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      // Upload a new portrait first (Storage), then persist username + path.
      const patch: { username?: string; avatar_path?: string } = {};
      if (handle !== normalizeHandle(profile.username)) patch.username = handle;
      if (avatarFile) patch.avatar_path = await uploadAvatar(avatarFile);

      let committedAvatar = profile.avatarUrl;
      let committedName = profile.username;
      if (Object.keys(patch).length > 0) {
        const me = await patchProfile(patch);
        committedName = me.username;
        committedAvatar = me.avatar_url;
      }

      if (newPass) await changePassword(newPass);

      // Don't revoke the preview URL we may still be showing on the chip.
      if (createdUrl.current && createdUrl.current === avatarUrl) {
        createdUrl.current = null;
      }
      onSave({ username: committedName, avatarUrl: committedAvatar });
    } catch (e) {
      if (e instanceof ApiError && e.code === "username_taken") {
        setError("That username is already taken.");
      } else {
        setError((e as Error)?.message || "Couldn't save your changes.");
      }
      setSaving(false);
    }
  }, [username, newPass, confirm, avatarFile, avatarUrl, profile, onSave]);

  // Sign out, then reload so the app returns to the intro / login window
  // (a fresh mount finds no session and shows LoginWindow).
  const handleLogout = useCallback(async () => {
    setSigningOut(true);
    try {
      await logout();
      window.location.reload();
    } catch (e) {
      setError((e as Error)?.message || "Couldn't sign out.");
      setSigningOut(false);
    }
  }, []);

  return (
    <div
      style={backdropStyle}
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <i style={{ ...cornerStyle, top: 7, left: 7 }} />
        <i style={{ ...cornerStyle, top: 7, right: 7 }} />
        <i style={{ ...cornerStyle, bottom: 7, left: 7 }} />
        <i style={{ ...cornerStyle, bottom: 7, right: 7 }} />

        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          style={closeStyle}
        >
          {"\u00d7"}
        </button>

        <div style={innerStyle}>
          <h2 style={titleStyle}>Profile settings</h2>
          <p style={subtitleStyle}>Update how you appear in the bookstore.</p>

          <div style={rowStyle}>
            {/* Portrait column */}
            <div style={portraitColStyle}>
              <span style={sectionLabelStyle}>PORTRAIT</span>
              <div style={portraitFrameStyle}>
                <Avatar url={avatarUrl} name={username} size={120} />
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFile}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={outlineButtonStyle}
              >
                Upload portrait
              </button>
            </div>

            {/* Fields column */}
            <div style={fieldsColStyle}>
              <label style={sectionLabelStyle}>
                USERNAME
                <input
                  type="text"
                  value={username}
                  maxLength={20}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) =>
                    setUsername(e.target.value.replace(/^@+/, ""))
                  }
                  style={inputStyle}
                />
              </label>
              <p style={hintStyle}>Others write to you with @{username || "…"}.</p>

              <div style={dividerStyle}>
                <span style={dividerLineStyle} />
                <span style={dividerDotStyle} />
                <span style={dividerLineStyle} />
              </div>

              <span style={changePwHeadingStyle}>CHANGE PASSWORD</span>
              <label style={sectionLabelStyle}>
                NEW PASSWORD
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </label>
              <label style={sectionLabelStyle}>
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
            </div>
          </div>

          {error && <p style={errorStyle}>{error}</p>}

          <div style={footerStyle}>
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut || saving}
              style={signOutStyle}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
            <div style={footerRightStyle}>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                style={cancelStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{ ...saveStyle, opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Framed portrait; falls back to a monogram + silhouette when no image is set.
function Avatar({
  url,
  name,
  size,
}: {
  url: string | null;
  name: string;
  size: number;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={{
          width: size,
          height: size,
          objectFit: "cover",
          display: "block",
          imageRendering: "pixelated",
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `radial-gradient(circle at 50% 38%, #3a4066 0%, ${NAVY_DEEP} 80%)`,
        color: GOLD_SOFT,
        fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
        fontWeight: 700,
        fontSize: size * 0.42,
        lineHeight: 1,
      }}
    >
      {(name.trim()[0] || "?").toUpperCase()}
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  zIndex: 5,
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: "5px 12px 5px 6px",
  background: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
  border: `1.5px solid ${BORDER}`,
  borderRadius: 4,
  boxShadow: "0 3px 10px rgba(0,0,0,0.45)",
  cursor: "pointer",
  fontFamily: '"Courier New", ui-monospace, monospace',
  transition: "border-color 150ms ease",
};

const chipCornerStyle: React.CSSProperties = {
  position: "absolute",
  width: 3,
  height: 3,
  background: GOLD,
};

const chipTextStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  lineHeight: 1.1,
};

const chipNameStyle: React.CSSProperties = {
  color: CREAM,
  fontSize: 14,
  fontWeight: 700,
  fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
  maxWidth: 130,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const chipSubStyle: React.CSSProperties = {
  color: MUTED,
  fontSize: 10,
  letterSpacing: 1,
};

const chipCaretStyle: React.CSSProperties = {
  color: GOLD_SOFT,
  fontSize: 11,
  marginLeft: 2,
};

const backdropStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(6,8,16,0.6)",
  zIndex: 40,
};

const panelStyle: React.CSSProperties = {
  position: "relative",
  width: 560,
  maxWidth: "90vw",
  maxHeight: "92%",
  display: "flex",
  flexDirection: "column",
  background: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
  border: `2px solid ${BORDER}`,
  boxShadow: "0 18px 44px rgba(0,0,0,0.6)",
  fontFamily: '"Courier New", ui-monospace, monospace',
};

const cornerStyle: React.CSSProperties = {
  position: "absolute",
  width: 7,
  height: 7,
  background: GOLD,
  zIndex: 1,
};

const closeStyle: React.CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
  width: 26,
  height: 26,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 16,
  lineHeight: 1,
  color: CREAM,
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "inherit",
};

const innerStyle: React.CSSProperties = {
  padding: "18px 24px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  overflowY: "auto",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: CREAM,
  fontSize: 24,
  fontWeight: 700,
  letterSpacing: 0.4,
  fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
};

const subtitleStyle: React.CSSProperties = {
  margin: "2px 0 12px",
  color: MUTED,
  fontSize: 12.5,
  letterSpacing: 0.3,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 26,
  alignItems: "flex-start",
};

const portraitColStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 9,
  alignItems: "flex-start",
};

const portraitFrameStyle: React.CSSProperties = {
  width: 120,
  height: 120,
  padding: 4,
  background: NAVY_DEEP,
  border: `2px solid ${GOLD_SOFT}`,
  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.4)",
};

const outlineButtonStyle: React.CSSProperties = {
  width: 120,
  padding: "8px 0",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.3,
  fontFamily: '"Courier New", ui-monospace, monospace',
  color: CREAM,
  background: "transparent",
  border: `1px solid ${GOLD_SOFT}`,
  borderRadius: 4,
  cursor: "pointer",
};

const fieldsColStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const sectionLabelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 11,
  letterSpacing: 2,
  color: GOLD_SOFT,
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  color: INK,
  background: PAPER,
  border: "1px solid #b9a577",
  borderRadius: 4,
  outline: "none",
  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.15)",
};

const hintStyle: React.CSSProperties = {
  margin: "-2px 0 0",
  fontSize: 11,
  color: MUTED,
  letterSpacing: 0.2,
};

const changePwHeadingStyle: React.CSSProperties = {
  marginTop: 2,
  fontSize: 11,
  letterSpacing: 2,
  color: GOLD,
  fontWeight: 700,
};

const dividerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  margin: "4px 0 2px",
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

const errorStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: 12,
  color: "#e0897f",
  fontWeight: 700,
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 18,
  marginTop: 18,
};

const footerRightStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 18,
};

const signOutStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid rgba(224,137,127,0.5)",
  padding: "8px 14px",
  color: "#e0897f",
  fontFamily: '"Courier New", ui-monospace, monospace',
  fontSize: 12.5,
  fontWeight: 700,
  letterSpacing: 0.3,
  borderRadius: 4,
  cursor: "pointer",
};

const cancelStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: "6px 4px",
  color: MUTED,
  fontFamily: "inherit",
  fontSize: 13,
  cursor: "pointer",
};

const saveStyle: React.CSSProperties = {
  padding: "10px 18px",
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 0.4,
  fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
  color: INK,
  background: `linear-gradient(180deg, #edb469 0%, ${GOLD} 55%, #d5993f 100%)`,
  border: "1px solid #c9923f",
  borderRadius: 5,
  boxShadow: "0 3px 0 0 #a9772f, 0 5px 10px rgba(0,0,0,0.35)",
  cursor: "pointer",
};
