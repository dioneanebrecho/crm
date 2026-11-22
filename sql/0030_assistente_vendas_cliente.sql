-- 0030_assistente_vendas_cliente
-- Assistente, 1a ferramenta de DADO: vendas (notas fiscais do espelho Bling) por cliente.
-- Somente leitura. Permissão: tela 'assistente' (ver). Valores só para admin/gestor/financeiro.
-- Sem CPF, telefone ou endereço na resposta.
-- Também aceita modo 'dados' no log de perguntas (histórico do usuário).

alter table conhecimento.log_recuperacao drop constraint if exists log_recuperacao_modo_check;
alter table conhecimento.log_recuperacao
  add constraint log_recuperacao_modo_check check (modo = any (array['text','vector','hybrid','dados']));

create or replace function api.assistente_vendas_cliente(p_empresa uuid, p_busca text, p_limite integer default 10)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_termo    text := nullif(regexp_replace(trim(coalesce(p_busca, '')), '^@+', ''), '');
  v_pal      text[];
  v_like     text;
  v_valores  boolean;
  v_lim      integer := least(greatest(coalesce(p_limite, 10), 1), 30);
  v_cands    jsonb;
  v_mais     boolean;
  v_base_ate timestamp;
  v_base_qtd bigint;
  v_base_det bigint;
