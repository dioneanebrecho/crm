-- 0084 · Parceiro com dados cadastrais completos (XML da NF-e), endereço padronizado pelo CEP (Correios) e histórico de notas de compra (25/11)
-- STATUS: aplicada em 25/11/2026 (inclui a correção 0084b, aplicada em seguida). Só cria objetos novos e colunas novas (nada existente é alterado ou removido).
-- Pedido do Dione (24-25/11/2026):
--   1) fornecedor criado pelo XML guarda CNPJ completo, IE, telefone, endereço etc. (proteção por permissão fica para depois);
--   2) aba de histórico de notas do parceiro mostra também as notas de COMPRA vinculadas, não só as do Bling;
--   3) endereço: preferir a descrição oficial dos Correios pelo CEP; se a consulta não for confiável, preservar o dado do XML.
--      Mesma regra para clientes (impacta os dados do cliente na geração da venda com o link).
-- Reversão (todos os objetos são novos):
--   drop function api.parceiro_salvar_dados(uuid,uuid,jsonb), api.obter_parceiro_dados(uuid,uuid), api.parceiro_endereco_reaplicar(uuid,uuid),
--     api.cliente_endereco_salvar(uuid,uuid,jsonb), api.cep_obter(uuid,text), api.cep_gravar(uuid,text,jsonb),
--     api.historico_notas_parceiro(uuid,uuid,int,int), api.resumo_compras_parceiro(uuid,uuid), crm._endereco_padrao(text,text,text,text,text);
--   drop table crm.cad_parceiro_dados, crm.cfg_cep_cache;
--   alter table crm.cad_cliente_endereco drop column origem, drop column endereco_original, drop column cep_situacao, drop column codigo_municipio, drop column atualizado_em;

-- ------------------------------------------------------------------ cache do CEP (base dos Correios, via ViaCEP/BrasilAPI na Edge Function consulta-cep)
create table if not exists crm.cfg_cep_cache (
  cep text primary key check (cep ~ '^[0-9]{8}$'),
  encontrado boolean not null,
  logradouro text, complemento text, bairro text, municipio text, uf text, ibge text,
  fonte text not null,
  consultado_em timestamptz not null default now()
);
alter table crm.cfg_cep_cache enable row level security;
drop policy if exists worker_total on crm.cfg_cep_cache;
create policy worker_total on crm.cfg_cep_cache for all to app_worker using (true) with check (true);

