-- =============================================================================
-- The Stationery — complete database schema (MVP)
-- =============================================================================
-- Paste this whole file into the Supabase SQL Editor (or run with psql) against
-- a fresh project to create the entire schema in one shot. It is idempotent-ish
-- for enums/extensions but assumes empty `public` tables (run once).
--
-- Source of truth: stationary_prd.docx §DB. Deltas required by the current
-- frontend are marked with `-- [ADDED]` and are also listed in
-- Docs/frontend_backend_integration.md (§"Schema deltas vs PRD").
--
-- Architecture note (PRD §22): the frontend NEVER reads/writes these business
-- tables directly. All business access goes through the Cloud Run backend using
-- a service-role/limited DB credential. RLS is enabled on every business table
-- with NO permissive policies, so anon/authenticated roles are denied by
-- default. The only client-side Supabase usage is (1) Auth sessions and (2) the
-- `avatars` Storage bucket (see bottom of file).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists citext;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type public.account_status as enum (
  'active',
  'suspended',
  'deleted'
);

create type public.letter_status as enum (
  'draft',
  'published',
  'closed',
  'archived',
  'removed'
);

create type public.delivery_batch_reason as enum (
  'bookstore_visit',
  'manual_refresh'
);

create type public.delivery_batch_status as enum (
  'active',
  'completed',
  'expired'
);

create type public.conversation_responder_type as enum (
  'human',
  'ai_character'
);

create type public.conversation_status as enum (
  'active',
  'closed',
  'blocked',
  'removed'
);

create type public.message_sender_type as enum (
  'user',
  'ai_character',
  'system'
);

create type public.message_delivery_status as enum (
  'scheduled',
  'delivered',
  'read',
  'removed'
);

create type public.ai_prompt_status as enum (
  'draft',
  'active',
  'retired'
);

create type public.ai_job_trigger_reason as enum (
  'unanswered_public_letter',
  'conversation_reply',
  'manual_test'
);

create type public.ai_job_status as enum (
  'scheduled',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'blocked_by_safety'
);

create type public.report_target_type as enum (
  'public_letter',
  'message',
  'user'
);

create type public.report_reason as enum (
  'harassment',
  'sexual_content',
  'self_harm',
  'personal_information',
  'spam',
  'impersonation',
  'other'
);

create type public.report_status as enum (
  'open',
  'reviewing',
  'resolved',
  'dismissed'
);

-- [ADDED] Distinguishes directed letters (written to a specific @username) from
-- the public "leave it for a stranger" pool used by the delivery matcher.
create type public.letter_audience as enum (
  'public',
  'directed'
);

-- ----------------------------------------------------------------------------
-- Core: profiles
-- ----------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name varchar(40) not null,
  username citext not null unique,           -- unique @handle (case-insensitive)
  avatar_path text,                          -- object path in the `avatars` bucket
  language_code varchar(16) not null default 'en',
  timezone varchar(64) not null default 'UTC',
  account_status public.account_status not null default 'active',
  allow_ai_replies boolean not null default true,
  allow_human_replies boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (char_length(trim(display_name)) between 1 and 40),
  constraint profiles_username_format
    check (username ~ '^[a-z][a-z0-9_]{2,19}$')
);

-- ----------------------------------------------------------------------------
-- Public letters (also carries directed letters via recipient_user_id)
-- ----------------------------------------------------------------------------
create table public.public_letters (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references public.profiles(user_id),
  subject varchar(160),
  body text not null,
  summary varchar(280),                      -- [ADDED] AI excerpt shown on wall/board cards
  audience public.letter_audience not null default 'public', -- [ADDED]
  recipient_user_id uuid references public.profiles(user_id), -- [ADDED] set when audience = 'directed'
  language_code varchar(16) not null,
  allow_human_replies boolean not null default true,
  allow_ai_replies boolean not null default true,
  status public.letter_status not null default 'draft',
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint public_letters_subject_length
    check (subject is null or char_length(subject) <= 160),
  constraint public_letters_body_length
    check (char_length(body) between 1 and 10000),
  constraint public_letters_published_timestamp
    check (status <> 'published' or published_at is not null),
  -- [ADDED] directed letters must name a recipient (and vice versa); never self.
  constraint public_letters_audience_recipient check (
    (audience = 'public' and recipient_user_id is null)
    or (audience = 'directed' and recipient_user_id is not null)
  ),
  constraint public_letters_recipient_not_author check (
    recipient_user_id is null or recipient_user_id <> author_user_id
  )
);

