-- 0087b_atendimento_origem_ambiente.sql
-- origem segue o ambiente (engine.origem_padrao), como o resto do motor (a trava engine.guarda_origem recusou 'piloto' em produção)
alter table atendimento.mov_conversa alter column origem set default coalesce(engine.origem_padrao(), 'piloto');
update atendimento.mov_conversa set origem = coalesce(engine.origem_padrao(), 'piloto');
-- api.svc_ingerir_mensagem_meta: grava log_evento_bruto com origem = coalesce(engine.origem_padrao(), 'piloto')
create or replace function api.svc_ingerir_mensagem_meta(p_payload jsonb, p_assinatura_valida boolean, p_cabecalhos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_id bigint; it jsonb; v_ext text;
begin
  it := p_payload -> 'item';
  v_ext := coalesce(it -> 'message' ->> 'mid',
                    case when it ? 'read' then 'read:' || coalesce(it -> 'read' ->> 'mid', '') || ':' || coalesce(it ->> 'timestamp', '') end,
                    md5(it::text));
  insert into engine.log_evento_bruto (fonte, origem, tipo, id_externo, payload, cabecalhos, assinatura_valida, recebido_em)
  values ('meta_dm', coalesce(engine.origem_padrao(), 'piloto'), 'messaging', v_ext, p_payload, coalesce(p_cabecalhos, '{}'), coalesce(p_assinatura_valida, false), now())
  on conflict (fonte, id_externo) do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('resultado', 'duplicado'); end if;
  if not coalesce(p_assinatura_valida, false) then
    update engine.log_evento_bruto set processado_em = now(), resultado = 'assinatura_invalida' where id = v_id;
    return jsonb_build_object('evento_id', v_id, 'resultado', 'assinatura_invalida');
  end if;
  return jsonb_build_object('evento_id', v_id, 'resultado', atendimento.processar_mensagem_meta(v_id));
end $$;
revoke all on function api.svc_ingerir_mensagem_meta(jsonb, boolean, jsonb) from public, anon, authenticated;
grant execute on function api.svc_ingerir_mensagem_meta(jsonb, boolean, jsonb) to service_role;

