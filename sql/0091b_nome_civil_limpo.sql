-- 0091b (pedido 047): função de limpeza do nome civil (mesma regra da tela) e log de alterações de nome.
create or replace function crm.nome_civil_limpo(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare s text;
begin
  if p is null then return null; end if;
  s := regexp_replace(p, '@[A-Za-z0-9._]+', ' ', 'g');
  s := regexp_replace(s, '[/|]+', ' ', 'g');
  s := regexp_replace(s, '\s*-?\s*\m(INATIV[OA]S?)\M\s*$', '', 'i');
  s := regexp_replace(s, '\s*-\s*$', '');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  if s = '' then return null; end if;
  if s = upper(s) or s = lower(s) then
    s := initcap(lower(s));
    s := regexp_replace(s, ' (Da|De|Do|Das|Dos|E|Di|Du) ', ' \1 ', 'g');
    s := regexp_replace(s, ' (Da|De|Do|Das|Dos|E|Di|Du)(?= )', ' ' || '\1', 'g');
    -- partículas em minúsculas (duas passagens cobrem "da de")
    s := regexp_replace(s, ' (D[aeiou]s?|E) ', ' ' || '<<\1>>' || ' ', 'g');
    s := regexp_replace(s, '<<([^>]+)>>', '\1', 'g');
  end if;
  return s;
end $$;

create table crm.log_parceiro_nome (
  id bigint generated always as identity primary key,
  empresa_id uuid not null, parceiro_id uuid not null references crm.cad_parceiro(id) on delete cascade,
  nome_antes text not null, nome_depois text not null, motivo text not null,
  feito_por uuid default auth.uid(), feito_em timestamptz not null default now()
);
create index on crm.log_parceiro_nome (parceiro_id);
alter table crm.log_parceiro_nome enable row level security;
revoke all on crm.log_parceiro_nome from anon, authenticated;
