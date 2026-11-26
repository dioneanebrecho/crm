-- 0091e (pedido 047): endereços no PARCEIRO (fonte de referência) e consulta oficial do CEP em segundo plano.

create table crm.cad_parceiro_endereco (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id),
  parceiro_id uuid not null references crm.cad_parceiro(id) on delete cascade,
  tipo text not null default 'entrega' check (tipo in ('entrega','fiscal','ambos')),
  apelido text,
  cep text not null check (cep ~ '^[0-9]{8}$'),
  logradouro text not null, numero text not null, complemento text, bairro text,
  municipio text not null, uf text not null check (uf ~ '^[A-Z]{2}$'), codigo_municipio text,
  principal boolean not null default false,
  cep_situacao text, endereco_original jsonb,
  origem text not null default 'manual' check (origem in ('vitrine','pagamento','manual','bling','xml','migracao')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), ultimo_uso_em timestamptz
);
comment on table crm.cad_parceiro_endereco is 'Endereços do parceiro (referência única). Padronizados pela base dos Correios (cache crm.cfg_cep_cache) quando o CEP é confiável.';
create index cad_parceiro_endereco_parceiro_idx on crm.cad_parceiro_endereco (parceiro_id, ativo, ultimo_uso_em desc);
create unique index cad_parceiro_endereco_principal_uq on crm.cad_parceiro_endereco (parceiro_id) where principal and ativo;
create index cad_parceiro_endereco_cep_idx on crm.cad_parceiro_endereco (cep) where cep_situacao = 'sem_consulta';
alter table crm.cad_parceiro_endereco enable row level security;
revoke all on crm.cad_parceiro_endereco from anon, authenticated;

