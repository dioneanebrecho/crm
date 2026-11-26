-- 0094e (pedido 049): o dinheiro do frete nos dois lados, em financeiro.mov_titulo.
--   a receber  = o frete cobrado da cliente (cobrança Getnet tipo 'frete' do pedido 048)
--   a pagar    = o custo da postagem, para a transportadora
-- O vínculo fica em venda.mov_expedicao, e a tela mostra a situação dos dois sem ninguém abrir o financeiro.

alter table financeiro.mov_titulo drop constraint mov_titulo_origem_tipo_check;
alter table financeiro.mov_titulo add constraint mov_titulo_origem_tipo_check
  check (origem_tipo in ('manual','nfe_entrada','nfse_entrada','venda','renegociacao','adiantamento','recorrente',
                         'parcelamento','duplicado','retencao','extrato','implantacao','expedicao'));

alter table venda.cfg_expedicao
  add column natureza_receita_frete_id uuid references financeiro.cad_natureza(id),
  add column natureza_custo_frete_id uuid references financeiro.cad_natureza(id),
  add column cr_receita_frete_id uuid references financeiro.cad_centro_resultado(id),
  add column cr_custo_frete_id uuid references financeiro.cad_centro_resultado(id),
  add column parceiro_transportadora_id uuid references crm.cad_parceiro(id),
  add column conta_frete_id uuid references financeiro.cad_conta_bancaria(id);

-- o plano de contas já tem as duas naturezas certas; o CR da receita é derivado do canal, por isso fica nulo
update venda.cfg_expedicao c set
  natureza_receita_frete_id = (select n.id from financeiro.cad_natureza n where n.empresa_id = c.empresa_id and n.codigo = '1.01.02.001'),
  natureza_custo_frete_id   = (select n.id from financeiro.cad_natureza n where n.empresa_id = c.empresa_id and n.codigo = '4.01.01.001'),
  cr_custo_frete_id         = (select r.id from financeiro.cad_centro_resultado r where r.empresa_id = c.empresa_id and r.codigo = '2.03');

alter table venda.mov_expedicao
  add column custo_frete numeric(12,2) check (custo_frete >= 0),
  add column titulo_receber_id uuid references financeiro.mov_titulo(id),
  add column titulo_pagar_id uuid references financeiro.mov_titulo(id);

-- a natureza de receita de frete exige CR de canal: live vira Lives, o resto vira a vitrine de link
create or replace function venda._cr_receita_frete(p_empresa uuid, p_expedicao uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.cr_receita_frete_id from venda.cfg_expedicao c where c.empresa_id = p_empresa),
    case when exists (select 1 from venda.rel_expedicao_pedido rp join venda.mov_pedido p on p.id = rp.pedido_id
                       where rp.expedicao_id = p_expedicao and p.live_id is not null)
         then (select r.id from financeiro.cad_centro_resultado r where r.empresa_id = p_empresa and r.codigo = '1.01.01.001')
         else (select r.id from financeiro.cad_centro_resultado r where r.empresa_id = p_empresa and r.codigo = '1.01.05') end)
$$;
revoke all on function venda._cr_receita_frete(uuid, uuid) from public, anon, authenticated;

