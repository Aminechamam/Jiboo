-- Annule departments.sql. Ne touche à rien dans categories.name ou products.
alter table public.categories drop column if exists department_id;
drop policy if exists "departments_select_all" on public.departments;
drop policy if exists "departments_write_staff" on public.departments;
drop policy if exists "departments_update_staff" on public.departments;
drop table if exists public.departments;