-- ----------------------------------------------------------------------------
-- Delivery batches + deliveries (the "board" shown on the letter wall)
-- ----------------------------------------------------------------------------
create table public.letter_delivery_batches (
  id uuid primary key default gen_random_uuid(),
  viewer_user_id uuid not null references public.profiles(user_id),
  reason public.delivery_batch_reason not null default 'bookstore_visit',
  status public.delivery_batch_status not null default 'active',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  completed_at timestamptz
);

create table public.ai_characters (
  id uuid primary key default gen_random_uuid(),
  slug varchar(64) not null unique,
  display_name varchar(80) not null,
  short_description text not null,
  persona_summary text not null,
  visual_asset_key varchar(255) not null,
  active boolean not null default true,
  active_time_rules jsonb not null default '{}'::jsonb,
  reply_delay_rules jsonb not null default '{}'::jsonb,
  topic_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  ai_character_id uuid not null references public.ai_characters(id),
  version integer not null,
  system_prompt text not null,
  model_config jsonb not null default '{}'::jsonb,
  status public.ai_prompt_status not null default 'draft',
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (ai_character_id, version)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  root_letter_id uuid not null references public.public_letters(id),
  letter_author_user_id uuid not null references public.profiles(user_id),
  responder_type public.conversation_responder_type not null,
  responder_user_id uuid references public.profiles(user_id),
  responder_ai_character_id uuid references public.ai_characters(id),
  created_from_delivery_id uuid,
  status public.conversation_status not null default 'active',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_responder_identity check (
    (
      responder_type = 'human'
      and responder_user_id is not null
      and responder_ai_character_id is null
    )
    or
    (
      responder_type = 'ai_character'
      and responder_user_id is null
      and responder_ai_character_id is not null
    )
  ),
  constraint conversations_human_not_author check (
    responder_user_id is null or responder_user_id <> letter_author_user_id
  )
);

create table public.letter_deliveries (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.letter_delivery_batches(id) on delete cascade,
  viewer_user_id uuid not null references public.profiles(user_id),
  letter_id uuid not null references public.public_letters(id),
  position smallint not null,
  selection_score numeric(10, 5),
  selection_reasons jsonb not null default '{}'::jsonb,
  delivered_at timestamptz not null default now(),
  opened_at timestamptz,
  skipped_at timestamptz,
  replied_at timestamptz,
  hidden_at timestamptz,
  created_conversation_id uuid references public.conversations(id),
  unique (viewer_user_id, letter_id),
  unique (batch_id, position),
  constraint letter_deliveries_position check (position >= 1 and position <= 20)
);

-- Deferred FK (conversations <-> letter_deliveries form a cycle).
alter table public.conversations
  add constraint conversations_created_from_delivery_fk
  foreign key (created_from_delivery_id)
  references public.letter_deliveries(id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id),
  sender_type public.message_sender_type not null,
  sender_user_id uuid references public.profiles(user_id),
  sender_ai_character_id uuid references public.ai_characters(id),
  body text not null,
  reply_to_message_id uuid references public.messages(id),
  delivery_status public.message_delivery_status not null default 'scheduled',
  scheduled_for timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint messages_body_length
    check (char_length(body) between 1 and 10000),
  constraint messages_sender_identity check (
    (
      sender_type = 'user'
      and sender_user_id is not null
      and sender_ai_character_id is null
    )
    or
    (
      sender_type = 'ai_character'
      and sender_user_id is null
      and sender_ai_character_id is not null
    )
    or
    (
      sender_type = 'system'
      and sender_user_id is null
      and sender_ai_character_id is null
    )
  ),
  constraint messages_delivery_timestamps check (
    (delivery_status <> 'scheduled' or scheduled_for is not null)
    and (delivery_status not in ('delivered', 'read') or delivered_at is not null)
    and (delivery_status <> 'read' or read_at is not null)
  )
);

