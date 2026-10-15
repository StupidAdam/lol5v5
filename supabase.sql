-- LOL 5v5 位置分配：协作房间表
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行（只需执行一次）

create table if not exists public.rooms (
  code       text primary key,
  data       jsonb       not null default '{}'::jsonb,
  version    int         not null default 0,
  updated_at timestamptz not null default now()
);

-- 开启行级安全，并允许匿名访问（这是个公开小工具，anon key 放在前端是安全的）
alter table public.rooms enable row level security;

drop policy if exists "rooms_anon_select" on public.rooms;
create policy "rooms_anon_select" on public.rooms for select using (true);

drop policy if exists "rooms_anon_insert" on public.rooms;
create policy "rooms_anon_insert" on public.rooms for insert with check (true);

drop policy if exists "rooms_anon_update" on public.rooms;
create policy "rooms_anon_update" on public.rooms for update using (true) with check (true);

-- 把表加入 Realtime 广播（等价于控制台 Database → Replication 里勾选 rooms）
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end $$;

-- 可选：定期清理 7 天前的房间（免费版也能建 pg_cron 任务）
-- select cron.schedule('clean-rooms', '0 4 * * *', $$delete from public.rooms where updated_at < now() - interval '7 days'$$);