begin
  perform conhecimento._exigir(p_empresa, 'ver', array['assistente']);

  if v_termo is null or length(v_termo) < 3 then
    return jsonb_build_object('ok', false, 'motivo', 'termo_curto');
  end if;

  v_pal := array(select '%' || regexp_replace(w, '([\\%_])', '\\\1', 'g') || '%'
                   from unnest(regexp_split_to_array(lower(v_termo), '\s+')) w where length(w) > 0);
  v_like := '%' || regexp_replace(lower(v_termo), '([\\%_])', '\\\1', 'g') || '%';
  v_valores := api.tem_papel(p_empresa, array['admin', 'gestor', 'financeiro']);

  select max(atualizado_em), count(*), count(*) filter (where tem_detalhe)
    into v_base_ate, v_base_qtd, v_base_det
    from bling.cad_nfe where empresa_id = p_empresa;

  with achados as (
    select p.id, p.nome,
           (select array_agg('@' || i.valor_hash order by i.valor_hash) from crm.cad_parceiro_identificador i
             where i.parceiro_id = p.id and i.tipo = 'instagram') as insta
      from crm.cad_parceiro p
     where p.empresa_id = p_empresa
       and (not exists (select 1 from unnest(v_pal) w where lower(p.nome) not like w)
            or exists (select 1 from crm.cad_parceiro_identificador i
                        where i.parceiro_id = p.id and i.tipo = 'instagram' and lower(i.valor_hash) like v_like))
  ), ord as (
    select a.*, (select count(*) from bling.rel_contato_parceiro m where m.parceiro_id = a.id and m.status = 'vinculado') q
      from achados a order by q desc, a.nome limit 6
  )
  select coalesce(jsonb_agg(to_jsonb(o) order by o.q desc, o.nome), '[]'::jsonb), (select count(*) from achados) > 5
    into v_cands, v_mais
    from ord o;

  return jsonb_build_object(
    'ok', true,
    've_valores', v_valores,
    'base_ate', v_base_ate,
    'base_notas', v_base_qtd,
    'base_com_detalhe', v_base_det,
    'mais_candidatos', v_mais,
    'clientes', coalesce((
      select jsonb_agg(c.obj order by c.ord)
        from (
          select row_number() over (order by (x->>'q')::int desc, x->>'nome') ord,
                 jsonb_build_object(
                   'parceiro_id', x->>'id',
                   'nome', x->>'nome',
                   'instagram', case when jsonb_typeof(x->'insta') = 'array' then x->'insta' else '[]'::jsonb end,
                   'resumo', (
                     select jsonb_build_object(
                              'qtd_notas', count(*),
                              'qtd_validas', count(*) filter (where n.situacao not in (2, 4, 9)),
                              'qtd_canceladas', count(*) filter (where n.situacao in (2, 4, 9)),
                              'qtd_sem_detalhe', count(*) filter (where not n.tem_detalhe),
                              'primeira', min(n.data_emissao),
                              'ultima', max(n.data_emissao) filter (where n.situacao not in (2, 4, 9)),
                              'valor_total', case when v_valores
                                then coalesce(sum(n.valor_nota) filter (where n.tem_detalhe and n.situacao not in (2, 4, 9)), 0) end,
                              'ticket_medio', case when v_valores
                                then sum(n.valor_nota) filter (where n.tem_detalhe and n.situacao not in (2, 4, 9))
                                     / nullif(count(*) filter (where n.tem_detalhe and n.situacao not in (2, 4, 9)), 0) end)
                       from bling.cad_nfe n
                       join bling.rel_contato_parceiro m on m.empresa_id = n.empresa_id and m.bling_id = n.contato_bling_id
                      where n.empresa_id = p_empresa and m.parceiro_id = (x->>'id')::uuid and m.status = 'vinculado'),
                   'notas', coalesce((
                     select jsonb_agg(jsonb_build_object(
                              'bling_id', t.bling_id::text,
                              'numero', t.numero,
                              'data_emissao', t.data_emissao,
                              'situacao', t.situacao,
                              'situacao_rotulo', t.rotulo,
                              'valor_nota', case when v_valores then t.valor_nota end,
                              'qtd_itens', t.qtd_itens,
                              'tem_detalhe', t.tem_detalhe,
                              'itens', coalesce((
                                select jsonb_agg(jsonb_build_object(
                                         'descricao', i.descricao, 'grade', i.grade_cru, 'quantidade', i.quantidade,
                                         'valor', case when v_valores then i.valor end) order by i.seq)
                                  from (select * from bling.cad_nfe_item ii
                                         where ii.empresa_id = p_empresa and ii.nfe_bling_id = t.bling_id
                                         order by ii.seq limit 12) i), '[]'::jsonb))
                            order by t.data_emissao desc nulls last)
                       from (select n.*, coalesce(s.rotulo, 'Situação ' || n.situacao) rotulo
                               from bling.cad_nfe n
                               join bling.rel_contato_parceiro m on m.empresa_id = n.empresa_id and m.bling_id = n.contato_bling_id
                               left join bling.cfg_dominio_nfe_situacao s on s.codigo = n.situacao
                              where n.empresa_id = p_empresa and m.parceiro_id = (x->>'id')::uuid and m.status = 'vinculado'
                              order by n.data_emissao desc nulls last, n.bling_id
                              limit v_lim) t), '[]'::jsonb)
                 ) obj
            from jsonb_array_elements(v_cands) x) c), '[]'::jsonb));
end
$function$;

revoke all on function api.assistente_vendas_cliente(uuid, text, integer) from public, anon;
grant execute on function api.assistente_vendas_cliente(uuid, text, integer) to authenticated;

-- Registro da pergunta de dado no histórico do próprio usuário (pergunta mascarada no painel/servidor).
create or replace function api.registrar_pergunta_dados(p_empresa uuid, p_pergunta text, p_achados integer default 0)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $function$
begin
  perform conhecimento._exigir(p_empresa, 'ver', array['assistente']);
  insert into conhecimento.log_recuperacao (empresa_id, usuario_id, pergunta, modo, chunk_ids, latencia_ms)
  values (p_empresa, (select auth.uid()), left(coalesce(p_pergunta, ''), 500), 'dados', '{}', null);
end
$function$;

revoke all on function api.registrar_pergunta_dados(uuid, text, integer) from public, anon;
grant execute on function api.registrar_pergunta_dados(uuid, text, integer) to authenticated;
