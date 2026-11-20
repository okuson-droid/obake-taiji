-- お化け退治 オンライン対戦の Supabase 定義（design.md §7.4 の写し）。
-- Supabase の SQL Editor で 1 回実行する。手順は deploy/README.md を参照する。

create table public.rooms (
  id text primary key,                 -- 部屋コード（英大文字と数字 6 桁）
  doc jsonb not null,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

create policy rooms_select on public.rooms
  for select to authenticated using (true);

create policy rooms_insert on public.rooms
  for insert to authenticated
  with check (doc->>'host' = auth.uid()::text and version = 0);

-- 更新は関数経由に限る（update / delete のポリシーを作らない）。
create or replace function public.write_room(p_id text, p_expected integer, p_doc jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cur public.rooms%rowtype;
  me text := auth.uid()::text;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  select * into cur from public.rooms where id = p_id for update;
  if not found or cur.version <> p_expected then
    return -1;
  end if;
  if cur.doc->>'status' <> 'lobby' then
    if not exists (
      select 1 from jsonb_array_elements(cur.doc->'seats') s
      where s->>'uid' = me
    ) then
      raise exception 'not seated';
    end if;
  end if;
  update public.rooms
     set doc = p_doc, version = cur.version + 1, updated_at = now()
   where id = p_id;
  return cur.version + 1;
end;
$$;

create or replace function public.clear_room(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rooms where id = p_id and doc->>'host' = auth.uid()::text;
$$;

grant execute on function public.write_room(text, integer, jsonb) to authenticated;
grant execute on function public.clear_room(text) to authenticated;

alter publication supabase_realtime add table public.rooms;
