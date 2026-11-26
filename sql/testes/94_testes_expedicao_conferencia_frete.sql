-- Testes das 0094a / 0094d / 0094e (pedido 049): conferência por código de barras, rastreio unificado
-- (mov_envio e as variáveis {{envio.*}}) e o financeiro do frete nos dois lados (a receber e a pagar).
-- Tudo dentro de um DO que termina em exceção: o banco desfaz o que o teste criou. Esperado: "TESTES_OK (rollback forçado)".
do $t$
declare
  v_emp uuid := (select empresa_id from crm.vw_papel_efetivo where papel = 'admin' limit 1);
  v_adm uuid := (select usuario_id from crm.vw_papel_efetivo where papel = 'admin' limit 1);
  v_var uuid; v_loc uuid; v_live uuid; v_ev bigint;
  v_cliA uuid; v_parA uuid; v_cliB uuid; v_parB uuid; v_cliC uuid; v_parC uuid;
  v_endA uuid; v_endB uuid; v_endC uuid; v_transp uuid;
  v_pedA uuid; v_pedB uuid; v_pedC1 uuid; v_pedC2 uuid;
  v_expA uuid; v_expB uuid; v_expC uuid; v_conv uuid; v_tit uuid; v_tit2 uuid;
  v_cobA uuid; v_cobB uuid; v_cobC1 uuid; v_cobC2 uuid;
  c1 text := 'T0094-1'; c2 text := 'T0094-2'; c3 text := 'T0094-3'; c4 text := 'T0094-4'; c5 text := 'T0094-5';
  r jsonb; v jsonb; e jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_adm::text, true);

  select id into v_var from catalogo.cad_variacao where empresa_id = v_emp limit 1;
  select id into v_loc from catalogo.cad_local where empresa_id = v_emp limit 1;
  assert v_var is not null, 'sem variação para o teste';

  -- peças próprias do teste, para não depender do estoque do dia
  insert into catalogo.cad_unidade (empresa_id, variacao_id, codigo, local_id, estado)
  select v_emp, v_var, x, v_loc, 'disponivel' from unnest(array[c1, c2, c3, c4, c5]) x;

  insert into crm.cad_cliente (empresa_id, nome, instagram_username, telefone) values (v_emp, 'Ana Conferencia Teste', 'teste_conf_0094a', '+5534991110941')
    returning id, parceiro_id into v_cliA, v_parA;
  insert into crm.cad_cliente (empresa_id, nome, instagram_username, telefone) values (v_emp, 'Bruna Outra Teste', 'teste_conf_0094b', '+5534991110942')
    returning id, parceiro_id into v_cliB, v_parB;
  insert into crm.cad_cliente (empresa_id, nome, instagram_username, telefone) values (v_emp, 'Carla Segunda Teste', 'teste_conf_0094c', '+5534991110943')
    returning id, parceiro_id into v_cliC, v_parC;
  insert into crm.cad_parceiro (empresa_id, nome) values (v_emp, 'Transportadora Teste 0094') returning id into v_transp;
  insert into crm.cad_parceiro_endereco (empresa_id, parceiro_id, cep, logradouro, numero, bairro, municipio, uf, principal)
    values (v_emp, v_parA, '38400100', 'Avenida Afonso Pena', '1000', 'Centro', 'Uberlândia', 'MG', true) returning id into v_endA;
  insert into crm.cad_parceiro_endereco (empresa_id, parceiro_id, cep, logradouro, numero, municipio, uf, principal)
    values (v_emp, v_parB, '38400200', 'Rua Teste B', '50', 'Uberlândia', 'MG', true) returning id into v_endB;
  insert into crm.cad_parceiro_endereco (empresa_id, parceiro_id, cep, logradouro, numero, municipio, uf, principal)
    values (v_emp, v_parC, '38400300', 'Rua Teste C', '70', 'Uberlândia', 'MG', true) returning id into v_endC;

  -- uma live por peça: live.mov_item é único por (live_id, variacao_id)
  insert into live.mov_live (empresa_id, titulo) select v_emp, 'Live teste 0094 ' || x from unnest(array[c1, c2, c3, c4, c5]) x;
  select id into v_live from live.mov_live where empresa_id = v_emp and titulo = 'Live teste 0094 ' || c1;
  insert into engine.log_evento_bruto (fonte, origem, tipo, id_externo, payload, assinatura_valida)
    values ('manual', coalesce(engine.origem_padrao(), 'piloto'), 'teste', 'teste-0094-ev', '{}', true) returning id into v_ev;

  insert into venda.mov_cobranca (empresa_id, cliente_id, live_id, valor_itens, frete, desconto, estado)
    values (v_emp, v_cliA, v_live, 200, 0, 0, 'paga') returning id into v_cobA;
  insert into venda.mov_cobranca (empresa_id, cliente_id, live_id, valor_itens, frete, desconto, estado)
    values (v_emp, v_cliB, v_live, 90, 0, 0, 'paga') returning id into v_cobB;
  insert into venda.mov_cobranca (empresa_id, cliente_id, live_id, valor_itens, frete, desconto, estado)
    values (v_emp, v_cliC, v_live, 60, 0, 0, 'paga') returning id into v_cobC1;
  insert into venda.mov_pedido (empresa_id, cobranca_id, cliente_id, live_id, valor_itens, frete, desconto, estado)
    values (v_emp, v_cobA, v_cliA, v_live, 200, 0, 0, 'pago') returning id into v_pedA;
  insert into venda.mov_pedido (empresa_id, cobranca_id, cliente_id, live_id, valor_itens, frete, desconto, estado)
    values (v_emp, v_cobB, v_cliB, v_live, 90, 0, 0, 'pago') returning id into v_pedB;
  insert into venda.mov_pedido (empresa_id, cobranca_id, cliente_id, live_id, valor_itens, frete, desconto, estado)
    values (v_emp, v_cobC1, v_cliC, v_live, 60, 0, 0, 'pago') returning id into v_pedC1;

  -- item de live + interesse + reserva paga para cada peça (o endereço da entrega vem da reserva)
  insert into live.mov_item (empresa_id, live_id, variacao_id, codigo_live, preco)
  select v_emp, l.id, v_var, 'L' || right(l.titulo, 7), 100
    from live.mov_live l where l.empresa_id = v_emp and l.titulo like 'Live teste 0094 %';
  insert into live.mov_interesse (empresa_id, live_id, item_id, cliente_id, evento_id, comentario_id_externo, texto, comentado_em, recebido_em, canal)
  select v_emp, i.live_id, i.id,
         case i.codigo_live when 'L' || c3 then v_cliB when 'L' || c4 then v_cliC when 'L' || c5 then v_cliC else v_cliA end,
         v_ev, 'c-0094-' || i.codigo_live, 'quero ' || i.codigo_live, now(), now(), 'live'
    from live.mov_item i where i.codigo_live like 'LT0094-%';
  insert into live.mov_reserva (empresa_id, item_id, cliente_id, unidade_id, interesse_id, estado, endereco_entrega_id, pagador_definido_em)
  select v_emp, i.id, n.cliente_id, u.id, n.id, 'paga',
         case n.cliente_id when v_cliB then v_endB when v_cliC then v_endC else v_endA end, now()
    from live.mov_item i
    join live.mov_interesse n on n.item_id = i.id
    join catalogo.cad_unidade u on u.empresa_id = v_emp and u.codigo = right(i.codigo_live, length(i.codigo_live) - 1)
   where i.codigo_live like 'LT0094-%';
  -- as peças 1 e 2 vão no pedido da Ana, a 3 no da Bruna, a 4 no primeiro pedido da Carla (a 5 entra depois)
  insert into venda.mov_pedido_item (empresa_id, pedido_id, reserva_id, unidade_id, variacao_id, descricao, valor_unitario)
  select v_emp, case u.codigo when c3 then v_pedB when c4 then v_pedC1 else v_pedA end, rs.id, rs.unidade_id, v_var,
         'Peça ' || u.codigo, 100
    from live.mov_reserva rs join catalogo.cad_unidade u on u.id = rs.unidade_id
   where u.codigo in (c1, c2, c3, c4);

  -- ============================================================ conferência (0094a)
  v_expA := api.expedicao_montar(v_emp, v_parA, v_endA);
  v_expB := api.expedicao_montar(v_emp, v_parB, v_endB);
  assert (select estado from venda.mov_expedicao where id = v_expA) = 'aguardando_conferencia', 'nasce em conferência';

  r := api.expedicao_por_codigo(v_emp, c1);
  assert (r ->> 'expedicao_id')::uuid = v_expA, 'localizou o envio pela peça: ' || r::text;
  r := api.expedicao_por_codigo(v_emp, lower(c2));
  assert (r ->> 'expedicao_id')::uuid = v_expA, 'código em minúscula também localiza';
  begin perform api.expedicao_por_codigo(v_emp, 'NAO-EXISTE-0094'); assert false, 'achou peça inexistente';
  exception when sqlstate 'P0002' then null; end;

  begin perform api.expedicao_definir_frete(v_emp, v_expA, 24.90, 'PAC', 7, false); assert false, 'cobrou frete sem conferir';
  exception when sqlstate '22023' then null; end;

  begin perform api.expedicao_conferir_peca(v_emp, v_expA, c3); assert false, 'aceitou peça de outro envio';
  exception when sqlstate '22023' then null; end;

  r := api.expedicao_conferir_peca(v_emp, v_expA, c1);
  assert (r ->> 'conferidos')::int = 1 and (r ->> 'total')::int = 2, 'primeira bipada: ' || r::text;
  begin perform api.expedicao_conferir_peca(v_emp, v_expA, c1); assert false, 'bipou a mesma peça duas vezes';
  exception when sqlstate '22023' then null; end;
  begin perform api.expedicao_fechar_conferencia(v_emp, v_expA, 800); assert false, 'fechou com peça faltando';
  exception when sqlstate '22023' then null; end;

  r := api.expedicao_conferir_peca(v_emp, v_expA, c2);
  assert (r ->> 'conferidos')::int = 2, 'segunda bipada';
  begin perform api.expedicao_fechar_conferencia(v_emp, v_expA, 0); assert false, 'aceitou peso zero';
  exception when sqlstate '22023' then null; end;
  r := api.expedicao_fechar_conferencia(v_emp, v_expA, 800, 32, 22, 12);
  assert r ->> 'estado' = 'conferida', 'conferência fechada';
  assert (select peso_g = 800 and comprimento_cm = 32 and conferida_em is not null from venda.mov_expedicao where id = v_expA), 'peso e medidas gravados';

  r := api.expedicao_conferencia(v_emp, v_expA);
  assert (r ->> 'conferidos')::int = 2 and (r ->> 'medidas_confirmadas')::boolean, 'resumo da conferência: ' || r::text;

  perform api.expedicao_reabrir_conferencia(v_emp, v_expA, 'caixa reaberta no teste');
  assert (select estado from venda.mov_expedicao where id = v_expA) = 'aguardando_conferencia', 'reaberta';
  assert not exists (select 1 from venda.rel_expedicao_item_conferido where expedicao_id = v_expA), 'bipagens apagadas';
  perform api.expedicao_conferir_peca(v_emp, v_expA, u.codigo)
    from venda.rel_expedicao_pedido rp join venda.mov_pedido_item pi on pi.pedido_id = rp.pedido_id
    join catalogo.cad_unidade u on u.id = pi.unidade_id where rp.expedicao_id = v_expA;
  perform api.expedicao_fechar_conferencia(v_emp, v_expA, 800);

  -- peça nova entrando num envio já conferido devolve o envio para a bancada (a caixa muda de peso)
  v_expC := api.expedicao_montar(v_emp, v_parC, v_endC);
  perform api.expedicao_conferir_peca(v_emp, v_expC, c4);
  perform api.expedicao_fechar_conferencia(v_emp, v_expC, 400);
  assert (select estado from venda.mov_expedicao where id = v_expC) = 'conferida', 'Carla conferida';
  insert into venda.mov_cobranca (empresa_id, cliente_id, live_id, valor_itens, frete, desconto, estado)
    values (v_emp, v_cliC, v_live, 100, 0, 0, 'paga') returning id into v_cobC2;
  insert into venda.mov_pedido (empresa_id, cobranca_id, cliente_id, live_id, valor_itens, frete, desconto, estado)
    values (v_emp, v_cobC2, v_cliC, v_live, 100, 0, 0, 'pago') returning id into v_pedC2;
  insert into venda.mov_pedido_item (empresa_id, pedido_id, reserva_id, unidade_id, variacao_id, descricao, valor_unitario)
  select v_emp, v_pedC2, rs.id, rs.unidade_id, v_var, 'Peça ' || c5, 100
    from live.mov_reserva rs join catalogo.cad_unidade u on u.id = rs.unidade_id where u.codigo = c5;
  assert api.expedicao_montar(v_emp, v_parC, v_endC) = v_expC, 'juntou no mesmo envio';
  assert (select estado = 'aguardando_conferencia' and peso_g is null from venda.mov_expedicao where id = v_expC), 'voltou para a conferência';
  assert (select count(*) from venda.rel_expedicao_item_conferido where expedicao_id = v_expC) = 1, 'a peça já bipada continua bipada';
  r := api.expedicao_conferencia(v_emp, v_expC);
  assert (r ->> 'total')::int = 2 and (r ->> 'conferidos')::int = 1, 'falta bipar a peça nova: ' || r::text;

  -- ============================================================ financeiro: a receber (0094e)
  r := api.expedicao_definir_frete(v_emp, v_expA, 24.90, 'PAC', 7, false);
  assert r ->> 'estado' = 'frete_cobrado', 'frete cobrado';
  v_tit := (r ->> 'titulo_id')::uuid;
  assert (select tipo = 'R' and situacao = 'aberto' and valor_original = 24.90 and origem_tipo = 'expedicao'
            from financeiro.mov_titulo where id = v_tit), 'título a receber do frete';
  assert (select n.codigo from financeiro.rel_titulo_rateio rt join financeiro.cad_natureza n on n.id = rt.natureza_id
           where rt.titulo_id = v_tit) = '1.01.02.001', 'natureza de receita de frete';
  assert (select c.aceita_receita from financeiro.rel_titulo_rateio rt join financeiro.cad_centro_resultado c on c.id = rt.cr_id
           where rt.titulo_id = v_tit), 'CR de canal (a natureza exige)';

  r := api.expedicao_definir_frete(v_emp, v_expA, 19.90, 'PAC', 7, false);
  v_tit2 := (r ->> 'titulo_id')::uuid;
  assert v_tit2 <> v_tit, 'título novo';
  assert (select situacao from financeiro.mov_titulo where id = v_tit) = 'cancelado', 'título antigo cancelado';
  assert (select valor_original from financeiro.mov_titulo where id = v_tit2) = 19.90, 'novo valor';

  assert api.expedicao_frete_pago(v_emp, v_expA, 'pix', 'Pix do frete conferido no teste') = 'ok', 'frete pago';
  assert (select estado from venda.mov_expedicao where id = v_expA) = 'pronta', 'pronta após o frete';
  assert (select situacao = 'baixado' and saldo = 0 from financeiro.mov_titulo where id = v_tit2), 'título a receber baixado';
  assert exists (select 1 from financeiro.mov_baixa where titulo_id = v_tit2 and not estornada), 'baixa registrada';
  assert (select pagamento_id is not null from financeiro.mov_titulo where id = v_tit2), 'baixa ligada ao pagamento';

  -- ============================================================ financeiro: a pagar (0094e)
  begin perform api.expedicao_registrar_custo(v_emp, v_expA, 15.50); assert false, 'aceitou custo sem transportadora';
  exception when sqlstate '22023' then null; end;
  r := api.expedicao_registrar_custo(v_emp, v_expA, 15.50, v_transp, 'PI-0094', null, true);
  assert (r ->> 'pago')::boolean, 'custo pago';
  assert (select tipo = 'D' and situacao = 'baixado' and parceiro_id = v_transp
            from financeiro.mov_titulo where id = (r ->> 'titulo_id')::uuid), 'título a pagar baixado';
  assert (select n.codigo from financeiro.rel_titulo_rateio rt join financeiro.cad_natureza n on n.id = rt.natureza_id
           where rt.titulo_id = (r ->> 'titulo_id')::uuid) = '4.01.01.001', 'natureza de custo de frete';

  select x into e from jsonb_array_elements(api.expedicoes(v_emp, null)) x where (x ->> 'id')::uuid = v_expA;
  assert (e ->> 'resultado_frete')::numeric = 4.40, 'resultado do frete (19,90 - 15,50): ' || coalesce(e ->> 'resultado_frete', 'null');
  assert e -> 'titulo_receber' ->> 'situacao' = 'baixado' and e -> 'titulo_pagar' ->> 'situacao' = 'baixado', 'situação dos dois títulos na lista';
  assert (e ->> 'conferidos')::int = 2 and (e ->> 'itens_total')::int = 2, 'conferência na lista';

  -- ============================================================ rastreio unificado (0094d)
  perform api.expedicao_enviar(v_emp, v_expA, 'aa123456789br', 'Correios');
  assert (select estado from venda.mov_expedicao where id = v_expA) = 'enviada', 'enviada';
  assert (select count(*) from venda.mov_envio where expedicao_id = v_expA) = 1, 'uma linha de envio por pedido';
  assert (select codigo_rastreio = 'AA123456789BR' and estado = 'postado'
            and url_rastreio like 'https://rastreamento.correios.com.br/%AA123456789BR'
            from venda.mov_envio where expedicao_id = v_expA), 'mov_envio preenchido com link dos Correios';
  assert exists (select 1 from venda.mov_evento_rastreio ev join venda.mov_envio en on en.id = ev.envio_id
                  where en.expedicao_id = v_expA and ev.estado = 'postado'), 'evento de postagem';

  -- é isto que consertava o /rastreio: as variáveis do atendimento agora preenchem
  insert into atendimento.mov_conversa (empresa_id, cliente_id, canal, estado, janela_ate)
    values (v_emp, v_cliA, 'instagram', 'aberta', now() + interval '20 hours') returning id into v_conv;
  v := atendimento.variaveis_contexto(v_conv, v_adm);
  assert v ->> 'envio.codigo_rastreio' = 'AA123456789BR', 'variável do código: ' || coalesce(v ->> 'envio.codigo_rastreio', 'vazia');
  assert v ->> 'envio.transportadora' = 'Correios', 'variável da transportadora';
  assert v ->> 'envio.link_rastreio' like 'https://rastreamento.correios.com.br/%', 'variável do link';
  assert v ->> 'envio.situacao' = 'Postado', 'variável da situação';
  r := atendimento.renderizar('Pedido {{pedido.numero}} enviado pela {{envio.transportadora}}. Código: {{envio.codigo_rastreio}}. Acompanhe: {{envio.link_rastreio}}', v);
  assert jsonb_array_length(r -> 'faltantes') = 0, 'resposta de rastreio sem variável faltando: ' || (r -> 'faltantes')::text;

  r := api.expedicao_rastreio(v_emp, v_expA);
  assert jsonb_array_length(r -> 'eventos') >= 1 and r ->> 'codigo_rastreio' = 'AA123456789BR', 'eventos de rastreio: ' || r::text;

  begin perform api.expedicao_conferir_peca(v_emp, v_expA, c1); assert false, 'bipou peça de envio já despachado';
  exception when sqlstate '22023' then null; end;

  perform api.expedicao_entregue(v_emp, v_expA);
  assert (select estado from venda.mov_expedicao where id = v_expA) = 'entregue', 'entregue';
  assert (select estado from venda.mov_envio where expedicao_id = v_expA) = 'entregue', 'envio entregue';
  assert not exists (select 1 from venda.mov_pedido where id = v_pedA and estado <> 'entregue'), 'pedido entregue';

  -- ============================================================ frete grátis e desfazer
  -- envio B: frete cobrado e depois desfeito — o título a receber é cancelado junto
  perform api.expedicao_conferir_peca(v_emp, v_expB, c3);
  perform api.expedicao_fechar_conferencia(v_emp, v_expB, 400);
  r := api.expedicao_definir_frete(v_emp, v_expB, 12.00, 'PAC', 5, false);
  v_tit := (r ->> 'titulo_id')::uuid;
  assert (select situacao from financeiro.mov_titulo where id = v_tit) = 'aberto', 'título do frete aberto';
  perform api.expedicao_cancelar(v_emp, v_expB, 'teste de desfazer');
  assert (select estado from venda.mov_expedicao where id = v_expB) = 'cancelada', 'envio desfeito';
  assert (select situacao from financeiro.mov_titulo where id = v_tit) = 'cancelado', 'título a receber cancelado junto';
  assert not exists (select 1 from venda.rel_expedicao_item_conferido where expedicao_id = v_expB), 'bipagens apagadas ao desfazer';

  -- envio C: frete grátis fica pronto na hora e não gera título
  perform api.expedicao_conferir_peca(v_emp, v_expC, c5);
  perform api.expedicao_fechar_conferencia(v_emp, v_expC, 600);
  r := api.expedicao_definir_frete(v_emp, v_expC, 0, 'retirada', null, true);
  assert r ->> 'estado' = 'pronta', 'frete grátis deixa pronta';
  assert (select titulo_receber_id is null from venda.mov_expedicao where id = v_expC), 'frete grátis não gera título a receber';
  begin perform api.expedicao_definir_frete(v_emp, v_expC, 12.00, 'PAC', 5, false); assert false, 'mudou o frete de um envio pronto';
  exception when sqlstate '22023' then null; end;

  -- ============================================================ permissões
  assert not has_function_privilege('anon', 'api.expedicao_conferir_peca(uuid,uuid,text)', 'execute'), 'anon bipando';
  assert not has_function_privilege('anon', 'api.expedicao_registrar_custo(uuid,uuid,numeric,uuid,text,date,boolean,uuid)', 'execute'), 'anon lançando custo';
  assert not has_function_privilege('authenticated', 'venda._unidade_do_codigo(uuid,text)', 'execute'), 'helper exposto';
  assert not has_function_privilege('authenticated', 'venda._cancelar_titulo_frete(uuid,text)', 'execute'), 'helper de título exposto';

  raise exception 'TESTES_OK (rollback forçado)';
end $t$;
