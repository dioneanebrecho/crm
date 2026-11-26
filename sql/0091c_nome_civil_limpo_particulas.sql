create or replace function crm.nome_civil_limpo(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare s text; w text; i int := 0; r text := '';
begin
  if p is null then return null; end if;
  s := regexp_replace(p, '@[A-Za-z0-9._]+', ' ', 'g');
  s := regexp_replace(s, '[/|]+', ' ', 'g');
  s := regexp_replace(s, '\s*-?\s*\m(INATIV[OA]S?)\M\s*$', '', 'i');
  s := regexp_replace(s, '\s*-\s*$', '');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  if s = '' then return null; end if;
  if s <> upper(s) and s <> lower(s) then return s; end if;   -- caixa mista: o usuário já escreveu assim
  foreach w in array string_to_array(lower(s), ' ') loop
    i := i + 1;
    r := r || case when i > 1 then ' ' else '' end
           || case when i > 1 and w in ('da','de','do','das','dos','e','di','du','d''') then w else initcap(w) end;
  end loop;
  return r;
end $$;
