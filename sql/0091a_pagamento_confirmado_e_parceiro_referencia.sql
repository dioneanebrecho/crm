-- 0091a (pedido 047): pagamento confirmado dispara a confirmação do pagador; pagador propagado para cobrança e pedido;
-- "Marcar pago" pelo painel; bloqueio, limite de reservas e "já participa" passam a valer por PARCEIRO (todos os @ e WhatsApp da mesma pessoa).

-- 1) helpers por parceiro
create or replace function crm.perfis_mesmo_parceiro(p_cliente uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c.id), array[p_cliente]) from crm.cad_cliente c
   where c.parceiro_id = (select parceiro_id from crm.cad_cliente where id = p_cliente)
$$;
create or replace function crm.parceiro_bloqueado(p_cliente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from crm.cad_cliente c where c.id = any (crm.perfis_mesmo_parceiro(p_cliente)) and c.bloqueado_ate > now())
$$;
revoke all on function crm.perfis_mesmo_parceiro(uuid), crm.parceiro_bloqueado(uuid) from public, anon, authenticated;

-- 2) decidir_item: bloqueio e "já participa" pelo parceiro
do $m$
declare d text := pg_get_functiondef('live.decidir_item'::regproc); n text;
begin
  n := replace(d, 'if exists (select 1 from crm.cad_cliente c where c.id = r.cliente_id and c.bloqueado_ate > now()) then',
                  'if crm.parceiro_bloqueado(r.cliente_id) then');
  n := replace(n, 'x.item_id=p_item and x.cliente_id=r.cliente_id and', 'x.item_id=p_item and x.cliente_id = any (crm.perfis_mesmo_parceiro(r.cliente_id)) and');
  n := replace(n, 'f.item_id=p_item and f.cliente_id=r.cliente_id and', 'f.item_id=p_item and f.cliente_id = any (crm.perfis_mesmo_parceiro(r.cliente_id)) and');
  if n = d or position('parceiro_bloqueado' in n) = 0 or (length(n) - length(replace(n, 'perfis_mesmo_parceiro', ''))) / length('perfis_mesmo_parceiro') <> 2 then
    raise exception 'decidir_item: trecho esperado não encontrado';
  end if;
  execute n;
end $m$;

-- 3) publico_quero: bloqueio e limite de reservas pelo parceiro
do $m$
declare d text := pg_get_functiondef('api.publico_quero'::regproc); n text;
begin
  n := replace(d, 'if exists (select 1 from crm.cad_cliente where id = v_cli and bloqueado_ate > now()) then', 'if crm.parceiro_bloqueado(v_cli) then');
  n := replace(n, 'where empresa_id = v_link.empresa_id and cliente_id = v_cli and estado = ''ativa'';',
                  'where empresa_id = v_link.empresa_id and cliente_id = any (crm.perfis_mesmo_parceiro(v_cli)) and estado = ''ativa'';');
  if n = d or position('parceiro_bloqueado' in n) = 0 or position('perfis_mesmo_parceiro' in n) = 0 then
    raise exception 'publico_quero: trecho esperado não encontrado';
  end if;
  execute n;
end $m$;

-- 4) forma de pagamento escolhida no link
alter table live.mov_reserva add column forma_pagamento text check (forma_pagamento in ('pix','cartao'));
alter table venda.mov_cobranca add column forma_pagamento text check (forma_pagamento in ('pix','cartao'));

-- 5) pagador propagado: reserva -> cobrança -> pedido
create or replace function venda.tg_cobranca_reserva_pagador() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update venda.mov_cobranca c set
    parceiro_pagador_id = coalesce(c.parceiro_pagador_id, r.parceiro_pagador_id, (select parceiro_id from crm.cad_cliente where id = c.cliente_id)),
    forma_pagamento = coalesce(c.forma_pagamento, r.forma_pagamento)
    from live.mov_reserva r where r.id = new.reserva_id and c.id = new.cobranca_id;
  return new;
