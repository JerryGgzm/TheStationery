"use client";

import { getSupabase } from "@/lib/supabase";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api/v1";

// Mirrors the backend's unified error envelope: { error: { code, message, details } }.
export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Call the backend with the current Supabase session as a Bearer token.
 * Throws `ApiError` on non-2xx responses.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  // 204 No Content or empty body.
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiError(
      res.status,
      err.code ?? "http_error",
      err.message ?? `Request failed (${res.status})`,
      err.details,
    );
  }
  return body as T;
}

// ── Typed helpers ────────────────────────────────────────────────────────────

export interface Me {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  language_code: string;
  allow_ai_replies: boolean;
  allow_human_replies: boolean;
}

export function getMe() {
  return apiFetch<Me>("/me");
}

export function patchProfile(patch: {
  username?: string;
  display_name?: string;
  language_code?: string;
  avatar_path?: string;
}) {
  return apiFetch<Me>("/me/profile", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Signup-time availability check — public endpoint (no session required). */
export function checkUsernamePublic(username: string) {
  return apiFetch<{ available: boolean; reason?: string }>(
    `/public/username-available?u=${encodeURIComponent(username)}`,
  );
}

// ── Writing letters (the desk) ───────────────────────────────────────────────

export interface MyLetter {
  letter_id: string;
  subject: string | null;
  body: string;
  summary: string | null;
  audience: "public" | "directed";
  recipient_user_id: string | null;
  recipient_username: string | null;
  status: "draft" | "published" | "closed";
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export function createLetter(input: {
  body: string;
  subject?: string | null;
  recipient_username?: string | null;
  language_code?: string;
}) {
  return apiFetch<{ letter_id: string; status: string }>("/letters", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateLetter(
  letterId: string,
  patch: {
    body?: string;
    subject?: string | null;
    recipient_username?: string | null;
    language_code?: string;
  },
) {
  return apiFetch<MyLetter>(`/letters/${letterId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function publishLetter(letterId: string) {
  return apiFetch<{ status: string; published_at: string | null }>(
    `/letters/${letterId}/publish`,
    { method: "POST" },
  );
}

export function deleteLetter(letterId: string) {
  return apiFetch<{ deleted: boolean }>(`/letters/${letterId}`, {
    method: "DELETE",
  });
}

export function listMyLetters(status?: "draft" | "published" | "closed") {
  const q = status ? `?status=${status}` : "";
  return apiFetch<{ letters: MyLetter[] }>(`/letters/mine${q}`);
}

/**
 * Save a letter as a draft: creates a new draft, or updates the existing one
 * when `draftId` is provided. Returns the draft's id (for subsequent saves /
 * publishing).
 */
export async function saveDraft(input: {
  draftId?: string | null;
  body: string;
  subject?: string | null;
  recipient_username?: string | null;
}): Promise<{ letter_id: string }> {
  if (input.draftId) {
    await updateLetter(input.draftId, {
      body: input.body,
      subject: input.subject ?? null,
      recipient_username: input.recipient_username ?? null,
    });
    return { letter_id: input.draftId };
  }
  const { letter_id } = await createLetter({
    body: input.body,
    subject: input.subject ?? null,
    recipient_username: input.recipient_username ?? null,
  });
  return { letter_id };
}

/**
 * Publish a letter — the LetterWriter "Post letter" flow. When `draftId` is
 * set, the existing draft is updated then published; otherwise a fresh letter
 * is created and published in one go.
 */
export async function postLetter(input: {
  draftId?: string | null;
  body: string;
  subject?: string | null;
  recipient_username?: string | null;
}): Promise<{ letter_id: string }> {
  const { letter_id } = await saveDraft(input);
  await publishLetter(letter_id);
  return { letter_id };
}

// ── Letter wall (board) ──────────────────────────────────────────────────────

export type Seal = "wax" | "clip" | "pin" | "tape" | "ribbon";

export interface BoardDelivery {
  delivery_id: string;
  letter_id: string;
  position: number;
  summary: string | null;
  seal: Seal;
  is_reply: boolean;
  opened: boolean;
}

export function getBoard() {
  return apiFetch<{ batch_id: string; deliveries: BoardDelivery[] }>("/board");
}

export interface OpenedLetter {
  id: string;
  subject: string | null;
  title: string | null;
  body: string;
  author_display: string | null;
  language_code: string;
}

export function openDelivery(deliveryId: string) {
  return apiFetch<{ letter: OpenedLetter }>(`/deliveries/${deliveryId}/open`, {
    method: "POST",
  });
}

export function replyToDelivery(deliveryId: string, body: string) {
  return apiFetch<{ conversation_id: string; message_id: string }>(
    `/deliveries/${deliveryId}/reply`,
    { method: "POST", body: JSON.stringify({ body }) },
  );
}

// ── Correspondence (mailbox / conversations) ─────────────────────────────────

export type BundleTie =
  | "red-string"
  | "green-string"
  | "clip"
  | "twine-wax"
  | "green-band";

export interface Correspondent {
  type: "human" | "ai_character";
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Bundle {
  conversation_id: string;
  correspondent: Correspondent;
  letter_count: number;
  last_message_at: string;
  tie: BundleTie;
}

export function getMailbox() {
  return apiFetch<{ bundles: Bundle[] }>("/mailbox");
}

export interface ConversationMessage {
  id: string;
  sender: "user" | "correspondent";
  body: string;
  created_at: string;
  is_reply: boolean;
}

export interface ConversationThread {
  conversation_id: string;
  root_letter: {
    id: string;
    title: string | null;
    body: string;
    sender: "user" | "correspondent";
  } | null;
  messages: ConversationMessage[];
}

export function getConversation(conversationId: string) {
  return apiFetch<ConversationThread>(`/conversations/${conversationId}`);
}

export function postMessage(conversationId: string, body: string) {
  return apiFetch<{ message_id: string }>(
    `/conversations/${conversationId}/messages`,
    { method: "POST", body: JSON.stringify({ body }) },
  );
}

// ── Avatar upload (direct to Supabase Storage `avatars` bucket) ───────────────

/**
 * Upload an avatar image to `avatars/{user_id}/{uuid}.{ext}` and return the
 * object path (stored in profiles.avatar_path via PATCH /me/profile).
 */
export async function uploadAvatar(file: File): Promise<string> {
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);
  // profiles.avatar_path convention keeps the bucket-relative object path.
  return path;
}
