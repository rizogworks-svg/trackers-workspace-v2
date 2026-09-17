-- Trackers Workspace v2 - optional Superadmin layer
-- This migration does NOT replace trackly_user_state and does not delete existing data.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'viewer',
  access_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text not null default 'viewer';
alter table public.profiles add column if not exists access_enabled boolean not null default false;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles enable row level security;

-- Backfill auth users that do not have a profile yet. Existing rows are untouched.
insert into public.profiles(user_id,email,full_name,role,access_enabled)
select u.id,u.email,coalesce(u.raw_user_meta_data->>'full_name',''),'viewer',false
from auth.users u
on conflict(user_id) do nothing;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = user_id);

create or replace function public.trackers_is_superadmin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.access_enabled=true and p.role in ('superadmin','owner'));
$$;
revoke all on function public.trackers_is_superadmin() from public;
grant execute on function public.trackers_is_superadmin() to authenticated;

create or replace function public.trackers_superadmin_list_profiles()
returns table(user_id uuid,email text,full_name text,role text,access_enabled boolean,state_updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  if not public.trackers_is_superadmin() then raise exception 'forbidden'; end if;
  return query select p.user_id,p.email,p.full_name,p.role,p.access_enabled,s.updated_at
  from public.profiles p left join public.trackly_user_state s on s.user_id=p.user_id
  order by coalesce(p.full_name,p.email,'') asc;
end;$$;
revoke all on function public.trackers_superadmin_list_profiles() from public;
grant execute on function public.trackers_superadmin_list_profiles() to authenticated;

create or replace function public.trackers_superadmin_set_role(target_user uuid,new_role text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.trackers_is_superadmin() then raise exception 'forbidden'; end if;
  if new_role not in ('superadmin','admin','project_manager','regional_pic','viewer') then raise exception 'invalid role'; end if;
  if target_user=auth.uid() and new_role not in ('superadmin') then raise exception 'cannot demote current superadmin from this console'; end if;
  update public.profiles set role=new_role,updated_at=now() where user_id=target_user and role<>'owner';
end;$$;
revoke all on function public.trackers_superadmin_set_role(uuid,text) from public;
grant execute on function public.trackers_superadmin_set_role(uuid,text) to authenticated;

create or replace function public.trackers_superadmin_set_access(target_user uuid,enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.trackers_is_superadmin() then raise exception 'forbidden'; end if;
  if target_user=auth.uid() and enabled=false then raise exception 'cannot disable current superadmin'; end if;
  update public.profiles set access_enabled=enabled,updated_at=now() where user_id=target_user and role<>'owner';
end;$$;
revoke all on function public.trackers_superadmin_set_access(uuid,boolean) from public;
grant execute on function public.trackers_superadmin_set_access(uuid,boolean) to authenticated;

create or replace function public.trackers_superadmin_reset_user_state(target_user uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.trackers_is_superadmin() then raise exception 'forbidden'; end if;
  insert into public.trackly_user_state(user_id,payload,updated_at)
  values(target_user,'{}'::jsonb,now())
  on conflict(user_id) do update set payload='{}'::jsonb,updated_at=now();
end;$$;
revoke all on function public.trackers_superadmin_reset_user_state(uuid) from public;
grant execute on function public.trackers_superadmin_reset_user_state(uuid) to authenticated;

-- Compatibility RPCs used by the existing Settings > User Access panel.
create or replace function public.trackly_admin_list_profiles()
returns table(user_id uuid,email text,full_name text,role text,access_enabled boolean)
language plpgsql security definer set search_path=public as $$
declare caller_role text;
begin
  select p.role into caller_role from public.profiles p where p.user_id=auth.uid() and p.access_enabled=true;
  if caller_role not in ('owner','superadmin','admin') then raise exception 'forbidden'; end if;
  return query select p.user_id,p.email,p.full_name,p.role,p.access_enabled from public.profiles p
  where caller_role in ('owner','superadmin') or p.role<>'superadmin'
  order by coalesce(p.full_name,p.email,'') asc;
end;$$;
revoke all on function public.trackly_admin_list_profiles() from public;
grant execute on function public.trackly_admin_list_profiles() to authenticated;

create or replace function public.trackly_admin_set_role(target_user uuid,new_role text)
returns void language plpgsql security definer set search_path=public as $$
declare caller_role text; target_role text;
begin
  select p.role into caller_role from public.profiles p where p.user_id=auth.uid() and p.access_enabled=true;
  if caller_role not in ('owner','superadmin','admin') then raise exception 'forbidden'; end if;
  select p.role into target_role from public.profiles p where p.user_id=target_user;
  if target_role in ('owner','superadmin') then raise exception 'protected role'; end if;
  if new_role not in ('admin','project_manager','regional_pic','viewer') then raise exception 'invalid role'; end if;
  update public.profiles set role=new_role,updated_at=now() where user_id=target_user;
end;$$;
revoke all on function public.trackly_admin_set_role(uuid,text) from public;
grant execute on function public.trackly_admin_set_role(uuid,text) to authenticated;

-- Helper trigger for NEW users. Existing profile rows are preserved.
create or replace function public.trackers_handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(user_id,email,full_name,role,access_enabled)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''),'viewer',false)
  on conflict(user_id) do nothing;
  return new;
end;$$;
drop trigger if exists trackers_on_auth_user_created on auth.users;
create trigger trackers_on_auth_user_created after insert on auth.users for each row execute function public.trackers_handle_new_user();

-- After running this migration, promote YOUR account manually once:
-- update public.profiles set role='superadmin', access_enabled=true where email='your@email.com';
