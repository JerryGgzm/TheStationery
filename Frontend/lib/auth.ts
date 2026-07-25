"use client";

import { ApiError, getMe, patchProfile } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";

// Unique-handle rules, kept in sync with profiles.username / the backend.
export const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
export const normalizeHandle = (v: string) =>
  v.trim().replace(/^@+/, "").toLowerCase();

// If signup needs email confirmation, there's no session yet to bootstrap the
// profile — stash the chosen username and finish on the first successful login.
const PENDING_KEY = "stationery_pending_username";

async function bootstrapProfile(username: string): Promise<void> {
  const handle = normalizeHandle(username);
  await patchProfile({ username: handle, display_name: handle });
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** Create the profile if it doesn't exist yet (bootstrap after email confirm). */
async function ensureProfile(): Promise<void> {
  try {
    await getMe();
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && e.code === "profile_not_found") {
      let pending: string | null = null;
      try {
        pending = window.localStorage.getItem(PENDING_KEY);
      } catch {
        /* ignore */
      }
      if (pending) {
        await bootstrapProfile(pending);
        return;
      }
      throw new Error("Your profile isn't set up yet. Please register a username.");
    }
    throw e;
  }
}

/** Change the signed-in user's password (Supabase Auth). */
export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

/** Sign out and clear the persisted Supabase session. */
export async function logout(): Promise<void> {
  await getSupabase().auth.signOut();
}

/** Re-send the signup confirmation email (email-confirmation flow). */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resend({
    type: "signup",
    email: email.trim(),
  });
  if (error) throw new Error(error.message);
}

export async function login(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  await ensureProfile();
}

/**
 * Sign up, then bootstrap the profile via PATCH /me/profile.
 * Returns `needsConfirmation: true` when the project requires email confirmation
 * (no session is returned yet, so the profile is created on the first login).
 */
export async function register(
  email: string,
  password: string,
  username: string,
): Promise<{ needsConfirmation: boolean }> {
  const handle = normalizeHandle(username);
  const { data, error } = await getSupabase().auth.signUp({ email, password });
  if (error) throw new Error(error.message);

  if (data.session) {
    await bootstrapProfile(handle);
    return { needsConfirmation: false };
  }

  try {
    window.localStorage.setItem(PENDING_KEY, handle);
  } catch {
    /* ignore */
  }
  return { needsConfirmation: true };
}
