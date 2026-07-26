"use client";

import { ApiError, getMe, patchProfile } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";

// Unique-handle rules, kept in sync with profiles.username / the backend.
export const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
export const normalizeHandle = (v: string) =>
  v.trim().replace(/^@+/, "").toLowerCase();

async function bootstrapProfile(username: string): Promise<void> {
  const handle = normalizeHandle(username);
  await patchProfile({ username: handle, display_name: handle });
}

/** Surface a clear error if a signed-in user somehow has no profile row. */
async function ensureProfile(): Promise<void> {
  try {
    await getMe();
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && e.code === "profile_not_found") {
      throw new Error("Your profile isn't set up yet. Please register again.");
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

export async function login(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  await ensureProfile();
}

/**
 * Sign up and bootstrap the profile via PATCH /me/profile. Email confirmation is
 * disabled for this project, so signUp returns a session immediately.
 */
export async function register(
  email: string,
  password: string,
  username: string,
): Promise<void> {
  const handle = normalizeHandle(username);
  const { data, error } = await getSupabase().auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  if (!data.session) {
    throw new Error(
      "No session returned after signup. Confirm that email confirmation is disabled in Supabase.",
    );
  }
  await bootstrapProfile(handle);
}
