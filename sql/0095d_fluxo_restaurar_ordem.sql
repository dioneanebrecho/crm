-- 0095d (pedido 050): na restauração, as etapas criadas depois da revisão ficam inativas no fim, em sequência (sem buraco).
create or replace function api.fluxo_restaurar(p_empresa uuid, p_revisao uuid, p_motivo text) returns text
language plpgsql security definer set search_path = '' as $$
declare r crm.log_fluxo_revisao; v_max int;
begin
  perform crm._fluxo_exigir(p_empresa, 'editar');
  if length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'informe o motivo da restauração' using errcode = '22023'; end if;
  select * into r from crm.log_fluxo_revisao where id = p_revisao and empresa_id = p_empresa;
  if r.id is null then raise exception 'revisão não encontrada' using errcode = 'P0002'; end if;
  if r.copia = crm._fluxo_copia(p_empresa) then raise exception 'o fluxo já está igual à revisão %', r.versao using errcode = '22023'; end if;
  update crm.cad_fluxo_etapa set ordem = ordem + 100000 where empresa_id = p_empresa;
  update crm.cad_fluxo_etapa e set ordem = (x ->> 'ordem')::int, fase = (x ->> 'fase')::int, area = x ->> 'area', titulo = x ->> 'titulo',
         responsavel = x ->> 'responsavel', apoio = array(select jsonb_array_elements_text(x -> 'apoio')), tela = x ->> 'tela', entrada = x ->> 'entrada',
         procedimento = array(select jsonb_array_elements_text(x -> 'procedimento')), entrega = x ->> 'entrega', impacto = x ->> 'impacto',
         regras = x ->> 'regras', situacao = x ->> 'situacao', ativa = coalesce((x ->> 'ativa')::boolean, true), atualizado_em = now(), atualizado_por = (select auth.uid())
    from jsonb_array_elements(r.copia) x where e.empresa_id = p_empresa and e.codigo = x ->> 'codigo';
  select coalesce(max((x ->> 'ordem')::int), 0) into v_max from jsonb_array_elements(r.copia) x;
  update crm.cad_fluxo_etapa e set ativa = false, ordem = v_max + s.n, atualizado_em = now(), atualizado_por = (select auth.uid())
    from (select id, row_number() over (order by ordem) n from crm.cad_fluxo_etapa where empresa_id = p_empresa and ordem > 100000) s
   where e.id = s.id;
  return crm._fluxo_revisar(p_empresa, 'Restaurada a revisão ' || r.versao || ': ' || btrim(p_motivo), '{}', 'restauracao');
end $$;
revoke all on function api.fluxo_restaurar(uuid, uuid, text) from public, anon;
grant execute on function api.fluxo_restaurar(uuid, uuid, text) to authenticated;
