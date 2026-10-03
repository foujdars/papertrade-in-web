-- Fundamental CSVs are written and read only through the server routes.
-- Keep this bucket private; the service-role key is never sent to browsers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fundamental-data',
  'fundamental-data',
  false,
  10485760,
  array['text/csv', 'application/json']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

