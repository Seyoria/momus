-- Momus profilleri için Supabase tablosu ve erişim kuralları
-- Supabase panelinde: SQL Editor > New query > bunu yapıştır > Run

create table if not exists public.momus_profiles (
  username   text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.momus_profiles enable row level security;

-- Herkes (siteye giren herkes, publishable/anon key ile) profilleri okuyabilir
create policy "Public can read profiles"
  on public.momus_profiles for select
  using (true);

-- Herkes yeni profil oluşturabilir
create policy "Public can insert profiles"
  on public.momus_profiles for insert
  with check (true);

-- Herkes profil güncelleyebilir
-- NOT: Bu, sitenin şu anki "sahiplik" modeliyle aynı güven seviyesindedir
-- (tarayıcıda saklanan bir owner-token ile arayüz üzerinden engelleniyor,
-- gerçek bir sunucu tarafı kimlik doğrulaması değil). Yani teorik olarak
-- biri tarayıcı konsolundan başka birinin profilini de değiştirebilir.
-- İleride gerçek Supabase Auth eklenirse bu politika kullanıcı bazlı
-- kısıtlanabilir.
create policy "Public can update profiles"
  on public.momus_profiles for update
  using (true);

create policy "Public can delete profiles"
  on public.momus_profiles for delete
  using (true);