-- cancela um título do frete que ainda não teve baixa (troca de valor, frete grátis, envio desfeito)
create or replace function venda._cancelar_titulo_frete(p_titulo uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare t financeiro.mov_titulo;
begin
  if p_titulo is null then return; end if;
  select * into t from financeiro.mov_titulo where id = p_titulo for update;
  if not found or t.situacao = 'cancelado' then return; end if;
  if t.situacao <> 'aberto' then
    raise exception 'o título #% do frete está % e não pode ser cancelado aqui', t.numero, t.situacao using errcode = '55000';
  end if;
  update financeiro.mov_titulo set situacao = 'cancelado', motivo_cancelamento = btrim(coalesce(p_motivo, 'frete alterado')) where id = t.id;
end $$;
revoke all on function venda._cancelar_titulo_frete(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- a receber: nasce junto com a cobrança do frete
create or replace function api.expedicao_definir_frete(p_empresa uuid, p_expedicao uuid, p_valor numeric, p_servico text default null,
  p_prazo_dias int default null, p_gratis boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x venda.mov_expedicao; c venda.cfg_expedicao; v_cli uuid; v_pag uuid; v_cob uuid; v_tit uuid; v_cr uuid; v_venc date;
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

  -- o que havia antes sai de cena: cobrança aberta e título a receber sem baixa
  if x.cobranca_frete_id is not null then
    update venda.mov_cobranca set estado = 'cancelada' where id = x.cobranca_frete_id and estado = 'aberta';
  end if;
  perform venda._cancelar_titulo_frete(x.titulo_receber_id, 'frete do envio ' || coalesce(x.numero::text, '') || ' alterado');

  if coalesce(p_gratis, false) or coalesce(p_valor, 0) = 0 then
    update venda.mov_expedicao set valor_frete = 0, frete_gratis = true, servico = p_servico, prazo_dias = p_prazo_dias,
           cobranca_frete_id = null, titulo_receber_id = null, estado = 'pronta', atualizado_em = now() where id = x.id;
    return jsonb_build_object('estado', 'pronta');
  end if;

  select p.cliente_id, p.parceiro_pagador_id into v_cli, v_pag from venda.rel_expedicao_pedido rp join venda.mov_pedido p on p.id = rp.pedido_id
   where rp.expedicao_id = x.id order by p.criado_em limit 1;
  insert into venda.mov_cobranca (empresa_id, cliente_id, live_id, valor_itens, frete, desconto, tipo, parceiro_pagador_id, expira_em)
  values (p_empresa, v_cli, null, 0, p_valor, 0, 'frete', coalesce(v_pag, x.parceiro_id), now() + interval '3 days') returning id into v_cob;

  select * into c from venda.cfg_expedicao where empresa_id = p_empresa;
  if c.natureza_receita_frete_id is null then
    raise exception 'configure a natureza de receita de frete em Expedição → Configuração' using errcode = '22023';
  end if;
  v_cr := venda._cr_receita_frete(p_empresa, x.id);
  if v_cr is null then raise exception 'configure o centro de resultado da receita de frete' using errcode = '22023'; end if;
  v_venc := (now() + interval '3 days')::date;
  v_tit := financeiro._novo_titulo(p_empresa,
    jsonb_build_object('tipo', 'R', 'parceiro_id', coalesce(v_pag, x.parceiro_id), 'vencimento', v_venc,
      'valor_original', p_valor, 'origem_tipo', 'expedicao', 'cobranca_id', v_cob,
      'historico', 'Frete do envio ' || coalesce(x.numero::text, '') || coalesce(' · ' || p_servico, '')),
    jsonb_build_array(jsonb_build_object('natureza_id', c.natureza_receita_frete_id, 'cr_id', v_cr, 'percentual', 100)));

  update venda.mov_expedicao set valor_frete = p_valor, frete_gratis = false, servico = p_servico, prazo_dias = p_prazo_dias,
         cobranca_frete_id = v_cob, titulo_receber_id = v_tit, estado = 'frete_cobrado', atualizado_em = now() where id = x.id;
  return jsonb_build_object('estado', 'frete_cobrado', 'cobranca_id', v_cob, 'titulo_id', v_tit);
end $$;

-- frete pago (Getnet ou conferido à mão): solta o envio E baixa o título a receber
create or replace function venda.tg_cobranca_frete_paga() returns trigger language plpgsql security definer set search_path = '' as $$
declare x venda.mov_expedicao; t financeiro.mov_titulo; v_pag uuid;
begin
  if new.tipo = 'frete' and new.estado = 'paga' and old.estado is distinct from 'paga' then
    update venda.mov_expedicao set estado = 'pronta', atualizado_em = now() where cobranca_frete_id = new.id and estado = 'frete_cobrado';
    select * into x from venda.mov_expedicao where cobranca_frete_id = new.id;
    if x.titulo_receber_id is not null then
      select * into t from financeiro.mov_titulo where id = x.titulo_receber_id;
      if found and t.situacao in ('aberto','parcial') and t.saldo > 0 then
        select id into v_pag from venda.mov_pagamento where cobranca_id = new.id and estado = 'confirmado' order by confirmado_em desc limit 1;
        update financeiro.mov_titulo set pagamento_id = coalesce(pagamento_id, v_pag) where id = t.id;
        insert into financeiro.mov_baixa (empresa_id, titulo_id, tipo, data, valor_principal, historico)
        values (t.empresa_id, t.id, 'normal', financeiro._hoje(), t.saldo,
                'Frete do envio ' || coalesce(x.numero::text, '') || ' recebido' || coalesce(' por ' || new.forma_pagamento, ''));
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function venda.tg_cobranca_frete_paga() from public, anon, authenticated;

-- ---------------------------------------------------------------- a pagar: o custo da postagem
create or replace function api.expedicao_registrar_custo(p_empresa uuid, p_expedicao uuid, p_custo numeric,
  p_parceiro uuid default null, p_documento text default null, p_vencimento date default null,
  p_pago boolean default false, p_conta uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x venda.mov_expedicao; c venda.cfg_expedicao; v_parc uuid; v_tit uuid; v_cr uuid; v_venc date;
begin
  perform api._exigir(p_empresa, array['admin','gestor','financeiro']);
  select * into x from venda.mov_expedicao where id = p_expedicao and empresa_id = p_empresa for update;
  if x.id is null then raise exception 'envio não encontrado' using errcode = 'P0002'; end if;
  if x.estado = 'cancelada' then raise exception 'envio desfeito não tem custo de frete' using errcode = '22023'; end if;
  if coalesce(p_custo, 0) <= 0 then raise exception 'informe o custo da postagem' using errcode = '22023'; end if;
  select * into c from venda.cfg_expedicao where empresa_id = p_empresa;
  if c.natureza_custo_frete_id is null then
    raise exception 'configure a natureza de custo de frete em Expedição → Configuração' using errcode = '22023';
  end if;
  v_cr := coalesce(c.cr_custo_frete_id, (select r.id from financeiro.cad_centro_resultado r where r.empresa_id = p_empresa and r.codigo = '2.03'));
  if v_cr is null then raise exception 'configure o centro de resultado do custo de frete' using errcode = '22023'; end if;
  v_parc := coalesce(p_parceiro, c.parceiro_transportadora_id);
  if v_parc is null then raise exception 'informe a transportadora (ou cadastre a padrão na configuração)' using errcode = '22023'; end if;

  perform venda._cancelar_titulo_frete(x.titulo_pagar_id, 'custo do frete do envio ' || coalesce(x.numero::text, '') || ' corrigido');

  v_venc := coalesce(p_vencimento, financeiro._hoje());
  v_tit := financeiro._novo_titulo(p_empresa,
    jsonb_build_object('tipo', 'D', 'parceiro_id', v_parc, 'vencimento', v_venc, 'valor_original', p_custo,
      'origem_tipo', 'expedicao', 'documento', nullif(btrim(coalesce(p_documento, '')), ''),
      'historico', 'Postagem do envio ' || coalesce(x.numero::text, '') || coalesce(' · ' || x.servico, '')
                   || coalesce(' · ' || x.codigo_rastreio, '')),
    jsonb_build_array(jsonb_build_object('natureza_id', c.natureza_custo_frete_id, 'cr_id', v_cr, 'percentual', 100)));

  if coalesce(p_pago, false) then
    insert into financeiro.mov_baixa (empresa_id, titulo_id, tipo, data, valor_principal, conta_id, historico)
    values (p_empresa, v_tit, 'normal', financeiro._hoje(), p_custo, coalesce(p_conta, c.conta_frete_id),
            'Postagem do envio ' || coalesce(x.numero::text, '') || ' paga');
  end if;

  update venda.mov_expedicao set custo_frete = p_custo, titulo_pagar_id = v_tit, atualizado_em = now() where id = x.id;
  return jsonb_build_object('titulo_id', v_tit, 'pago', coalesce(p_pago, false));
end $$;

-- desfazer o envio também desfaz os títulos que ainda não tiveram baixa
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
  perform venda._cancelar_titulo_frete(x.titulo_receber_id, 'envio desfeito: ' || btrim(coalesce(p_motivo, '')));
  perform venda._cancelar_titulo_frete(x.titulo_pagar_id, 'envio desfeito: ' || btrim(coalesce(p_motivo, '')));
  delete from venda.rel_expedicao_item_conferido where expedicao_id = x.id;
  delete from venda.rel_expedicao_pedido where expedicao_id = x.id;
  update venda.mov_expedicao set estado = 'cancelada', cancelada_em = now(), motivo_cancelamento = btrim(coalesce(p_motivo, '')),
         titulo_receber_id = null, titulo_pagar_id = null, atualizado_em = now() where id = x.id;
end $$;

-- ---------------------------------------------------------------- a lista, agora com o financeiro junto
create or replace function venda._titulo_frete(p_titulo uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', t.id, 'numero', t.numero, 'situacao', t.situacao,
                            'valor', t.valor_liquido, 'saldo', t.saldo, 'vencimento', t.vencimento)
    from financeiro.mov_titulo t where t.id = p_titulo
$$;
revoke all on function venda._titulo_frete(uuid) from public, anon, authenticated;

create or replace function api.expedicoes(p_empresa uuid, p_estado text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','expedicao','financeiro','leitura']);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', x.id, 'numero', x.numero, 'estado', x.estado, 'parceiro_id', x.parceiro_id, 'parceiro', p.nome,
      'endereco', venda._resumo_endereco(x.endereco_id), 'valor_frete', x.valor_frete, 'frete_gratis', x.frete_gratis,
      'servico', x.servico, 'prazo_dias', x.prazo_dias, 'transportadora', x.transportadora, 'codigo_rastreio', x.codigo_rastreio,
      'url_rastreio', (select url_rastreio from venda.mov_envio e where e.expedicao_id = x.id limit 1),
      'frete_link', (select link_url from venda.mov_cobranca where id = x.cobranca_frete_id),
      'criado_em', x.criado_em, 'enviada_em', x.enviada_em, 'entregue_em', x.entregue_em,
      'peso_g', x.peso_g, 'comprimento_cm', x.comprimento_cm, 'largura_cm', x.largura_cm, 'altura_cm', x.altura_cm,
      'conferida_em', x.conferida_em,
      'conferidos', (select count(*) from venda.rel_expedicao_item_conferido cf where cf.expedicao_id = x.id),
      'itens_total', (select count(*) from venda.rel_expedicao_pedido rp join venda.mov_pedido_item pi on pi.pedido_id = rp.pedido_id where rp.expedicao_id = x.id),
      'custo_frete', x.custo_frete,
      'resultado_frete', case when x.custo_frete is null then null else coalesce(x.valor_frete, 0) - x.custo_frete end,
      'titulo_receber', venda._titulo_frete(x.titulo_receber_id),
      'titulo_pagar', venda._titulo_frete(x.titulo_pagar_id),
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

create or replace function api.expedicao_cfg_obter(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c venda.cfg_expedicao;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','expedicao','financeiro','leitura']);
  select * into c from venda.cfg_expedicao where empresa_id = p_empresa;
  return jsonb_build_object('peso_padrao_peca_g', coalesce(c.peso_padrao_peca_g, 350),
    'comprimento_padrao_cm', coalesce(c.comprimento_padrao_cm, 30),
    'largura_padrao_cm', coalesce(c.largura_padrao_cm, 20),
    'altura_padrao_cm', coalesce(c.altura_padrao_cm, 10),
    'url_rastreio_modelo', c.url_rastreio_modelo,
    'natureza_receita_frete_id', c.natureza_receita_frete_id,
    'natureza_receita_frete', (select n.caminho_nome from financeiro.cad_natureza n where n.id = c.natureza_receita_frete_id),
    'natureza_custo_frete_id', c.natureza_custo_frete_id,
    'natureza_custo_frete', (select n.caminho_nome from financeiro.cad_natureza n where n.id = c.natureza_custo_frete_id),
    'cr_receita_frete_id', c.cr_receita_frete_id,
    'cr_custo_frete_id', c.cr_custo_frete_id,
    'parceiro_transportadora_id', c.parceiro_transportadora_id,
    'parceiro_transportadora', (select p.nome from crm.cad_parceiro p where p.id = c.parceiro_transportadora_id),
    'conta_frete_id', c.conta_frete_id);
end $$;

drop function if exists api.expedicao_cfg_salvar(uuid, int, int, int, int);

create or replace function api.expedicao_cfg_salvar(p_empresa uuid, p_dados jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin','gestor']);
  insert into venda.cfg_expedicao (empresa_id) values (p_empresa) on conflict do nothing;
  update venda.cfg_expedicao set
    peso_padrao_peca_g = coalesce(nullif(p_dados ->> 'peso_padrao_peca_g', '')::int, peso_padrao_peca_g),
    comprimento_padrao_cm = coalesce(nullif(p_dados ->> 'comprimento_padrao_cm', '')::int, comprimento_padrao_cm),
    largura_padrao_cm = coalesce(nullif(p_dados ->> 'largura_padrao_cm', '')::int, largura_padrao_cm),
    altura_padrao_cm = coalesce(nullif(p_dados ->> 'altura_padrao_cm', '')::int, altura_padrao_cm),
    url_rastreio_modelo = case when p_dados ? 'url_rastreio_modelo' then nullif(btrim(p_dados ->> 'url_rastreio_modelo'), '') else url_rastreio_modelo end,
    natureza_receita_frete_id = case when p_dados ? 'natureza_receita_frete_id' then nullif(p_dados ->> 'natureza_receita_frete_id', '')::uuid else natureza_receita_frete_id end,
    natureza_custo_frete_id = case when p_dados ? 'natureza_custo_frete_id' then nullif(p_dados ->> 'natureza_custo_frete_id', '')::uuid else natureza_custo_frete_id end,
    cr_receita_frete_id = case when p_dados ? 'cr_receita_frete_id' then nullif(p_dados ->> 'cr_receita_frete_id', '')::uuid else cr_receita_frete_id end,
    cr_custo_frete_id = case when p_dados ? 'cr_custo_frete_id' then nullif(p_dados ->> 'cr_custo_frete_id', '')::uuid else cr_custo_frete_id end,
    parceiro_transportadora_id = case when p_dados ? 'parceiro_transportadora_id' then nullif(p_dados ->> 'parceiro_transportadora_id', '')::uuid else parceiro_transportadora_id end,
    conta_frete_id = case when p_dados ? 'conta_frete_id' then nullif(p_dados ->> 'conta_frete_id', '')::uuid else conta_frete_id end,
    atualizado_em = now(), atualizado_por = auth.uid()
   where empresa_id = p_empresa;
end $$;

revoke all on function api.expedicao_registrar_custo(uuid, uuid, numeric, uuid, text, date, boolean, uuid),
  api.expedicao_cfg_salvar(uuid, jsonb) from public, anon;
grant execute on function api.expedicao_registrar_custo(uuid, uuid, numeric, uuid, text, date, boolean, uuid),
  api.expedicao_cfg_salvar(uuid, jsonb) to authenticated;