create table public.ai_response_jobs (
  id uuid primary key default gen_random_uuid(),
  root_letter_id uuid references public.public_letters(id),
  conversation_id uuid references public.conversations(id),
  reply_to_message_id uuid references public.messages(id),
  ai_character_id uuid not null references public.ai_characters(id),
  prompt_version_id uuid not null references public.ai_prompt_versions(id),
  trigger_reason public.ai_job_trigger_reason not null,
  status public.ai_job_status not null default 'scheduled',
  scheduled_for timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  model_name varchar(128),
  retry_count integer not null default 0,
  output_message_id uuid references public.messages(id),
  error_code varchar(128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_response_jobs_retry_count check (retry_count >= 0),
  constraint ai_response_jobs_target check (
    root_letter_id is not null or conversation_id is not null
  )
);

create table public.user_blocks (
  blocker_user_id uuid not null references public.profiles(user_id),
  blocked_user_id uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint user_blocks_not_self check (blocker_user_id <> blocked_user_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references public.profiles(user_id),
  target_type public.report_target_type not null,
  target_id uuid not null,
  reason public.report_reason not null,
  details text,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint reports_details_length
    check (details is null or char_length(details) <= 2000)
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
-- Profiles and account checks
create index idx_profiles_account_status
  on public.profiles (account_status);

-- Author dashboard and drafts
create index idx_public_letters_author_created
  on public.public_letters (author_user_id, created_at desc);

create index idx_public_letters_author_status_updated
  on public.public_letters (author_user_id, status, updated_at desc);

-- Main public delivery pool
create index idx_public_letters_delivery_pool
  on public.public_letters (published_at asc, id)
  where status = 'published'
    and deleted_at is null
    and allow_human_replies = true
    and audience = 'public';                 -- [ADDED] keep directed letters out of the pool

create index idx_public_letters_language_pool
  on public.public_letters (language_code, published_at asc, id)
  where status = 'published'
    and deleted_at is null
    and allow_human_replies = true
    and audience = 'public';                 -- [ADDED]

-- [ADDED] Directed-letter lookup (deliver straight to the named recipient).
create index idx_public_letters_recipient
  on public.public_letters (recipient_user_id, published_at desc)
  where audience = 'directed' and deleted_at is null;

-- Active batch lookup
create index idx_delivery_batches_viewer_status
  on public.letter_delivery_batches (viewer_user_id, status, created_at desc);

create index idx_delivery_batches_expiration
  on public.letter_delivery_batches (expires_at)
  where status = 'active' and expires_at is not null;

-- Enforce at most one active batch per viewer
create unique index uq_delivery_batches_one_active_per_viewer
  on public.letter_delivery_batches (viewer_user_id)
  where status = 'active';

-- Delivery history and batch rendering
create index idx_letter_deliveries_batch_position
  on public.letter_deliveries (batch_id, position);

create index idx_letter_deliveries_viewer_delivered
  on public.letter_deliveries (viewer_user_id, delivered_at desc);

create index idx_letter_deliveries_letter
  on public.letter_deliveries (letter_id, delivered_at desc);

create index idx_letter_deliveries_unopened
  on public.letter_deliveries (viewer_user_id, delivered_at desc)
  where opened_at is null and hidden_at is null;

-- Conversation uniqueness
create unique index uq_conversations_human_responder_per_letter
  on public.conversations (root_letter_id, responder_user_id)
  where responder_type = 'human';

create unique index uq_conversations_ai_responder_per_letter
  on public.conversations (root_letter_id, responder_ai_character_id)
  where responder_type = 'ai_character';

-- Mailbox and participant lookups
create index idx_conversations_author_last_message
  on public.conversations (letter_author_user_id, last_message_at desc)
  where status <> 'removed';

create index idx_conversations_responder_last_message
  on public.conversations (responder_user_id, last_message_at desc)
  where responder_type = 'human' and status <> 'removed';

create index idx_conversations_root_responder_type
  on public.conversations (root_letter_id, responder_type, status);

create index idx_conversations_ai_character
  on public.conversations (responder_ai_character_id, last_message_at desc)
  where responder_type = 'ai_character';

-- Messages inside a conversation
create index idx_messages_conversation_created
  on public.messages (conversation_id, created_at asc)
  where deleted_at is null;

create index idx_messages_scheduled_delivery
  on public.messages (scheduled_for, id)
  where delivery_status = 'scheduled';

create index idx_messages_delivered_unread
  on public.messages (conversation_id, delivered_at desc)
  where delivery_status = 'delivered' and deleted_at is null;

create index idx_messages_sender_user
  on public.messages (sender_user_id, created_at desc)
  where sender_type = 'user';

-- AI characters and prompt versions
create index idx_ai_characters_active
  on public.ai_characters (active, slug);

create unique index uq_ai_prompt_one_active_per_character
  on public.ai_prompt_versions (ai_character_id)
  where status = 'active';

create index idx_ai_prompt_versions_character_version
  on public.ai_prompt_versions (ai_character_id, version desc);

-- AI job scheduler
create index idx_ai_jobs_scheduled
  on public.ai_response_jobs (scheduled_for, id)
  where status = 'scheduled';

create index idx_ai_jobs_processing_started
  on public.ai_response_jobs (started_at)
  where status = 'processing';

create index idx_ai_jobs_conversation
  on public.ai_response_jobs (conversation_id, created_at desc)
  where conversation_id is not null;

create index idx_ai_jobs_root_letter
  on public.ai_response_jobs (root_letter_id, created_at desc)
  where root_letter_id is not null;

-- Block filtering in both directions
create index idx_user_blocks_blocked_user
  on public.user_blocks (blocked_user_id, blocker_user_id);

-- Reports dashboard and duplicate analysis
create index idx_reports_status_created
  on public.reports (status, created_at asc);

create index idx_reports_target
  on public.reports (target_type, target_id, created_at desc);

create index idx_reports_reporter_created
  on public.reports (reporter_user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Triggers
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''            -- pin search_path (security linter 0011)
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger public_letters_set_updated_at
before update on public.public_letters
for each row execute function public.set_updated_at();

create trigger ai_characters_set_updated_at
before update on public.ai_characters
for each row execute function public.set_updated_at();

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create trigger messages_set_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

create trigger ai_response_jobs_set_updated_at
before update on public.ai_response_jobs
for each row execute function public.set_updated_at();

create or replace function public.update_conversation_last_message_at()
returns trigger
language plpgsql
set search_path = ''            -- pin search_path (security linter 0011)
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_update_conversation_last_message
  after insert on public.messages
  for each row execute function public.update_conversation_last_message_at();

-- ----------------------------------------------------------------------------
-- Row Level Security (PRD §22)
-- Enable RLS on every business table and DO NOT add permissive policies. The
-- Cloud Run backend connects with a service-role/limited credential that
-- bypasses RLS; anon/authenticated roles are denied by default.
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.public_letters enable row level security;
alter table public.letter_delivery_batches enable row level security;
alter table public.letter_deliveries enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.ai_characters enable row level security;
alter table public.ai_prompt_versions enable row level security;
alter table public.ai_response_jobs enable row level security;
alter table public.user_blocks enable row level security;
alter table public.reports enable row level security;

-- =============================================================================
-- Storage: avatars bucket
-- =============================================================================
-- [ADDED] Avatar uploads are the one client-direct data path (files, not
-- business rows). profiles.avatar_path stores the object path inside this
-- bucket, e.g. 'avatars/<user_id>/<uuid>.png'. Bucket is public so avatars can
-- be served by URL without signing (avatars are non-sensitive); switch to a
-- private bucket + backend-signed URLs if that changes.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- No SELECT policy: a public bucket serves objects by URL without one, and
-- adding a broad `for select` policy would let clients LIST every file in the
-- bucket (security linter 0025). Reads happen via the public object URL only.

-- A user may write/replace/delete only files under their own uid folder.
create policy "avatars_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================================
-- End of schema.
-- =============================================================================