end $$;
create trigger tg_cobranca_reserva_pagador after insert on venda.rel_cobranca_reserva
  for each row execute function venda.tg_cobranca_reserva_pagador();

create or replace function venda.tg_pedido_pagador() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.parceiro_pagador_id := coalesce(new.parceiro_pagador_id,
    (select parceiro_pagador_id from venda.mov_cobranca where id = new.cobranca_id),
    (select parceiro_id from crm.cad_cliente where id = new.cliente_id));
  return new;
end $$;
create trigger tg_pedido_pagador before insert on venda.mov_pedido for each row execute function venda.tg_pedido_pagador();

-- 6) reserva paga -> confirma o pagador (junta pré-cadastro ao dono do CPF quando for o caso)
create or replace function live.tg_reserva_paga_pagador() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'paga' and old.estado is distinct from 'paga' then
    perform crm.confirmar_pagador_reserva(new.id);
  end if;
  return new;
end $$;
create trigger tg_reserva_paga_pagador after update of estado on live.mov_reserva
  for each row execute function live.tg_reserva_paga_pagador();

revoke all on function venda.tg_cobranca_reserva_pagador(), venda.tg_pedido_pagador(), live.tg_reserva_paga_pagador() from public, anon, authenticated;

-- 7) "Marcar pago" pelo painel (Pix conferido no extrato, pagamento na loja etc.): usa o mesmo motor do gateway
alter table live.log_acao_suporte drop constraint if exists log_acao_suporte_acao_check;
alter table live.log_acao_suporte add constraint log_acao_suporte_acao_check
  check (acao in ('estender','passar_vez','publicar','encerrar_publicacao','encerrar_oferta','marcar_pago'));

create or replace function api.marcar_pago(p_empresa uuid, p_reserva uuid, p_metodo text, p_motivo text, p_frete numeric default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r live.mov_reserva; v_cob uuid; v_valor numeric; v_res text;
begin
  perform api._exigir(p_empresa, array['admin','gestor','suporte','financeiro']);
  if p_metodo not in ('pix','cartao','manual','outro') then raise exception 'forma de pagamento inválida' using errcode = '22023'; end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'informe como o pagamento foi conferido' using errcode = '22023'; end if;
  if coalesce(p_frete, 0) < 0 then raise exception 'frete inválido' using errcode = '22023'; end if;
  select * into r from live.mov_reserva where id = p_reserva and empresa_id = p_empresa;
  if r.id is null then raise exception 'reserva não encontrada' using errcode = 'P0002'; end if;
  if r.estado <> 'ativa' then raise exception 'a reserva não está ativa (situação: %)', r.estado using errcode = '22023'; end if;
  select c.id into v_cob from venda.rel_cobranca_reserva cr join venda.mov_cobranca c on c.id = cr.cobranca_id
   where cr.reserva_id = p_reserva and c.estado = 'aberta' limit 1;
  if v_cob is null then
    v_cob := venda.criar_cobranca(p_empresa, r.cliente_id, array[p_reserva], coalesce(p_frete, 0), 0);
  end if;
  select valor_total into v_valor from venda.mov_cobranca where id = v_cob;
  v_res := venda.registrar_pagamento(v_cob, 'manual', 'manual:' || gen_random_uuid(), p_metodo, v_valor, null, 'painel:' || coalesce((select auth.uid())::text, '?'));
  insert into live.log_acao_suporte (empresa_id, reserva_id, item_id, acao, detalhe, usuario_id)
  values (p_empresa, p_reserva, r.item_id, 'marcar_pago', p_metodo || ' ' || v_valor || ': ' || trim(p_motivo), (select auth.uid()));
  return jsonb_build_object('resultado', v_res, 'cobranca_id', v_cob, 'valor', v_valor,
    'pedido_id', (select id from venda.mov_pedido where cobranca_id = v_cob order by criado_em desc limit 1));
end $$;
revoke all on function api.marcar_pago(uuid, uuid, text, text, numeric) from public, anon;
grant execute on function api.marcar_pago(uuid, uuid, text, text, numeric) to authenticated;