-- fila da consulta oficial do CEP (ViaCEP, mesma fonte da Edge Function consulta-cep), feita de dentro do banco
create table crm.fila_cep (
  cep text primary key check (cep ~ '^[0-9]{8}$'),
  estado text not null default 'novo' check (estado in ('novo','enviado','feito','erro')),
  pedido_net bigint, tentativas int not null default 0, solicitado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
alter table crm.fila_cep enable row level security;
revoke all on crm.fila_cep from anon, authenticated;

create or replace function crm.solicitar_cep(p_cep text) returns void
language plpgsql security definer set search_path = '' as $$
declare v text := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g');
begin
  if v !~ '^[0-9]{8}$' then return; end if;
  if exists (select 1 from crm.cfg_cep_cache c where c.cep = v and c.consultado_em > now() - case when c.encontrado then interval '180 days' else interval '7 days' end) then return; end if;
  insert into crm.fila_cep (cep) values (v)
  on conflict (cep) do update set estado = 'novo', tentativas = 0, atualizado_em = now() where crm.fila_cep.estado in ('feito','erro');
end $$;

-- endereço salvo no parceiro, padronizado pelo CEP; deduplica por CEP + número + complemento
create or replace function crm.salvar_endereco_parceiro(p_empresa uuid, p_parceiro uuid, p_dados jsonb, p_origem text, p_principal boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pad jsonb; v_num text := nullif(btrim(p_dados ->> 'numero'), ''); v_comp text := nullif(btrim(p_dados ->> 'complemento'), ''); v_id uuid; v_ibge text;
begin
  pad := crm._endereco_padrao(p_dados ->> 'cep', p_dados ->> 'logradouro', p_dados ->> 'bairro', p_dados ->> 'municipio', p_dados ->> 'uf');
  if pad ->> 'cep' is null or length(pad ->> 'cep') <> 8 or v_num is null or nullif(pad ->> 'logradouro', '') is null
     or nullif(pad ->> 'municipio', '') is null or coalesce(pad ->> 'uf', '') !~ '^[A-Z]{2}$' then
    raise exception 'endereço incompleto' using errcode = '22023';
  end if;
  select ibge into v_ibge from crm.cfg_cep_cache where cep = pad ->> 'cep' and encontrado;
  select id into v_id from crm.cad_parceiro_endereco
   where parceiro_id = p_parceiro and ativo and cep = pad ->> 'cep' and lower(numero) = lower(v_num) and coalesce(lower(complemento), '') = coalesce(lower(v_comp), '') limit 1;
  if p_principal then update crm.cad_parceiro_endereco set principal = false, atualizado_em = now() where parceiro_id = p_parceiro and principal and id is distinct from v_id; end if;
  if v_id is null then
    insert into crm.cad_parceiro_endereco (empresa_id, parceiro_id, cep, logradouro, numero, complemento, bairro, municipio, uf, codigo_municipio, principal, cep_situacao, endereco_original, origem, ultimo_uso_em)
    values (p_empresa, p_parceiro, pad ->> 'cep', pad ->> 'logradouro', v_num, v_comp, pad ->> 'bairro', pad ->> 'municipio', pad ->> 'uf', v_ibge,
            p_principal, pad ->> 'situacao', p_dados, p_origem, now()) returning id into v_id;
  else
    update crm.cad_parceiro_endereco set logradouro = pad ->> 'logradouro', bairro = pad ->> 'bairro', municipio = pad ->> 'municipio', uf = pad ->> 'uf',
           codigo_municipio = coalesce(v_ibge, codigo_municipio), cep_situacao = pad ->> 'situacao', endereco_original = p_dados,
           principal = principal or p_principal, ultimo_uso_em = now(), atualizado_em = now() where id = v_id;
  end if;
  if pad ->> 'situacao' = 'sem_consulta' then perform crm.solicitar_cep(pad ->> 'cep'); end if;
  return jsonb_build_object('id', v_id, 'situacao', pad ->> 'situacao', 'confiavel', pad -> 'confiavel');
end $$;

-- reaplica a padronização quando o CEP chega da consulta oficial
create or replace function crm.reaplicar_cep_enderecos(p_cep text) returns int
language plpgsql security definer set search_path = '' as $$
declare e crm.cad_parceiro_endereco; pad jsonb; n int := 0; v_ibge text;
begin
  select ibge into v_ibge from crm.cfg_cep_cache where cep = p_cep and encontrado;
  for e in select * from crm.cad_parceiro_endereco where cep = p_cep and cep_situacao = 'sem_consulta' loop
    pad := crm._endereco_padrao(e.cep, coalesce(e.endereco_original ->> 'logradouro', e.logradouro), coalesce(e.endereco_original ->> 'bairro', e.bairro),
                                coalesce(e.endereco_original ->> 'municipio', e.municipio), coalesce(e.endereco_original ->> 'uf', e.uf));
    update crm.cad_parceiro_endereco set logradouro = coalesce(pad ->> 'logradouro', logradouro), bairro = pad ->> 'bairro', municipio = coalesce(pad ->> 'municipio', municipio),
           uf = coalesce(pad ->> 'uf', uf), codigo_municipio = coalesce(v_ibge, codigo_municipio), cep_situacao = pad ->> 'situacao', atualizado_em = now() where id = e.id;
    n := n + 1;
  end loop;
  update crm.cad_parceiro_dados d set codigo_municipio = coalesce(d.codigo_municipio, v_ibge), cep_situacao = case when d.cep_situacao = 'sem_consulta' then 'padronizado' else d.cep_situacao end
   where d.cep = p_cep and v_ibge is not null and (d.codigo_municipio is null or d.cep_situacao = 'sem_consulta');
  return n;
end $$;

create or replace function crm.processar_fila_cep(p_limite int default 20) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f crm.fila_cep; resp record; j jsonb; v_env int := 0; v_ok int := 0;
begin
  -- 1) respostas que chegaram
  for f in select * from crm.fila_cep where estado = 'enviado' order by atualizado_em limit 100 loop
    select status_code, content, timed_out into resp from net._http_response where id = f.pedido_net;
    if not found then
      if f.atualizado_em < now() - interval '5 minutes' then update crm.fila_cep set estado = case when tentativas >= 3 then 'erro' else 'novo' end, atualizado_em = now() where cep = f.cep; end if;
      continue;
    end if;
    begin j := resp.content::jsonb; exception when others then j := null; end;
    if resp.status_code = 200 and j is not null then
      insert into crm.cfg_cep_cache (cep, encontrado, logradouro, complemento, bairro, municipio, uf, ibge, fonte, consultado_em)
      values (f.cep, not coalesce((j ->> 'erro')::boolean, false), nullif(j ->> 'logradouro', ''), nullif(j ->> 'complemento', ''), nullif(j ->> 'bairro', ''),
              nullif(j ->> 'localidade', ''), nullif(j ->> 'uf', ''), nullif(j ->> 'ibge', ''), 'viacep', now())
      on conflict (cep) do update set encontrado = excluded.encontrado, logradouro = excluded.logradouro, complemento = excluded.complemento, bairro = excluded.bairro,
        municipio = excluded.municipio, uf = excluded.uf, ibge = excluded.ibge, fonte = excluded.fonte, consultado_em = excluded.consultado_em;
      update crm.fila_cep set estado = 'feito', atualizado_em = now() where cep = f.cep;
      perform crm.reaplicar_cep_enderecos(f.cep);
      v_ok := v_ok + 1;
    elsif resp.status_code = 400 then
      insert into crm.cfg_cep_cache (cep, encontrado, fonte, consultado_em) values (f.cep, false, 'viacep', now())
      on conflict (cep) do update set encontrado = false, consultado_em = now();
      update crm.fila_cep set estado = 'feito', atualizado_em = now() where cep = f.cep;
    else
      update crm.fila_cep set estado = case when tentativas >= 3 then 'erro' else 'novo' end, atualizado_em = now() where cep = f.cep;
    end if;
  end loop;
  -- 2) novos pedidos (poucos por vez, para não pesar no ViaCEP)
  for f in select * from crm.fila_cep where estado = 'novo' order by solicitado_em limit greatest(1, least(p_limite, 50)) loop
    update crm.fila_cep set pedido_net = net.http_get('https://viacep.com.br/ws/' || f.cep || '/json/', timeout_milliseconds => 8000),
           estado = 'enviado', tentativas = tentativas + 1, atualizado_em = now() where cep = f.cep;
    v_env := v_env + 1;
  end loop;
  return jsonb_build_object('enviados', v_env, 'concluidos', v_ok);
end $$;

revoke all on function crm.solicitar_cep(text), crm.salvar_endereco_parceiro(uuid, uuid, jsonb, text, boolean), crm.reaplicar_cep_enderecos(text), crm.processar_fila_cep(int) from public, anon, authenticated;

select cron.schedule('cep-consulta-oficial', '* * * * *', $$select crm.processar_fila_cep(20)$$);

-- Central de vendas: "dados confirmados" passa a ser da reserva (pagador e endereço definidos no link), não de um endereço antigo do perfil
do $m$
declare d text := pg_get_functiondef('api.listar_ofertas'::regproc); n text;
begin
  n := replace(d, 'when exists (select 1 from crm.cad_cliente_endereco e where e.cliente_id = c.id) then ''dados_confirmados''',
                  'when r.pagador_definido_em is not null then ''dados_confirmados''');
  if n = d then raise exception 'listar_ofertas: trecho não encontrado'; end if;
  execute n;
end $m$;

alter table live.mov_reserva add column endereco_entrega_id uuid references crm.cad_parceiro_endereco(id);
