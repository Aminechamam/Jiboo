-- Rayons (départements) : regroupe les catégories sous Pièces Auto / Quincaillerie.
-- Additif uniquement : ne modifie ni ne supprime rien d'existant.
-- À exécuter une fois : Dashboard Supabase > SQL Editor > New query > coller > Run.

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

alter table public.departments enable row level security;

create policy "departments_select_all"
  on public.departments for select
  using (true);

create policy "departments_write_staff"
  on public.departments for insert
  with check (public.is_staff());

create policy "departments_update_staff"
  on public.departments for update
  using (public.is_staff());

insert into public.departments (name, slug) values
  ('Pièces Auto', 'pieces-auto'),
  ('Quincaillerie', 'quincaillerie')
on conflict (name) do nothing;

alter table public.categories add column if not exists department_id uuid references public.departments(id);

-- Backfill : tout part sur Pièces Auto par défaut (comportement identique à avant),
-- sauf HARDEN qui est le lot quincaillerie identifié (74 produits sans marque/modèle).
update public.categories
set department_id = (select id from public.departments where slug = 'pieces-auto')
where department_id is null;

update public.categories
set department_id = (select id from public.departments where slug = 'quincaillerie')
where name = 'HARDEN';
