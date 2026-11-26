-- 0094b_fin_regras.sql
-- Pedido de mudança 049, parte B: regras de integridade (gatilhos), recálculo de saldo e situação,
-- período fechado e geração automática dos títulos a pagar na confirmação da NF-e de entrada.
-- APLICADA em 26/11/2026.

alter table financeiro.rel_titulo_rateio
  add column componente text not null default 'principal' check (componente in ('principal','juros'));
comment on column financeiro.rel_titulo_rateio.componente is
  'principal = valor do título; juros = acréscimo de renegociação (no DRE, só esta parte é resultado novo do título renegociado).';
comment on column financeiro.cad_conta_bancaria.saldo_inicial is 'Saldo no início do dia data_saldo_inicial (antes dos movimentos e linhas de extrato desse dia).';
comment on column financeiro.mov_conta_movimento.data is 'Data da baixa: compõe o saldo do sistema.';
comment on column financeiro.mov_conta_movimento.data_conciliacao is 'Data em que o banco compensou (data da linha do extrato): compõe o saldo conciliado.';
comment on column financeiro.mov_conta_movimento.conciliado_em is 'Quando a conciliação foi feita (auditoria, não afeta saldo).';

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------
create function financeiro._proximo(p_empresa uuid, p_chave text) returns bigint
language sql security definer set search_path = '' as $$
  insert into financeiro.cfg_sequencia as s (empresa_id, chave, ultimo) values (p_empresa, p_chave, 1)
  on conflict (empresa_id, chave) do update set ultimo = s.ultimo + 1
  returning ultimo
$$;

create function financeiro._sistema() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('fin.sistema', true), '') = 'on'
$$;

