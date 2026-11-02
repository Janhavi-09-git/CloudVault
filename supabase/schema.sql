create extension if not exists pgcrypto;

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes >= 0),
  chunk_size_bytes integer not null check (chunk_size_bytes > 0),
  chunk_count integer not null check (chunk_count > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  encrypted boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.file_chunks (
  file_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  object_key text not null unique,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  encrypted_size_bytes bigint not null check (encrypted_size_bytes >= 0),
  encrypted_sha256 text not null check (encrypted_sha256 ~ '^[a-f0-9]{64}$'),
  iv text not null check (iv ~ '^[a-f0-9]{24}$'),
  auth_tag text not null check (auth_tag ~ '^[a-f0-9]{32}$'),
  created_at timestamptz not null default now(),
  primary key (file_id, chunk_index),
  foreign key (file_id, user_id) references public.files(id, user_id) on delete cascade
);

create table if not exists public.downloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid references public.files(id) on delete set null,
  file_name text not null,
  mode text not null check (mode in ('encrypted', 'original')),
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('portfolio', 'documentation')),
  name text not null,
  status text not null check (status in ('uploaded', 'published')),
  published_url text,
  object_prefix text not null,
  file_count integer not null check (file_count > 0),
  cdn_invalidation_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create index if not exists files_user_created_idx on public.files(user_id, created_at desc);
create index if not exists chunks_user_file_idx on public.file_chunks(user_id, file_id, chunk_index);
create index if not exists downloads_user_created_idx on public.downloads(user_id, created_at desc);
create index if not exists deployments_user_created_idx on public.deployments(user_id, created_at desc);
create index if not exists activity_user_created_idx on public.activity_logs(user_id, created_at desc);

alter table public.files enable row level security;
alter table public.file_chunks enable row level security;
alter table public.downloads enable row level security;
alter table public.deployments enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "Users can read their own files" on public.files;
create policy "Users can read their own files" on public.files for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can read their own chunks" on public.file_chunks;
create policy "Users can read their own chunks" on public.file_chunks for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can read their own downloads" on public.downloads;
create policy "Users can read their own downloads" on public.downloads for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can read their own deployments" on public.deployments;
create policy "Users can read their own deployments" on public.deployments for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can read their own activity" on public.activity_logs;
create policy "Users can read their own activity" on public.activity_logs for select to authenticated using (auth.uid() = user_id);

revoke all on public.files, public.file_chunks, public.downloads, public.deployments, public.activity_logs from anon;
grant select on public.files, public.file_chunks, public.downloads, public.deployments, public.activity_logs to authenticated;
grant all on public.files, public.file_chunks, public.downloads, public.deployments, public.activity_logs to service_role;