-- ------------------------------------------------------------------ dados cadastrais do parceiro (1 linha por parceiro)
create table if not exists crm.cad_parceiro_dados (
  parceiro_id uuid primary key references crm.cad_parceiro(id) on delete cascade,
  empresa_id uuid not null,
  documento text,                       -- CPF/CNPJ completo, só dígitos
  razao_social text, nome_fantasia text, ie text, im text, cnae text, crt text,
  telefone text, email text,
  cep text, logradouro text, numero text, complemento text, bairro text,
  codigo_municipio text, municipio text, uf text, pais text,
  endereco_origem text check (endereco_origem in ('xml','correios','manual')),
  cep_situacao text,                    -- padronizado | parcial | divergente | nao_encontrado | sem_consulta | cep_invalido
  endereco_xml jsonb,                   -- endereço exatamente como veio do XML (para reaplicar a padronização)
  origem text not null default 'xml' check (origem in ('xml','manual')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists cad_parceiro_dados_empresa_idx on crm.cad_parceiro_dados (empresa_id);
alter table crm.cad_parceiro_dados enable row level security;
drop policy if exists worker_total on crm.cad_parceiro_dados;
create policy worker_total on crm.cad_parceiro_dados for all to app_worker using (true) with check (true);

-- ------------------------------------------------------------------ endereço do cliente: rastro da padronização
alter table crm.cad_cliente_endereco
  add column if not exists origem text,
  add column if not exists endereco_original jsonb,
  add column if not exists cep_situacao text,
  add column if not exists codigo_municipio text,
  add column if not exists atualizado_em timestamptz not null default now();

-- ------------------------------------------------------------------ regra única de padronização (fornecedor e cliente)
-- Usa o CEP da base dos Correios (cache). Só adota a descrição dos Correios quando é confiável:
--   · CEP com 8 dígitos e encontrado; · UF e município do CEP batem com os informados (se informados).
-- CEP geral de município (sem logradouro): adota só município/UF; logradouro e bairro ficam como vieram.
-- Qualquer outra situação: preserva o dado original (XML ou digitado) e devolve o motivo em "situacao".
create or replace function crm._endereco_padrao(p_cep text, p_logr text, p_bairro text, p_mun text, p_uf text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_cep text := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g');
  v_logr text := nullif(btrim(p_logr), ''); v_bairro text := nullif(btrim(p_bairro), '');
  v_mun text := nullif(btrim(p_mun), ''); v_uf text := nullif(upper(btrim(p_uf)), '');
  c crm.cfg_cep_cache; v_sit text; v_orig text := 'xml';
  f_mun text;
begin
  if length(v_cep) <> 8 then
    return jsonb_build_object('cep', nullif(v_cep, ''), 'logradouro', v_logr, 'bairro', v_bairro, 'municipio', v_mun, 'uf', v_uf, 'origem', 'xml', 'situacao', 'cep_invalido', 'confiavel', false);
  end if;
  select * into c from crm.cfg_cep_cache where cep = v_cep;
  if not found then v_sit := 'sem_consulta';
  elsif not c.encontrado then v_sit := 'nao_encontrado';
  else
    f_mun := lower(extensions.unaccent(btrim(regexp_replace(coalesce(v_mun, ''), '[^[:alnum:]]+', ' ', 'g'))));
    if (v_uf is not null and upper(c.uf) <> v_uf)
       or (v_mun is not null and f_mun <> lower(extensions.unaccent(btrim(regexp_replace(coalesce(c.municipio, ''), '[^[:alnum:]]+', ' ', 'g'))))) then
      v_sit := 'divergente';
    elsif nullif(btrim(c.logradouro), '') is not null then
      v_sit := 'padronizado'; v_orig := 'correios';
      v_logr := btrim(c.logradouro); v_bairro := coalesce(nullif(btrim(c.bairro), ''), v_bairro); v_mun := c.municipio; v_uf := upper(c.uf);
    else
      v_sit := 'parcial'; v_mun := c.municipio; v_uf := upper(c.uf);
    end if;
  end if;
  return jsonb_build_object('cep', v_cep, 'logradouro', v_logr, 'bairro', v_bairro, 'municipio', v_mun, 'uf', v_uf, 'origem', v_orig, 'situacao', v_sit, 'confiavel', v_sit in ('padronizado', 'parcial'));
end $$;
revoke all on function crm._endereco_padrao(text, text, text, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ cache de CEP (a Edge Function consulta-cep lê e grava por aqui)
create or replace function api.cep_obter(p_empresa uuid, p_cep text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_cep text := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g'); c crm.cfg_cep_cache;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','expedicao','financeiro','rentabilidade']);
  if length(v_cep) <> 8 then raise exception 'CEP inválido' using errcode = '22023'; end if;
  select * into c from crm.cfg_cep_cache where cep = v_cep;
  if not found then return null; end if;
  return jsonb_build_object('cep', c.cep, 'encontrado', c.encontrado, 'logradouro', c.logradouro, 'complemento', c.complemento, 'bairro', c.bairro,
    'municipio', c.municipio, 'uf', c.uf, 'ibge', c.ibge, 'fonte', c.fonte, 'consultado_em', c.consultado_em);
end $$;

create or replace function api.cep_gravar(p_empresa uuid, p_cep text, p_dados jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_cep text := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g');
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora','financeiro','rentabilidade']);
  if length(v_cep) <> 8 then raise exception 'CEP inválido' using errcode = '22023'; end if;
  insert into crm.cfg_cep_cache (cep, encontrado, logradouro, complemento, bairro, municipio, uf, ibge, fonte, consultado_em)
  values (v_cep, coalesce((p_dados ->> 'encontrado')::boolean, false), nullif(btrim(p_dados ->> 'logradouro'), ''), nullif(btrim(p_dados ->> 'complemento'), ''),
          nullif(btrim(p_dados ->> 'bairro'), ''), nullif(btrim(p_dados ->> 'municipio'), ''), nullif(upper(btrim(p_dados ->> 'uf')), ''),
          nullif(btrim(p_dados ->> 'ibge'), ''), coalesce(nullif(p_dados ->> 'fonte', ''), 'viacep'), now())
  on conflict (cep) do update set encontrado = excluded.encontrado, logradouro = excluded.logradouro, complemento = excluded.complemento, bairro = excluded.bairro,
    municipio = excluded.municipio, uf = excluded.uf, ibge = excluded.ibge, fonte = excluded.fonte, consultado_em = now();
end $$;

-- ------------------------------------------------------------------ gravar dados cadastrais do parceiro (XML da NF-e ou manual)
-- p_dados: { documento, razao_social, nome_fantasia, ie, im, cnae, crt, telefone, email, origem,
--            endereco: { cep, logradouro, numero, complemento, bairro, cod_municipio, municipio, uf, pais } }
-- Regras: campos vazios não apagam dados já gravados; endereço digitado à mão (origem manual) não é sobrescrito por XML;
-- se o parceiro ainda não tem CPF/CNPJ como identificador, ele é registrado (hash + 4 últimos) a partir do documento informado.
create or replace function api.parceiro_salvar_dados(p_empresa uuid, p_parceiro uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_doc text := regexp_replace(coalesce(p_dados ->> 'documento', ''), '\D', '', 'g'); v_tipo text; v_origem text := coalesce(nullif(p_dados ->> 'origem', ''), 'xml');
  e jsonb := coalesce(p_dados -> 'endereco', '{}'::jsonb); pad jsonb; old crm.cad_parceiro_dados; v_manter boolean := false; v_tem_end boolean; v_existe boolean;
begin
  perform api._exigir(p_empresa, array['admin','gestor','rentabilidade']);
  if v_origem not in ('xml','manual') then raise exception 'origem inválida' using errcode = '22023'; end if;
  if not exists (select 1 from crm.cad_parceiro where id = p_parceiro and empresa_id = p_empresa) then raise exception 'parceiro não encontrado' using errcode = 'P0002'; end if;
  if v_doc <> '' then
    if length(v_doc) = 14 and bling.fn_cnpj_valido(v_doc) then v_tipo := 'cnpj';
    elsif length(v_doc) = 11 and bling.fn_cpf_valido(v_doc) then v_tipo := 'cpf';
    else raise exception 'documento inválido' using errcode = '22023'; end if;
    if exists (select 1 from crm.cad_parceiro_identificador i where i.parceiro_id = p_parceiro and i.tipo in ('cnpj','cpf')) then
      if not exists (select 1 from crm.cad_parceiro_identificador i where i.parceiro_id = p_parceiro and i.valor_hash = bling.fn_hash_doc(v_doc)) then
        raise exception 'o documento não confere com o cadastro deste parceiro' using errcode = '22023';
      end if;
    elsif not exists (select 1 from crm.cad_parceiro_identificador i where i.empresa_id = p_empresa and i.valor_hash = bling.fn_hash_doc(v_doc)) then
      insert into crm.cad_parceiro_identificador (empresa_id, parceiro_id, tipo, valor_hash, ultimos_digitos) values (p_empresa, p_parceiro, v_tipo, bling.fn_hash_doc(v_doc), right(v_doc, 4));
    else
      raise exception 'este documento já pertence a outro parceiro' using errcode = '23505';
    end if;
  end if;
  v_tem_end := nullif(btrim(e ->> 'cep'), '') is not null or nullif(btrim(e ->> 'logradouro'), '') is not null;
  pad := crm._endereco_padrao(e ->> 'cep', e ->> 'logradouro', e ->> 'bairro', e ->> 'municipio', e ->> 'uf');
  select * into old from crm.cad_parceiro_dados where parceiro_id = p_parceiro;
  v_existe := found;
  v_manter := v_existe and old.endereco_origem = 'manual' and v_origem <> 'manual';
  if not v_existe then
    insert into crm.cad_parceiro_dados (parceiro_id, empresa_id, origem) values (p_parceiro, p_empresa, v_origem);
  end if;
  update crm.cad_parceiro_dados d set
    documento = coalesce(nullif(v_doc, ''), d.documento),
    razao_social = coalesce(nullif(btrim(p_dados ->> 'razao_social'), ''), d.razao_social),
    nome_fantasia = coalesce(nullif(btrim(p_dados ->> 'nome_fantasia'), ''), d.nome_fantasia),
    ie = coalesce(nullif(btrim(p_dados ->> 'ie'), ''), d.ie), im = coalesce(nullif(btrim(p_dados ->> 'im'), ''), d.im),
    cnae = coalesce(nullif(btrim(p_dados ->> 'cnae'), ''), d.cnae), crt = coalesce(nullif(btrim(p_dados ->> 'crt'), ''), d.crt),
    telefone = coalesce(nullif(regexp_replace(coalesce(p_dados ->> 'telefone', ''), '\D', '', 'g'), ''), d.telefone),
    email = coalesce(nullif(lower(btrim(p_dados ->> 'email')), ''), d.email),
    origem = case when d.origem = 'manual' then 'manual' else v_origem end,
    atualizado_em = now()
   where d.parceiro_id = p_parceiro;
  if v_tem_end and not v_manter then
    -- número, complemento e código do município só são herdados do endereço anterior quando o CEP é o mesmo (0084b)
    update crm.cad_parceiro_dados d set
      numero = coalesce(nullif(btrim(e ->> 'numero'), ''), case when d.cep is not distinct from (pad ->> 'cep') then d.numero end),
      complemento = coalesce(nullif(btrim(e ->> 'complemento'), ''), case when d.cep is not distinct from (pad ->> 'cep') then d.complemento end),
      codigo_municipio = coalesce(nullif(btrim(e ->> 'cod_municipio'), ''), case when d.cep is not distinct from (pad ->> 'cep') then d.codigo_municipio end),
      cep = pad ->> 'cep', logradouro = pad ->> 'logradouro', bairro = pad ->> 'bairro', municipio = pad ->> 'municipio', uf = pad ->> 'uf',
      pais = coalesce(nullif(btrim(e ->> 'pais'), ''), d.pais, 'Brasil'),
      endereco_origem = case when v_origem = 'manual' and (pad ->> 'origem') = 'xml' then 'manual' else pad ->> 'origem' end,
      cep_situacao = pad ->> 'situacao', endereco_xml = e
     where d.parceiro_id = p_parceiro;
  end if;
  update crm.cad_parceiro set tipo_pessoa = coalesce(tipo_pessoa, case v_tipo when 'cnpj' then 'J' when 'cpf' then 'F' end), atualizado_em = now() where id = p_parceiro;
  return jsonb_build_object('situacao', pad ->> 'situacao', 'origem', pad ->> 'origem', 'confiavel', (pad -> 'confiavel'), 'endereco_mantido', v_manter);
end $$;

-- Reaplica a padronização a partir do endereço original (útil depois que o CEP entra no cache ou muda na base dos Correios).
create or replace function api.parceiro_endereco_reaplicar(p_empresa uuid, p_parceiro uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d crm.cad_parceiro_dados; e jsonb; pad jsonb;
begin
  perform api._exigir(p_empresa, array['admin','gestor','rentabilidade']);
  select * into d from crm.cad_parceiro_dados where parceiro_id = p_parceiro and empresa_id = p_empresa;
  if not found then raise exception 'parceiro sem dados cadastrais' using errcode = 'P0002'; end if;
  if d.endereco_origem = 'manual' then return jsonb_build_object('situacao', d.cep_situacao, 'origem', 'manual', 'endereco_mantido', true); end if;
  e := coalesce(d.endereco_xml, jsonb_build_object('cep', d.cep, 'logradouro', d.logradouro, 'bairro', d.bairro, 'municipio', d.municipio, 'uf', d.uf));
  pad := crm._endereco_padrao(e ->> 'cep', e ->> 'logradouro', e ->> 'bairro', e ->> 'municipio', e ->> 'uf');
  update crm.cad_parceiro_dados set cep = pad ->> 'cep', logradouro = pad ->> 'logradouro', bairro = pad ->> 'bairro', municipio = pad ->> 'municipio', uf = pad ->> 'uf',
    endereco_origem = pad ->> 'origem', cep_situacao = pad ->> 'situacao', atualizado_em = now() where parceiro_id = p_parceiro;
  return jsonb_build_object('situacao', pad ->> 'situacao', 'origem', pad ->> 'origem', 'confiavel', (pad -> 'confiavel'));
end $$;

create or replace function api.obter_parceiro_dados(p_empresa uuid, p_parceiro uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  -- Hoje: admin, gestor, suporte, financeiro e rentabilidade. A proteção fina por permissão de usuário fica para uma etapa seguinte.
  perform api._exigir(p_empresa, array['admin','gestor','suporte','financeiro','rentabilidade']);
  if not exists (select 1 from crm.cad_parceiro where id = p_parceiro and empresa_id = p_empresa) then raise exception 'parceiro não encontrado' using errcode = 'P0002'; end if;
  select to_jsonb(d) - 'endereco_xml' into r from crm.cad_parceiro_dados d where d.parceiro_id = p_parceiro;
  return r;
end $$;

-- ------------------------------------------------------------------ endereço do cliente com a mesma regra (venda com link usa este endereço)
-- p_dados: { cep, logradouro, numero, complemento, bairro, cod_municipio, municipio, uf, principal (padrão true), origem (xml|manual|formulario) }
create or replace function api.cliente_endereco_salvar(p_empresa uuid, p_cliente uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pad jsonb; v_principal boolean := coalesce((p_dados ->> 'principal')::boolean, true); v_id uuid; v_num text := nullif(btrim(p_dados ->> 'numero'), '');
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','apresentadora']);
  if not exists (select 1 from crm.cad_cliente where id = p_cliente and empresa_id = p_empresa) then raise exception 'cliente não encontrado' using errcode = 'P0002'; end if;
  pad := crm._endereco_padrao(p_dados ->> 'cep', p_dados ->> 'logradouro', p_dados ->> 'bairro', p_dados ->> 'municipio', p_dados ->> 'uf');
  select id into v_id from crm.cad_cliente_endereco
   where cliente_id = p_cliente and empresa_id = p_empresa and cep = (pad ->> 'cep') and coalesce(numero, '') = coalesce(v_num, '') limit 1;
  if v_principal then update crm.cad_cliente_endereco set principal = false where cliente_id = p_cliente and empresa_id = p_empresa and id is distinct from v_id; end if;
  if v_id is null then
    insert into crm.cad_cliente_endereco (empresa_id, cliente_id, cep, logradouro, numero, complemento, bairro, municipio, uf, principal, origem, endereco_original, cep_situacao, codigo_municipio)
    values (p_empresa, p_cliente, pad ->> 'cep', pad ->> 'logradouro', v_num, nullif(btrim(p_dados ->> 'complemento'), ''), pad ->> 'bairro', pad ->> 'municipio', pad ->> 'uf',
            v_principal, coalesce(nullif(p_dados ->> 'origem', ''), 'manual'), p_dados - 'principal', pad ->> 'situacao', nullif(btrim(p_dados ->> 'cod_municipio'), ''))
    returning id into v_id;
  else
    update crm.cad_cliente_endereco set logradouro = pad ->> 'logradouro', complemento = coalesce(nullif(btrim(p_dados ->> 'complemento'), ''), complemento), bairro = pad ->> 'bairro',
      municipio = pad ->> 'municipio', uf = pad ->> 'uf', principal = v_principal or principal, endereco_original = p_dados - 'principal', cep_situacao = pad ->> 'situacao',
      codigo_municipio = coalesce(nullif(btrim(p_dados ->> 'cod_municipio'), ''), codigo_municipio), atualizado_em = now() where id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'situacao', pad ->> 'situacao', 'origem', pad ->> 'origem', 'confiavel', (pad -> 'confiavel'));
end $$;

-- ------------------------------------------------------------------ histórico de notas do parceiro: compra (NF-e importada) + Bling
create or replace function api.historico_notas_parceiro(p_empresa uuid, p_parceiro uuid, p_limite integer default 50, p_offset integer default 0)
returns table(origem text, ref text, numero text, serie text, tipo text, situacao text, data_emissao timestamp without time zone, valor_nota numeric, valor_frete numeric,
              qtd_itens integer, tem_detalhe boolean, bling_id bigint, entrada_id uuid, chave_acesso text, contato_bling_id bigint, contato_nome text, total bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform api._exigir(p_empresa, array['admin','gestor','financeiro']);
  return query
  with u as (
    select 'compra'::text o, e.id::text r, e.numero::text nu, e.serie::text se, 'Entrada'::text ti,
           case e.status when 'importada' then 'Importada' when 'em_edicao' then 'Em edição' when 'confirmada' then 'Confirmada' when 'cancelada' then 'Cancelada' else e.status end st,
           e.emitida_em::timestamp dt, e.v_nf vn, e.v_frete vf, (select count(*)::int from compra.mov_entrada_item i where i.entrada_id = e.id) qi, true td,
           null::bigint bi, e.id ei, e.chave_acesso ch, null::bigint cb, null::text cn
      from compra.mov_entrada e where e.empresa_id = p_empresa and e.fornecedor_parceiro_id = p_parceiro
    union all
    select 'bling'::text, n.bling_id::text, n.numero::text, n.serie::text, case n.tipo when 0 then 'Entrada' when 1 then 'Saída' end,
           coalesce(s.rotulo, 'Situação ' || n.situacao), n.data_emissao, n.valor_nota, n.valor_frete, n.qtd_itens, n.tem_detalhe,
           n.bling_id, null::uuid, null::text, n.contato_bling_id, n.contato_nome
      from bling.cad_nfe n
      join bling.rel_contato_parceiro m on m.empresa_id = n.empresa_id and m.bling_id = n.contato_bling_id
      left join bling.cfg_dominio_nfe_situacao s on s.codigo = n.situacao
     where n.empresa_id = p_empresa and m.parceiro_id = p_parceiro and m.status = 'vinculado')
  select u.o, u.r, u.nu, u.se, u.ti, u.st, u.dt, u.vn, u.vf, u.qi, u.td, u.bi, u.ei, u.ch, u.cb, u.cn, count(*) over ()
    from u order by u.dt desc nulls last, u.r
   limit least(greatest(coalesce(p_limite, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create or replace function api.resumo_compras_parceiro(p_empresa uuid, p_parceiro uuid)
returns table(qtd_compras bigint, qtd_canceladas bigint, valor_total numeric, primeira date, ultima date)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin','gestor','financeiro']);
  return query
  select count(*) filter (where e.status <> 'cancelada'), count(*) filter (where e.status = 'cancelada'),
         coalesce(sum(e.v_nf) filter (where e.status <> 'cancelada'), 0),
         min(e.emitida_em) filter (where e.status <> 'cancelada'), max(e.emitida_em) filter (where e.status <> 'cancelada')
    from compra.mov_entrada e where e.empresa_id = p_empresa and e.fornecedor_parceiro_id = p_parceiro;
end $$;

-- ------------------------------------------------------------------ permissões (mesmo padrão das demais funções api.*)
do $$
declare f text;
begin
  foreach f in array array[
    'api.cep_obter(uuid,text)', 'api.cep_gravar(uuid,text,jsonb)', 'api.parceiro_salvar_dados(uuid,uuid,jsonb)', 'api.parceiro_endereco_reaplicar(uuid,uuid)',
    'api.obter_parceiro_dados(uuid,uuid)', 'api.cliente_endereco_salvar(uuid,uuid,jsonb)', 'api.historico_notas_parceiro(uuid,uuid,integer,integer)',
    'api.resumo_compras_parceiro(uuid,uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
