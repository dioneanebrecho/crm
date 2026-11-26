-- 0094a (pedido 049): conferência das peças por código de barras antes de fechar o envio.
-- A equipe bipa qualquer peça para localizar o envio, bipa todas as peças do envio, pesa e mede a caixa.
-- Sem conferência fechada não se define o frete; sem frete pago não se expede (regra do pedido 048, inalterada).

-- ---------------------------------------------------------------- configuração
create table venda.cfg_expedicao (
  empresa_id uuid primary key references crm.cad_empresa(id),
  peso_padrao_peca_g int not null default 350 check (peso_padrao_peca_g > 0),
  comprimento_padrao_cm int not null default 30 check (comprimento_padrao_cm > 0),
  largura_padrao_cm int not null default 20 check (largura_padrao_cm > 0),
  altura_padrao_cm int not null default 10 check (altura_padrao_cm > 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table venda.cfg_expedicao enable row level security;
revoke all on venda.cfg_expedicao from anon, authenticated;
insert into venda.cfg_expedicao (empresa_id) select id from crm.cad_empresa on conflict do nothing;

-- ---------------------------------------------------------------- peso, medidas e situações novas
alter table venda.mov_expedicao
  add column peso_g int check (peso_g > 0),
  add column comprimento_cm int check (comprimento_cm > 0),
  add column largura_cm int check (largura_cm > 0),
  add column altura_cm int check (altura_cm > 0),
  add column conferida_em timestamptz,
  add column conferida_por uuid;

alter table venda.mov_expedicao drop constraint mov_expedicao_estado_check;
-- os envios já abertos estavam prontos para receber o frete: entram como conferidos, ninguém volta para a bancada
update venda.mov_expedicao set estado = 'conferida', conferida_em = coalesce(conferida_em, criado_em) where estado = 'aguardando_frete';
alter table venda.mov_expedicao add constraint mov_expedicao_estado_check
  check (estado in ('aguardando_conferencia','conferida','frete_cobrado','pronta','enviada','entregue','cancelada'));
alter table venda.mov_expedicao alter column estado set default 'aguardando_conferencia';

create table venda.rel_expedicao_item_conferido (
  expedicao_id uuid not null references venda.mov_expedicao(id) on delete cascade,
  pedido_item_id uuid not null references venda.mov_pedido_item(id),
  unidade_id uuid not null references catalogo.cad_unidade(id),
  bipado_em timestamptz not null default now(),
  bipado_por uuid default auth.uid(),
  primary key (expedicao_id, pedido_item_id)
);
create index on venda.rel_expedicao_item_conferido (unidade_id);
alter table venda.rel_expedicao_item_conferido enable row level security;
revoke all on venda.rel_expedicao_item_conferido from anon, authenticated;

-- ---------------------------------------------------------------- resolver o que foi bipado
-- aceita o código de barras da etiqueta (catalogo.cad_unidade.codigo, o {codigo_unidade} do layout)
-- e o código curto numérico da live. O código da unidade tem prioridade.
create or replace function venda._unidade_do_codigo(p_empresa uuid, p_codigo text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from (
    select u.id, 1 as pri
      from catalogo.cad_unidade u
     where u.empresa_id = p_empresa and upper(btrim(u.codigo)) = upper(btrim(coalesce(p_codigo, '')))
    union all
    select c.unidade_id, 2
      from catalogo.cad_codigo_curto c
     where c.empresa_id = p_empresa and c.liberado_em is null
       and c.numero = (case when btrim(coalesce(p_codigo, '')) ~ '^[0-9]{1,9}$' then btrim(p_codigo)::int end)
  ) s order by pri limit 1
$$;
revoke all on function venda._unidade_do_codigo(uuid, text) from public, anon, authenticated;

create or replace function venda._conferencia_resumo(p_expedicao uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'total', count(*),
    'conferidos', count(*) filter (where cf.pedido_item_id is not null),
    'itens', coalesce(jsonb_agg(jsonb_build_object(
        'pedido_item_id', pi.id, 'unidade_id', pi.unidade_id, 'codigo', u.codigo,
        'descricao', pi.descricao, 'conferido', cf.pedido_item_id is not null, 'bipado_em', cf.bipado_em)
      order by (cf.pedido_item_id is not null), u.codigo), '[]'::jsonb))
    from venda.rel_expedicao_pedido rp
    join venda.mov_pedido_item pi on pi.pedido_id = rp.pedido_id
    left join catalogo.cad_unidade u on u.id = pi.unidade_id
    left join venda.rel_expedicao_item_conferido cf on cf.expedicao_id = rp.expedicao_id and cf.pedido_item_id = pi.id
   where rp.expedicao_id = p_expedicao
$$;
revoke all on function venda._conferencia_resumo(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- localizar o envio bipando qualquer peça
create or replace function api.expedicao_por_codigo(p_empresa uuid, p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_un uuid; v_exp uuid; v_estado text; v_num bigint; v_parc text; v_enviada text;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','expedicao']);
  v_un := venda._unidade_do_codigo(p_empresa, p_codigo);
  if v_un is null then
    raise exception 'peça % não encontrada no estoque', btrim(coalesce(p_codigo, '')) using errcode = 'P0002';
  end if;
  select x.id, x.estado, x.numero, p.nome into v_exp, v_estado, v_num, v_parc
    from venda.rel_expedicao_pedido rp
    join venda.mov_pedido_item pi on pi.pedido_id = rp.pedido_id
    join venda.mov_expedicao x on x.id = rp.expedicao_id
    join crm.cad_parceiro p on p.id = x.parceiro_id
   where pi.unidade_id = v_un and x.empresa_id = p_empresa and x.estado <> 'cancelada'
   order by x.criado_em desc limit 1;
  if v_exp is null then
    raise exception 'esta peça não está em nenhum envio montado: monte o envio na aba “A montar”' using errcode = '22023';
  end if;
  if v_estado in ('enviada','entregue') then
    select to_char(enviada_em, 'DD/MM HH24:MI') into v_enviada from venda.mov_expedicao where id = v_exp;
    raise exception 'esta peça já saiu no envio % em %', v_num, coalesce(v_enviada, '-') using errcode = '22023';
  end if;
  return jsonb_build_object('expedicao_id', v_exp, 'numero', v_num, 'parceiro', v_parc,
                            'estado', v_estado, 'unidade_id', v_un);
end $$;

-- ---------------------------------------------------------------- a conferência em si
create or replace function api.expedicao_conferencia(p_empresa uuid, p_expedicao uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare x venda.mov_expedicao; c venda.cfg_expedicao; v_res jsonb;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','expedicao','financeiro','leitura']);
  select * into x from venda.mov_expedicao where id = p_expedicao and empresa_id = p_empresa;
  if x.id is null then raise exception 'envio não encontrado' using errcode = 'P0002'; end if;
  select * into c from venda.cfg_expedicao where empresa_id = p_empresa;
  v_res := venda._conferencia_resumo(x.id);
  return v_res || jsonb_build_object(
    'expedicao_id', x.id, 'numero', x.numero, 'estado', x.estado,
    'parceiro', (select nome from crm.cad_parceiro where id = x.parceiro_id),
    'endereco', venda._resumo_endereco(x.endereco_id),
    'peso_g', coalesce(x.peso_g, coalesce(c.peso_padrao_peca_g, 350) * greatest((v_res ->> 'total')::int, 1)),
    'comprimento_cm', coalesce(x.comprimento_cm, c.comprimento_padrao_cm, 30),
    'largura_cm', coalesce(x.largura_cm, c.largura_padrao_cm, 20),
    'altura_cm', coalesce(x.altura_cm, c.altura_padrao_cm, 10),
    'medidas_confirmadas', x.peso_g is not null, 'conferida_em', x.conferida_em);
end $$;

create or replace function api.expedicao_conferir_peca(p_empresa uuid, p_expedicao uuid, p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x venda.mov_expedicao; v_un uuid; v_item uuid; v_desc text; v_outro bigint; v_outro_nome text;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','expedicao']);
  select * into x from venda.mov_expedicao where id = p_expedicao and empresa_id = p_empresa for update;
  if x.id is null then raise exception 'envio não encontrado' using errcode = 'P0002'; end if;
  if x.estado <> 'aguardando_conferencia' then
    raise exception 'este envio não está em conferência (situação: %)', x.estado using errcode = '22023';
  end if;
  v_un := venda._unidade_do_codigo(p_empresa, p_codigo);
  if v_un is null then
    raise exception 'peça % não encontrada no estoque', btrim(coalesce(p_codigo, '')) using errcode = 'P0002';
  end if;
  select pi.id, pi.descricao into v_item, v_desc
    from venda.rel_expedicao_pedido rp join venda.mov_pedido_item pi on pi.pedido_id = rp.pedido_id
   where rp.expedicao_id = x.id and pi.unidade_id = v_un limit 1;
  if v_item is null then
    select o.numero, p.nome into v_outro, v_outro_nome
      from venda.rel_expedicao_pedido rp join venda.mov_pedido_item pi on pi.pedido_id = rp.pedido_id
      join venda.mov_expedicao o on o.id = rp.expedicao_id join crm.cad_parceiro p on p.id = o.parceiro_id
     where pi.unidade_id = v_un and o.empresa_id = p_empresa and o.estado <> 'cancelada'
     order by o.criado_em desc limit 1;
    if v_outro is not null then
      raise exception 'esta peça é do envio % (%): separe na caixa certa', v_outro, v_outro_nome using errcode = '22023';
    end if;
    raise exception 'esta peça não faz parte deste envio' using errcode = '22023';
  end if;
  if exists (select 1 from venda.rel_expedicao_item_conferido where expedicao_id = x.id and pedido_item_id = v_item) then
    raise exception 'a peça % já foi conferida', coalesce(v_desc, btrim(p_codigo)) using errcode = '22023';
  end if;
  insert into venda.rel_expedicao_item_conferido (expedicao_id, pedido_item_id, unidade_id) values (x.id, v_item, v_un);
  update venda.mov_expedicao set atualizado_em = now() where id = x.id;
  return venda._conferencia_resumo(x.id) || jsonb_build_object('descricao', v_desc);
end $$;

create or replace function api.expedicao_fechar_conferencia(p_empresa uuid, p_expedicao uuid, p_peso_g int,
  p_comprimento_cm int default null, p_largura_cm int default null, p_altura_cm int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x venda.mov_expedicao; c venda.cfg_expedicao; v jsonb;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','expedicao']);
  select * into x from venda.mov_expedicao where id = p_expedicao and empresa_id = p_empresa for update;
  if x.id is null then raise exception 'envio não encontrado' using errcode = 'P0002'; end if;
  if x.estado <> 'aguardando_conferencia' then
    raise exception 'este envio não está em conferência (situação: %)', x.estado using errcode = '22023';
  end if;
  v := venda._conferencia_resumo(x.id);
  if (v ->> 'total')::int = 0 then raise exception 'este envio está sem peças' using errcode = '22023'; end if;
  if (v ->> 'conferidos')::int < (v ->> 'total')::int then
    raise exception 'faltam % peça(s) para bipar', (v ->> 'total')::int - (v ->> 'conferidos')::int using errcode = '22023';
  end if;
  if coalesce(p_peso_g, 0) <= 0 then raise exception 'informe o peso da caixa em gramas' using errcode = '22023'; end if;
  if p_peso_g > 30000 then raise exception 'peso acima de 30 kg: confira a balança' using errcode = '22023'; end if;
  select * into c from venda.cfg_expedicao where empresa_id = p_empresa;
  update venda.mov_expedicao
     set peso_g = p_peso_g,
         comprimento_cm = coalesce(p_comprimento_cm, c.comprimento_padrao_cm, 30),
         largura_cm = coalesce(p_largura_cm, c.largura_padrao_cm, 20),
         altura_cm = coalesce(p_altura_cm, c.altura_padrao_cm, 10),
         conferida_em = now(), conferida_por = auth.uid(), estado = 'conferida', atualizado_em = now()
   where id = x.id;
  return jsonb_build_object('estado', 'conferida', 'conferidos', v ->> 'conferidos');
end $$;

create or replace function api.expedicao_reabrir_conferencia(p_empresa uuid, p_expedicao uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare x venda.mov_expedicao;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','expedicao']);
  select * into x from venda.mov_expedicao where id = p_expedicao and empresa_id = p_empresa for update;
  if x.id is null then raise exception 'envio não encontrado' using errcode = 'P0002'; end if;
  if x.estado <> 'conferida' then
    raise exception 'só dá para refazer a conferência antes de cobrar o frete (situação: %)', x.estado using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'informe o motivo' using errcode = '22023'; end if;
  delete from venda.rel_expedicao_item_conferido where expedicao_id = x.id;
  update venda.mov_expedicao
     set estado = 'aguardando_conferencia', conferida_em = null, conferida_por = null, peso_g = null,
         observacao = left(coalesce(observacao || ' · ', '') || 'conferência refeita: ' || btrim(p_motivo), 2000),
         atualizado_em = now()
   where id = x.id;
end $$;

create or replace function api.expedicao_cfg_obter(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c venda.cfg_expedicao;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','expedicao','financeiro','leitura']);
  select * into c from venda.cfg_expedicao where empresa_id = p_empresa;
  return jsonb_build_object('peso_padrao_peca_g', coalesce(c.peso_padrao_peca_g, 350),
    'comprimento_padrao_cm', coalesce(c.comprimento_padrao_cm, 30),
    'largura_padrao_cm', coalesce(c.largura_padrao_cm, 20),
    'altura_padrao_cm', coalesce(c.altura_padrao_cm, 10));
end $$;

create or replace function api.expedicao_cfg_salvar(p_empresa uuid, p_peso_peca_g int, p_comprimento_cm int,
  p_largura_cm int, p_altura_cm int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  if coalesce(p_peso_peca_g, 0) <= 0 or coalesce(p_comprimento_cm, 0) <= 0
     or coalesce(p_largura_cm, 0) <= 0 or coalesce(p_altura_cm, 0) <= 0 then
    raise exception 'peso e medidas precisam ser maiores que zero' using errcode = '22023';
  end if;
  insert into venda.cfg_expedicao (empresa_id, peso_padrao_peca_g, comprimento_padrao_cm, largura_padrao_cm, altura_padrao_cm, atualizado_por)
  values (p_empresa, p_peso_peca_g, p_comprimento_cm, p_largura_cm, p_altura_cm, auth.uid())
  on conflict (empresa_id) do update set peso_padrao_peca_g = excluded.peso_padrao_peca_g,
    comprimento_padrao_cm = excluded.comprimento_padrao_cm, largura_padrao_cm = excluded.largura_padrao_cm,
    altura_padrao_cm = excluded.altura_padrao_cm, atualizado_em = now(), atualizado_por = auth.uid();
end $$;

-- ---------------------------------------------------------------- funções do 048 que mudam de situação
-- montar: junta no envio ainda em conferência OU já conferido; se entrar peça nova num já conferido, volta para a bancada
create or replace function api.expedicao_montar(p_empresa uuid, p_parceiro uuid, p_endereco uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_exp uuid; v_estado text; v_n int;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','expedicao']);
  select id, estado into v_exp, v_estado from venda.mov_expedicao
   where empresa_id = p_empresa and parceiro_id = p_parceiro and estado in ('aguardando_conferencia','conferida')
     and endereco_id is not distinct from p_endereco order by criado_em desc limit 1 for update;
  if v_exp is null then
    insert into venda.mov_expedicao (empresa_id, parceiro_id, endereco_id) values (p_empresa, p_parceiro, p_endereco) returning id into v_exp;
    v_estado := 'aguardando_conferencia';
  end if;
  insert into venda.rel_expedicao_pedido (expedicao_id, pedido_id)
  select v_exp, d.pedido_id from venda.vw_pedido_destino d
   where d.empresa_id = p_empresa and d.destinatario_id = p_parceiro and d.endereco_id is not distinct from p_endereco
     and d.estado not in ('cancelado','revisao_manual','expedido','entregue')
     and not exists (select 1 from venda.rel_expedicao_pedido rp where rp.pedido_id = d.pedido_id)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 and not exists (select 1 from venda.rel_expedicao_pedido where expedicao_id = v_exp) then
    delete from venda.mov_expedicao where id = v_exp;
    raise exception 'não há pedidos pagos pendentes para essa pessoa e endereço' using errcode = '22023';
  end if;
  if v_n > 0 and v_estado = 'conferida' then
    -- peça nova entrou depois da conferência: a caixa muda de peso, então confere de novo
    update venda.mov_expedicao set estado = 'aguardando_conferencia', conferida_em = null, conferida_por = null, peso_g = null where id = v_exp;
  end if;
  update venda.mov_expedicao set atualizado_em = now() where id = v_exp;
  return v_exp;
end $$;

create or replace function api.expedicao_definir_frete(p_empresa uuid, p_expedicao uuid, p_valor numeric, p_servico text default null,
  p_prazo_dias int default null, p_gratis boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x venda.mov_expedicao; v_cli uuid; v_pag uuid; v_cob uuid;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','expedicao']);
  select * into x from venda.mov_expedicao where id = p_expedicao and empresa_id = p_empresa for update;
  if x.id is null then raise exception 'envio não encontrado' using errcode = 'P0002'; end if;
  if x.estado = 'aguardando_conferencia' then
    raise exception 'confira as peças e informe o peso antes de cobrar o frete' using errcode = '22023';
  end if;
  if x.estado not in ('conferida','frete_cobrado') then
    raise exception 'o frete deste envio não pode mais ser alterado (situação: %)', x.estado using errcode = '22023';
  end if;
  if coalesce(p_valor, 0) < 0 then raise exception 'frete inválido' using errcode = '22023'; end if;
  if x.cobranca_frete_id is not null then
    update venda.mov_cobranca set estado = 'cancelada' where id = x.cobranca_frete_id and estado = 'aberta';
  end if;
  if coalesce(p_gratis, false) or coalesce(p_valor, 0) = 0 then
    update venda.mov_expedicao set valor_frete = 0, frete_gratis = true, servico = p_servico, prazo_dias = p_prazo_dias, cobranca_frete_id = null,
           estado = 'pronta', atualizado_em = now() where id = x.id;
    return jsonb_build_object('estado', 'pronta');
  end if;
  select p.cliente_id, p.parceiro_pagador_id into v_cli, v_pag from venda.rel_expedicao_pedido rp join venda.mov_pedido p on p.id = rp.pedido_id
   where rp.expedicao_id = x.id order by p.criado_em limit 1;
  insert into venda.mov_cobranca (empresa_id, cliente_id, live_id, valor_itens, frete, desconto, tipo, parceiro_pagador_id, expira_em)
  values (p_empresa, v_cli, null, 0, p_valor, 0, 'frete', coalesce(v_pag, x.parceiro_id), now() + interval '3 days') returning id into v_cob;
  update venda.mov_expedicao set valor_frete = p_valor, frete_gratis = false, servico = p_servico, prazo_dias = p_prazo_dias, cobranca_frete_id = v_cob,
         estado = 'frete_cobrado', atualizado_em = now() where id = x.id;
  return jsonb_build_object('estado', 'frete_cobrado', 'cobranca_id', v_cob);
end $$;

create or replace function api.expedicao_cancelar(p_empresa uuid, p_expedicao uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare x venda.mov_expedicao;
begin
  perform api._exigir(p_empresa, array['admin','gestor','expedicao']);
  select * into x from venda.mov_expedicao where id = p_expedicao and empresa_id = p_empresa for update;
  if x.id is null then raise exception 'envio não encontrado' using errcode = 'P0002'; end if;
  if x.estado in ('enviada','entregue','cancelada') then raise exception 'não é possível desfazer um envio %', x.estado using errcode = '22023'; end if;
  if exists (select 1 from venda.mov_cobranca where id = x.cobranca_frete_id and estado = 'paga') then
    raise exception 'o frete já foi pago: ajuste o envio em vez de desfazer' using errcode = '22023';
  end if;
  update venda.mov_cobranca set estado = 'cancelada' where id = x.cobranca_frete_id and estado = 'aberta';
  delete from venda.rel_expedicao_item_conferido where expedicao_id = x.id;
  delete from venda.rel_expedicao_pedido where expedicao_id = x.id;
  update venda.mov_expedicao set estado = 'cancelada', cancelada_em = now(), motivo_cancelamento = btrim(coalesce(p_motivo, '')), atualizado_em = now() where id = x.id;
end $$;

create or replace function api.expedicao_pendentes(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','expedicao','financeiro','leitura']);
  return coalesce((select jsonb_agg(g order by g ->> 'primeiro_pago') from (
    select jsonb_build_object(
      'parceiro_id', d.destinatario_id, 'parceiro', (select nome from crm.cad_parceiro where id = d.destinatario_id),
      'endereco_id', d.endereco_id, 'endereco', venda._resumo_endereco(d.endereco_id),
      'pedidos', count(*), 'itens', sum(d.itens), 'valor_itens', sum(d.valor_itens), 'primeiro_pago', min(d.criado_em),
      'vip', exists (select 1 from crm.cfg_parceiro_regra g where g.parceiro_id = d.destinatario_id and g.vip),
      'reservas_acumuladas', (select count(*) from live.mov_reserva r join crm.cad_cliente c on c.id = r.cliente_id
                               where c.parceiro_id = d.destinatario_id and r.estado = 'ativa'),
      'expedicao_aberta', (select x.id from venda.mov_expedicao x where x.parceiro_id = d.destinatario_id
                             and x.estado in ('aguardando_conferencia','conferida','frete_cobrado')
                             and x.endereco_id is not distinct from d.endereco_id order by x.criado_em desc limit 1)) g
      from venda.vw_pedido_destino d
     where d.empresa_id = p_empresa and d.estado not in ('cancelado','revisao_manual','expedido','entregue')
       and not exists (select 1 from venda.rel_expedicao_pedido rp where rp.pedido_id = d.pedido_id)
     group by d.destinatario_id, d.endereco_id) s), '[]'::jsonb);
end $$;

create or replace function api.expedicoes(p_empresa uuid, p_estado text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','expedicao','financeiro','leitura']);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', x.id, 'numero', x.numero, 'estado', x.estado, 'parceiro_id', x.parceiro_id, 'parceiro', p.nome,
      'endereco', venda._resumo_endereco(x.endereco_id), 'valor_frete', x.valor_frete, 'frete_gratis', x.frete_gratis,
      'servico', x.servico, 'prazo_dias', x.prazo_dias, 'transportadora', x.transportadora, 'codigo_rastreio', x.codigo_rastreio,
      'frete_link', (select link_url from venda.mov_cobranca where id = x.cobranca_frete_id),
      'criado_em', x.criado_em, 'enviada_em', x.enviada_em,
      'peso_g', x.peso_g, 'comprimento_cm', x.comprimento_cm, 'largura_cm', x.largura_cm, 'altura_cm', x.altura_cm,
      'conferida_em', x.conferida_em,
      'conferidos', (select count(*) from venda.rel_expedicao_item_conferido cf where cf.expedicao_id = x.id),
      'itens_total', (select count(*) from venda.rel_expedicao_pedido rp join venda.mov_pedido_item pi on pi.pedido_id = rp.pedido_id where rp.expedicao_id = x.id),
      'pedidos', (select jsonb_agg(jsonb_build_object('id', pd.id, 'numero', pd.numero_loja, 'valor', pd.valor_itens, 'pago_em', pd.criado_em,
                     'itens', (select jsonb_agg(pi.descricao) from venda.mov_pedido_item pi where pi.pedido_id = pd.id)) order by pd.criado_em)
                    from venda.rel_expedicao_pedido rp join venda.mov_pedido pd on pd.id = rp.pedido_id where rp.expedicao_id = x.id),
      'valor_itens', (select coalesce(sum(pd.valor_itens), 0) from venda.rel_expedicao_pedido rp join venda.mov_pedido pd on pd.id = rp.pedido_id where rp.expedicao_id = x.id),
      'reservas_acumuladas', (select count(*) from live.mov_reserva r join crm.cad_cliente c on c.id = r.cliente_id where c.parceiro_id = x.parceiro_id and r.estado = 'ativa'))
      order by case x.estado when 'aguardando_conferencia' then 1 when 'conferida' then 2 when 'frete_cobrado' then 3 when 'pronta' then 4 else 5 end, x.criado_em desc)
    from venda.mov_expedicao x join crm.cad_parceiro p on p.id = x.parceiro_id
   where x.empresa_id = p_empresa and (case when nullif(p_estado, '') is null then x.estado not in ('entregue','cancelada') and (x.estado <> 'enviada' or x.enviada_em > now() - interval '15 days') else x.estado = p_estado end)
   limit 300), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- permissões
revoke all on function api.expedicao_por_codigo(uuid, text), api.expedicao_conferencia(uuid, uuid),
  api.expedicao_conferir_peca(uuid, uuid, text), api.expedicao_fechar_conferencia(uuid, uuid, int, int, int, int),
  api.expedicao_reabrir_conferencia(uuid, uuid, text), api.expedicao_cfg_obter(uuid),
  api.expedicao_cfg_salvar(uuid, int, int, int, int) from public, anon;
grant execute on function api.expedicao_por_codigo(uuid, text), api.expedicao_conferencia(uuid, uuid),
  api.expedicao_conferir_peca(uuid, uuid, text), api.expedicao_fechar_conferencia(uuid, uuid, int, int, int, int),
  api.expedicao_reabrir_conferencia(uuid, uuid, text), api.expedicao_cfg_obter(uuid),
  api.expedicao_cfg_salvar(uuid, int, int, int, int) to authenticated;
