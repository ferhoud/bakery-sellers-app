
-- Sellers (vendeuses)
create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text unique not null,
  created_at timestamp with time zone default now()
);

-- Shifts (planning)
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references public.sellers(id) on delete cascade,
  day date not null,
  start_time text,
  end_time text,
  unique (seller_id, day)
);
create index if not exists shifts_day_idx on public.shifts(day);

-- Absences
create table if not exists public.absences (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references public.sellers(id) on delete cascade,
  day date not null,
  reason text,
  status text default 'pending', -- pending|approved|rejected
  replacement_seller_id uuid references public.sellers(id)
);
create index if not exists absences_day_idx on public.absences(day);

-- Messages (chat)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete set null,
  content text not null,
  created_at timestamp with time zone default now()
);

-- Security policies (RLS)
alter table public.sellers enable row level security;
alter table public.shifts enable row level security;
alter table public.absences enable row level security;
alter table public.messages enable row level security;

-- Basic policies (adjust later if needed)
create policy "read sellers" on public.sellers
for select using (true);
create policy "insert sellers admin only" on public.sellers
for insert with check (auth.role() = 'authenticated');
create policy "update sellers admin only" on public.sellers
for update using (auth.role() = 'authenticated');

create policy "read shifts" on public.shifts
for select using (true);
create policy "upsert own shifts (authenticated)" on public.shifts
for insert with check (auth.role() = 'authenticated');
create policy "update shifts (authenticated)" on public.shifts
for update using (auth.role() = 'authenticated');

create policy "read absences" on public.absences
for select using (true);
create policy "insert absences (authenticated)" on public.absences
for insert with check (auth.role() = 'authenticated');
create policy "update absences (authenticated)" on public.absences
for update using (auth.role() = 'authenticated');

create policy "read messages" on public.messages
for select using (true);
create policy "write messages (authenticated)" on public.messages
for insert with check (auth.role() = 'authenticated');

-- Helper view: available sellers for replacement (naive example)
create or replace view public.available_replacements as
select s.id as seller_id, s.name, d.day
from public.sellers s
cross join lateral (
  select generate_series(current_date, current_date + interval '30 days', interval '1 day')::date as day
) d
left join public.absences a on a.seller_id = s.id and a.day = d.day and a.status = 'approved'
left join public.shifts sh on sh.seller_id = s.id and sh.day = d.day
where a.id is null and (sh.id is null or (sh.start_time is null and sh.end_time is null));