create function financeiro._hoje() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create function financeiro._checar_periodo(p_empresa uuid, p_data date, p_o_que text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare f date;
begin
  select data_fechamento into f from financeiro.cfg_financeiro where empresa_id = p_empresa;
  if f is not null and p_data <= f then
    raise exception '% em %: período fechado até %', p_o_que, to_char(p_data, 'DD/MM/YYYY'), to_char(f, 'DD/MM/YYYY') using errcode = '55000';
  end if;
end $$;

create function financeiro._venc(p_ini date, p_i int, p_per text, p_dias int) returns date
language sql immutable set search_path = '' as $$
  select case coalesce(p_per, 'mensal')
    when 'mensal' then (p_ini + make_interval(months => p_i))::date
    when 'quinzenal' then p_ini + 15 * p_i
    when 'semanal' then p_ini + 7 * p_i
    else p_ini + coalesce(p_dias, 30) * p_i end
$$;

-- Divide o total em n parcelas (ajuste de centavos na última) ou usa os valores informados
create function financeiro._dividir(p_total numeric, p_n int, p_valores jsonb) returns numeric[]
language plpgsql immutable set search_path = '' as $$
declare v numeric[]; b numeric; i int;
begin
  if jsonb_typeof(p_valores) = 'array' and jsonb_array_length(p_valores) > 0 then
    select array_agg(round(x::numeric, 2) order by o) into v from jsonb_array_elements_text(p_valores) with ordinality a(x, o);
    if array_length(v, 1) <> p_n then raise exception 'informe % valores de parcela (recebidos %)', p_n, array_length(v, 1) using errcode = '22023'; end if;
    if (select sum(x) from unnest(v) x) <> round(p_total, 2) then raise exception 'as parcelas somam R$ % e o total é R$ %', (select sum(x) from unnest(v) x), round(p_total, 2) using errcode = '22023'; end if;
    if exists (select 1 from unnest(v) x where x <= 0) then raise exception 'toda parcela precisa ser maior que zero' using errcode = '22023'; end if;
    return v;
  end if;
  b := floor(round(p_total, 2) / p_n * 100) / 100;
  if b <= 0 then raise exception 'valor pequeno demais para % parcelas', p_n using errcode = '22023'; end if;
  v := array_fill(b, array[p_n]);
  v[p_n] := round(p_total, 2) - b * (p_n - 1);
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Título
-- ---------------------------------------------------------------------------
create function financeiro._titulo_antes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_pago numeric; v_tt financeiro.cad_tipo_titulo;
begin
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    if new.numero is null then new.numero := financeiro._proximo(new.empresa_id, 'titulo'); end if;
    new.vencimento_original := coalesce(new.vencimento_original, new.vencimento);
    new.competencia := coalesce(new.competencia, new.emissao);
    new.saldo := new.valor_original - new.ret_iss - new.ret_irrf - new.ret_inss - new.ret_pcc;
    new.situacao := 'aberto';
    perform financeiro._checar_periodo(new.empresa_id, new.competencia, 'Título com competência');
  else
    if new.empresa_id <> old.empresa_id or new.numero <> old.numero or new.origem_tipo <> old.origem_tipo then
      raise exception 'empresa, número e origem do título não mudam' using errcode = '23514';
    end if;
    if old.situacao = 'cancelado' and not financeiro._sistema() then
      raise exception 'título #% está cancelado e não pode ser alterado', old.numero using errcode = '55000';
    end if;
    if (new.tipo, new.parceiro_id, new.valor_original, new.ret_iss, new.ret_irrf, new.ret_inss, new.ret_pcc)
       is distinct from (old.tipo, old.parceiro_id, old.valor_original, old.ret_iss, old.ret_irrf, old.ret_inss, old.ret_pcc) then
      if not financeiro._sistema() then
        if old.origem_tipo = 'nfe_entrada' then
          raise exception 'título #% vem da NF-e: valor, parceiro e tipo mudam pela entrada de mercadoria', old.numero using errcode = '55000';
        end if;
        if exists (select 1 from financeiro.mov_baixa b where b.titulo_id = old.id and not b.estornada) then
          raise exception 'título #% tem baixa: estorne antes de mudar valor, parceiro ou tipo', old.numero using errcode = '55000';
        end if;
        if old.origem_tipo = 'renegociacao' then
          raise exception 'título #% é de renegociação: desfaça a renegociação para mudar valores', old.numero using errcode = '55000';
        end if;
        if exists (select 1 from financeiro.mov_titulo g where g.retencao_de_id = old.id and g.situacao <> 'cancelado')
           and (new.ret_iss, new.ret_irrf, new.ret_inss, new.ret_pcc) is distinct from (old.ret_iss, old.ret_irrf, old.ret_inss, old.ret_pcc) then
          raise exception 'título #% tem guias de retenção: cancele as guias antes de mudar as retenções', old.numero using errcode = '55000';
        end if;
      end if;
      select coalesce(sum(valor_principal), 0) into v_pago from financeiro.mov_baixa where titulo_id = old.id and not estornada;
      new.saldo := new.valor_original - new.ret_iss - new.ret_irrf - new.ret_inss - new.ret_pcc - v_pago;
    end if;
    if new.competencia <> old.competencia then
      perform financeiro._checar_periodo(new.empresa_id, least(new.competencia, old.competencia), 'Competência');
    end if;
  end if;
  if new.tipo_titulo_id is not null then
    select * into v_tt from financeiro.cad_tipo_titulo where id = new.tipo_titulo_id and empresa_id = new.empresa_id;
    if not found then raise exception 'tipo de título inexistente nesta empresa' using errcode = '23503'; end if;
    if v_tt.aplica_a <> 'A' and v_tt.aplica_a <> new.tipo then
      raise exception 'o tipo de título % não se aplica a contas a %', v_tt.nome, case new.tipo when 'R' then 'receber' else 'pagar' end using errcode = '23514';
    end if;
  end if;
  if new.conta_prevista_id is not null and not exists
     (select 1 from financeiro.cad_conta_bancaria c where c.id = new.conta_prevista_id and c.empresa_id = new.empresa_id) then
    raise exception 'conta inexistente nesta empresa' using errcode = '23503';
  end if;
  if tg_op = 'INSERT' or new.parceiro_id <> old.parceiro_id then
    if not exists (select 1 from crm.cad_parceiro p where p.id = new.parceiro_id and p.empresa_id = new.empresa_id) then
      raise exception 'parceiro inexistente nesta empresa' using errcode = '23503';
    end if;
  end if;
  return new;
end $$;
create trigger antes before insert or update on financeiro.mov_titulo for each row execute function financeiro._titulo_antes();

create function financeiro._bloquear_exclusao() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not financeiro._sistema() then
    raise exception '% não se exclui: cancele ou estorne', tg_table_name using errcode = '55000';
  end if;
  return old;
end $$;
create trigger bloquear_exclusao before delete on financeiro.mov_titulo for each row execute function financeiro._bloquear_exclusao();
create trigger bloquear_exclusao before delete on financeiro.mov_baixa for each row execute function financeiro._bloquear_exclusao();
create trigger bloquear_exclusao before delete on financeiro.mov_conta_movimento for each row execute function financeiro._bloquear_exclusao();
create trigger bloquear_exclusao before delete on financeiro.mov_baixa_lote for each row execute function financeiro._bloquear_exclusao();

-- ---------------------------------------------------------------------------
-- Rateio
-- ---------------------------------------------------------------------------
create function financeiro._rateio_antes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t financeiro.mov_titulo; n record; c record;
begin
  select * into t from financeiro.mov_titulo where id = new.titulo_id;
  if t.empresa_id <> new.empresa_id then raise exception 'rateio de outra empresa' using errcode = '23514'; end if;
  select analitico, ativo, coalesce(exige_cr_canal, false) exige, codigo, sinal into n
    from financeiro.cad_natureza where id = new.natureza_id and empresa_id = new.empresa_id;
  if not found then raise exception 'natureza inexistente nesta empresa' using errcode = '23503'; end if;
  select analitico, ativo, aceita_receita, codigo into c
    from financeiro.cad_centro_resultado where id = new.cr_id and empresa_id = new.empresa_id;
  if not found then raise exception 'centro de resultado inexistente nesta empresa' using errcode = '23503'; end if;
  if not n.analitico then raise exception 'natureza % não é analítica', n.codigo using errcode = '23514'; end if;
  if not c.analitico then raise exception 'centro de resultado % não é analítico', c.codigo using errcode = '23514'; end if;
  if tg_op = 'INSERT' or new.natureza_id <> old.natureza_id or new.cr_id <> old.cr_id then
    if not n.ativo then raise exception 'natureza % está inativa', n.codigo using errcode = '23514'; end if;
    if not c.ativo then raise exception 'centro de resultado % está inativo', c.codigo using errcode = '23514'; end if;
  end if;
  if n.exige and not c.aceita_receita then
    raise exception 'a natureza % exige centro de resultado do tipo canal (CR % não aceita receita)', n.codigo, c.codigo using errcode = '23514';
  end if;
  if (t.tipo = 'R' and n.sinal = -1) or (t.tipo = 'D' and n.sinal = 1) then
    raise exception 'a natureza % é de %, e o título é a %', n.codigo,
      case n.sinal when 1 then 'receita' else 'despesa' end, case t.tipo when 'R' then 'receber' else 'pagar' end using errcode = '23514';
  end if;
  if new.projeto_id is not null and not exists
     (select 1 from financeiro.cad_projeto p where p.id = new.projeto_id and p.empresa_id = new.empresa_id) then
    raise exception 'projeto inexistente nesta empresa' using errcode = '23503';
  end if;
  return new;
end $$;
create trigger antes before insert or update on financeiro.rel_titulo_rateio for each row execute function financeiro._rateio_antes();

create function financeiro._rateio_conferir(p_titulo uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_s numeric; v_n int;
begin
  if not exists (select 1 from financeiro.mov_titulo where id = p_titulo) then return; end if;
  select coalesce(sum(percentual), 0), count(*) into v_s, v_n from financeiro.rel_titulo_rateio where titulo_id = p_titulo;
  if v_n = 0 then raise exception 'título sem natureza e centro de resultado (rateio vazio)' using errcode = '23514'; end if;
  if abs(v_s - 100) > 0.0001 then raise exception 'o rateio do título precisa fechar 100%% (está em %)', round(v_s, 4) using errcode = '23514'; end if;
end $$;

create function financeiro._rateio_depois() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform financeiro._rateio_conferir(case when tg_op = 'DELETE' then old.titulo_id else new.titulo_id end);
  return null;
end $$;
create function financeiro._titulo_rateio_depois() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform financeiro._rateio_conferir(new.id);
  return null;
end $$;
create constraint trigger rateio_soma after insert or update or delete on financeiro.rel_titulo_rateio
  deferrable initially deferred for each row execute function financeiro._rateio_depois();
create constraint trigger rateio_existe after insert on financeiro.mov_titulo
  deferrable initially deferred for each row execute function financeiro._titulo_rateio_depois();

-- ---------------------------------------------------------------------------
-- Saldo e situação do título (fonte única: as baixas não estornadas)
-- ---------------------------------------------------------------------------
create function financeiro._recalcular(p_titulo uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t financeiro.mov_titulo; v_pago numeric; v_reneg boolean; v_saldo numeric; v_sit text;
begin
  select * into t from financeiro.mov_titulo where id = p_titulo for update;
  select coalesce(sum(valor_principal), 0), coalesce(bool_or(tipo = 'renegociacao'), false) into v_pago, v_reneg
    from financeiro.mov_baixa where titulo_id = p_titulo and not estornada;
  v_saldo := t.valor_liquido - v_pago;
  if v_saldo < 0 then raise exception 'as baixas do título #% passam do valor líquido', t.numero using errcode = '23514'; end if;
  if t.situacao = 'cancelado' then
    if v_pago > 0 then raise exception 'título #% cancelado não pode ter baixa', t.numero using errcode = '55000'; end if;
    v_sit := 'cancelado';
  elsif v_saldo = 0 then v_sit := case when v_reneg then 'renegociado' else 'baixado' end;
  elsif v_pago > 0 then v_sit := 'parcial';
  else v_sit := 'aberto';
  end if;
  if v_sit is distinct from t.situacao or v_saldo is distinct from t.saldo then
    update financeiro.mov_titulo set saldo = v_saldo, situacao = v_sit where id = p_titulo;
  end if;
  if t.adiantamento_id is not null and t.adiantamento_papel = 'contrapartida' then
    update financeiro.mov_adiantamento set situacao = case when v_saldo = 0 then 'compensado' else 'aberto' end
     where id = t.adiantamento_id and situacao <> 'cancelado';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Baixa
-- ---------------------------------------------------------------------------
create function financeiro._baixa_antes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t financeiro.mov_titulo;
begin
  if tg_op = 'INSERT' then
    select * into t from financeiro.mov_titulo where id = new.titulo_id for update;
    if t.empresa_id <> new.empresa_id then raise exception 'baixa de outra empresa' using errcode = '23514'; end if;
    if t.situacao not in ('aberto','parcial') then
      raise exception 'título #% está % e não aceita baixa', t.numero, t.situacao using errcode = '55000';
    end if;
    if t.provisao then raise exception 'título #% é provisão: efetive antes de baixar', t.numero using errcode = '55000'; end if;
    if new.valor_principal > t.saldo then
      raise exception 'baixa de R$ % maior que o saldo de R$ % do título #%', new.valor_principal, t.saldo, t.numero using errcode = '23514';
    end if;
    if new.tipo = 'renegociacao' and (new.juros + new.multa + new.desconto + new.taxa) <> 0 then
      raise exception 'baixa por renegociação não leva juros, multa, desconto ou taxa' using errcode = '23514';
    end if;
    new.valor_movimentado := case when t.tipo = 'R' then new.valor_principal + new.juros + new.multa - new.desconto - new.taxa
                                  else new.valor_principal + new.juros + new.multa - new.desconto + new.taxa end;
    if new.valor_movimentado < 0 then raise exception 'desconto e taxa maiores que o valor baixado' using errcode = '23514'; end if;
    perform financeiro._checar_periodo(new.empresa_id, new.data, 'Baixa');
  else
    if not financeiro._sistema() and (new.titulo_id, new.data, new.valor_principal, new.juros, new.multa, new.desconto, new.taxa, new.conta_id, new.tipo, new.lote_id, new.movimento_id)
       is distinct from (old.titulo_id, old.data, old.valor_principal, old.juros, old.multa, old.desconto, old.taxa, old.conta_id, old.tipo, old.lote_id, old.movimento_id) then
      raise exception 'baixa não se edita: estorne e baixe de novo' using errcode = '55000';
    end if;
    if old.estornada and not new.estornada then raise exception 'baixa estornada não volta: faça uma nova baixa' using errcode = '55000'; end if;
    if new.estornada and not old.estornada then
      perform financeiro._checar_periodo(new.empresa_id, old.data, 'Estorno de baixa');
      new.estornada_em := coalesce(new.estornada_em, now());
    end if;
  end if;
  return new;
end $$;
create trigger antes before insert or update on financeiro.mov_baixa for each row execute function financeiro._baixa_antes();

create function financeiro._baixa_depois() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform financeiro._recalcular(new.titulo_id);
  return null;
end $$;
create trigger depois after insert or update of estornada on financeiro.mov_baixa for each row execute function financeiro._baixa_depois();

-- ---------------------------------------------------------------------------
-- Movimento bancário e conta
-- ---------------------------------------------------------------------------
create function financeiro._movimento_antes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c financeiro.cad_conta_bancaria;
begin
  if tg_op = 'INSERT' then
    select * into c from financeiro.cad_conta_bancaria where id = new.conta_id and empresa_id = new.empresa_id;
    if not found then raise exception 'conta inexistente nesta empresa' using errcode = '23503'; end if;
    if not c.ativa then raise exception 'a conta % está inativa', c.nome using errcode = '55000'; end if;
    if new.data < c.data_saldo_inicial then
      raise exception 'movimento em % é anterior ao saldo inicial da conta % (%)', to_char(new.data, 'DD/MM/YYYY'), c.nome, to_char(c.data_saldo_inicial, 'DD/MM/YYYY') using errcode = '23514';
    end if;
    perform financeiro._checar_periodo(new.empresa_id, new.data, 'Movimento bancário');
  else
    if not financeiro._sistema() and (new.conta_id, new.data, new.valor, new.tipo, new.lote_id) is distinct from (old.conta_id, old.data, old.valor, old.tipo, old.lote_id) then
      raise exception 'movimento bancário não se edita: estorne e lance de novo' using errcode = '55000';
    end if;
    if old.estornado and not new.estornado then raise exception 'movimento estornado não volta' using errcode = '55000'; end if;
    if new.estornado and not old.estornado then
      if old.conciliado then raise exception 'movimento conciliado: desconcilie antes de estornar' using errcode = '55000'; end if;
      perform financeiro._checar_periodo(new.empresa_id, old.data, 'Estorno de movimento');
    end if;
    if new.conciliado is distinct from old.conciliado then
      perform financeiro._checar_periodo(new.empresa_id, coalesce(new.data_conciliacao, old.data_conciliacao), 'Conciliação');
    end if;
  end if;
  return new;
end $$;
create trigger antes before insert or update on financeiro.mov_conta_movimento for each row execute function financeiro._movimento_antes();

create function financeiro._conta_antes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' and (new.saldo_inicial, new.data_saldo_inicial) is distinct from (old.saldo_inicial, old.data_saldo_inicial) then
    if exists (select 1 from financeiro.mov_conta_movimento m where m.conta_id = old.id and m.conciliado) then
      raise exception 'a conta % já tem movimento conciliado: o saldo inicial não muda mais', old.nome using errcode = '55000';
    end if;
    if exists (select 1 from financeiro.mov_conta_movimento m where m.conta_id = old.id and not m.estornado and m.data < new.data_saldo_inicial) then
      raise exception 'há movimentos anteriores à nova data de saldo inicial' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger antes before insert or update on financeiro.cad_conta_bancaria for each row execute function financeiro._conta_antes();

create function financeiro._tocar() returns trigger
language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger tocar before update on financeiro.cad_tipo_titulo for each row execute function financeiro._tocar();
create trigger tocar before update on financeiro.cad_projeto for each row execute function financeiro._tocar();
create trigger tocar before update on financeiro.cfg_financeiro for each row execute function financeiro._tocar();

-- ---------------------------------------------------------------------------
-- NF-e de entrada: títulos a pagar nascem na confirmação, um por parcela (e por rubrica que gera financeiro)
-- ---------------------------------------------------------------------------
create function financeiro._gerar_titulos_entrada(p_entrada uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare e compra.mov_entrada; p record; v_n int := 0; v_g uuid; v_qtd int; v_id uuid; v_tt uuid; v_i int := 0;
begin
  select * into e from compra.mov_entrada where id = p_entrada;
  if not found or e.status <> 'confirmada' or coalesce(e.fin_origem, '') = 'sem_financeiro' then return 0; end if;
  select count(*) into v_qtd from compra.mov_entrada_parcela where entrada_id = p_entrada and rubrica_id is null;
  select grupo_id into v_g from financeiro.mov_titulo where entrada_id = p_entrada and grupo_id is not null and situacao <> 'cancelado' limit 1;
  for p in select c.* from compra.mov_entrada_parcela c
            where c.entrada_id = p_entrada
              and not exists (select 1 from financeiro.mov_titulo t where t.entrada_parcela_id = c.id and t.situacao <> 'cancelado')
            order by (c.rubrica_id is not null), c.seq loop
    if p.rubrica_id is null and v_qtd > 1 and v_g is null then
      insert into financeiro.mov_grupo_titulo (empresa_id, tipo, descricao, total, parcelas)
      values (e.empresa_id, 'nota', 'NF-e ' || coalesce(e.numero, 's/n') || ' · ' || coalesce(e.fornecedor_nome, ''),
              (select sum(valor) from compra.mov_entrada_parcela where entrada_id = p_entrada and rubrica_id is null), v_qtd)
      returning id into v_g;
    end if;
    if p.rubrica_id is null then
      select count(*) + 1 into v_i from compra.mov_entrada_parcela x where x.entrada_id = p_entrada and x.rubrica_id is null and x.seq < p.seq;
    end if;
    select id into v_tt from financeiro.cad_tipo_titulo
     where empresa_id = e.empresa_id and (codigo = upper(coalesce(p.forma, '')) or meio = lower(coalesce(p.forma, ''))) limit 1;
    insert into financeiro.mov_titulo (empresa_id, tipo, parceiro_id, documento, historico, emissao, competencia, vencimento, valor_original,
        tipo_titulo_id, origem_tipo, entrada_id, entrada_parcela_id, nfe_chave, grupo_id, parcela_num, parcela_total)
    values (e.empresa_id, 'D', coalesce(p.parceiro_id, e.fornecedor_parceiro_id),
        case when p.rubrica_id is null then 'NF-e ' || coalesce(e.numero, 's/n') || ' · dup. ' || v_i || '/' || v_qtd
             else coalesce(nullif(btrim(p.documento), ''), 'Rubrica da NF-e ' || coalesce(e.numero, 's/n')) end,
        coalesce(nullif(btrim(p.observacao), ''), 'Entrada de mercadoria NF-e ' || coalesce(e.numero, 's/n')),
        coalesce(e.emitida_em, financeiro._hoje()), coalesce(e.emitida_em, financeiro._hoje()),
        coalesce(p.vencimento, e.emitida_em, financeiro._hoje()), p.valor, v_tt, 'nfe_entrada', e.id, p.id, e.chave_acesso,
        case when p.rubrica_id is null and v_qtd > 1 then v_g end,
        case when p.rubrica_id is null and v_qtd > 1 then v_i end,
        case when p.rubrica_id is null and v_qtd > 1 then v_qtd end)
    returning id into v_id;
    insert into financeiro.rel_titulo_rateio (empresa_id, titulo_id, natureza_id, cr_id, percentual)
    values (e.empresa_id, v_id, coalesce(p.natureza_id, e.fin_natureza_id), coalesce(p.cr_id, e.fin_cr_id), 100);
    update compra.mov_entrada_parcela set titulo_id = v_id where id = p.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create function financeiro._entrada_confirmada() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform financeiro._gerar_titulos_entrada(new.id);
  return null;
end $$;
create trigger financeiro_titulos after update of status on compra.mov_entrada
  for each row when (new.status = 'confirmada' and old.status is distinct from 'confirmada')
  execute function financeiro._entrada_confirmada();

-- funções internas: ninguém de fora executa
do $$
declare f record;
begin
  for f in select p.oid::regprocedure s from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'financeiro' and p.proname in ('_proximo','_sistema','_hoje','_checar_periodo','_venc','_dividir','_titulo_antes',
              '_bloquear_exclusao','_rateio_antes','_rateio_conferir','_rateio_depois','_titulo_rateio_depois','_recalcular','_baixa_antes','_baixa_depois',
              '_movimento_antes','_conta_antes','_tocar','_gerar_titulos_entrada','_entrada_confirmada') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.s);
  end loop;
end $$;
