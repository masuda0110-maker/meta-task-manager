-- ============================================================
-- Meta-Task Manager — Supabase テーブル作成 SQL
-- Supabase Dashboard > SQL Editor に貼り付けて実行してください
-- ============================================================

-- ---- projects ----
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text default '#7c5cbf',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.projects enable row level security;
create policy "users can manage own projects"
  on public.projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---- tasks ----
create table if not exists public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  project_id         uuid references public.projects(id) on delete set null,
  title              text not null,
  description        text default '',
  priority           text default 'P3',
  due_date           timestamptz,
  estimated_minutes  int default 0,
  is_completed       boolean default false,
  completed_at       timestamptz,
  is_recurring       boolean default false,
  recurrence_rule    text,
  subtasks           jsonb default '[]',
  tags               jsonb default '[]',
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
alter table public.tasks enable row level security;
create policy "users can manage own tasks"
  on public.tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---- wbs_nodes ----
create table if not exists public.wbs_nodes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  project_id       uuid references public.projects(id) on delete cascade,
  parent_id        uuid references public.wbs_nodes(id) on delete cascade,
  task_id          uuid references public.tasks(id) on delete set null,
  title            text not null,
  description      text default '',
  status           text default 'not_started',
  priority         text default 'P3',
  progress         int default 0,
  start_date       date,
  end_date         date,
  estimated_hours  numeric default 0,
  actual_hours     numeric default 0,
  assignee         text default '',
  depth            int default 0,
  sort_order       int default 0,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
alter table public.wbs_nodes enable row level security;
create policy "users can manage own wbs_nodes"
  on public.wbs_nodes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---- reflection_logs ----
create table if not exists public.reflection_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text default 'chat',
  date          date default current_date,
  task_title    text,
  focus_score   int,
  time_accuracy text,
  energy_level  text,
  blockers      jsonb default '[]',
  learning      text,
  intent        text,
  summary       text,
  insights      jsonb default '[]',
  messages      jsonb default '[]',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table public.reflection_logs enable row level security;
create policy "users can manage own reflection_logs"
  on public.reflection_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---- user_settings ----
create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.user_settings enable row level security;
create policy "users can manage own settings"
  on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---- updated_at 自動更新トリガー ----
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger trg_projects_updated
  before update on public.projects
  for each row execute function public.handle_updated_at();

create or replace trigger trg_tasks_updated
  before update on public.tasks
  for each row execute function public.handle_updated_at();

create or replace trigger trg_wbs_nodes_updated
  before update on public.wbs_nodes
  for each row execute function public.handle_updated_at();

create or replace trigger trg_reflection_logs_updated
  before update on public.reflection_logs
  for each row execute function public.handle_updated_at();
