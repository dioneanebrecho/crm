-- 0076: novas variáveis do layout de etiqueta: {descricao}, {grade}, {codigo_produto}, {codigo_variacao}, {marca}, {categoria}
-- (as anteriores continuam valendo: {numero_curto} {nome_peca} {tamanho} {preco} {codigo_unidade}). APLICADA em 24/11/2026.
-- Os dados vêm da unidade impressa (impressao._dados_etiqueta) e entram em opcoes->'dados' na chamada de impressao._gerar_zpl.
create function impressao._dados_etiqueta(p_unidade uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('dados', jsonb_build_object('codigo_produto', p.codigo, 'codigo_variacao', va.codigo, 'marca', p.marca, 'categoria', p.categoria))
    from catalogo.cad_unidade u join catalogo.cad_variacao va on va.id = u.variacao_id join catalogo.cad_peca p on p.id = va.peca_id
   where u.id = p_unidade $$;

create function impressao._zpl_valor(p_modelo text, p_codigo text, p_numero int, p_nome text, p_tamanho text, p_preco numeric, p_dados jsonb, p_max int default 120) returns text
language sql immutable set search_path = '' as $$
  select impressao._zpl_texto(
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(p_modelo, ''),
      '{numero_curto}', coalesce(p_numero::text, '')),
      '{nome_peca}', coalesce(p_nome, '')),
      '{descricao}', coalesce(p_nome, '')),
      '{tamanho}', coalesce(p_tamanho, '')),
      '{grade}', coalesce(p_tamanho, '')),
      '{preco}', case when p_preco is null then '' else replace(to_char(p_preco, 'FM999990.00'), '.', ',') end),
      '{codigo_unidade}', coalesce(p_codigo, '')),
      '{codigo_produto}', coalesce(p_dados ->> 'codigo_produto', '')),
      '{codigo_variacao}', coalesce(p_dados ->> 'codigo_variacao', '')),
      '{marca}', coalesce(p_dados ->> 'marca', '')),
      '{categoria}', coalesce(p_dados ->> 'categoria', '')), p_max) $$;

do $do$
declare v_def text; v_old text; v_new text;
begin
  -- 1. _zpl_layout recebe p_dados (nova sobrecarga; a antiga é removida abaixo)
  v_def := pg_get_functiondef('impressao._zpl_layout(jsonb,text,integer,text,text,numeric,numeric,numeric,integer,numeric,numeric)'::regprocedure);
  v_new := replace(v_def, 'p_ajuste_y_mm numeric) RETURNS text', 'p_ajuste_y_mm numeric, p_dados jsonb DEFAULT NULL::jsonb) RETURNS text');
  v_new := replace(v_new, 'p_nome, p_tamanho, p_preco);', 'p_nome, p_tamanho, p_preco, p_dados);');
  if v_new = v_def or position('p_preco, p_dados);' in v_new) = 0 then raise exception 'trecho de _zpl_layout não encontrado'; end if;
  execute v_new;
  -- 2. _gerar_zpl repassa opcoes->'dados'
  v_def := pg_get_functiondef('impressao._gerar_zpl(text,integer,text,text,numeric,numeric,numeric,integer,numeric,numeric,jsonb)'::regprocedure);
  v_old := 'p_ajuste_x_mm, p_ajuste_y_mm);';
  if position(v_old in v_def) = 0 then raise exception 'trecho de _gerar_zpl não encontrado'; end if;
  execute replace(v_def, v_old, 'p_ajuste_x_mm, p_ajuste_y_mm, p_opcoes -> ''dados'');');
  -- 3. a impressão de etiquetas passa os dados da peça junto das opções do modelo
  v_def := pg_get_functiondef('api.solicitar_impressao_etiquetas(uuid,uuid[],uuid,integer,text,boolean)'::regprocedure);
  v_old := 'v_imp.ajuste_x_mm, v_imp.ajuste_y_mm, v_mod.opcoes)';
  if position(v_old in v_def) = 0 then raise exception 'trecho de solicitar_impressao_etiquetas não encontrado'; end if;
  execute replace(v_def, v_old, 'v_imp.ajuste_x_mm, v_imp.ajuste_y_mm, v_mod.opcoes || coalesce(impressao._dados_etiqueta(r.unidade_id), ''{}''::jsonb))');
end $do$;

drop function impressao._zpl_layout(jsonb, text, int, text, text, numeric, numeric, numeric, int, numeric, numeric);
drop function impressao._zpl_valor(text, text, int, text, text, numeric, int);

revoke all on function impressao._dados_etiqueta(uuid), impressao._zpl_valor(text, text, int, text, text, numeric, jsonb, int),
  impressao._zpl_layout(jsonb, text, int, text, text, numeric, numeric, numeric, int, numeric, numeric, jsonb) from public, anon, authenticated;
