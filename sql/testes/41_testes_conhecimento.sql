\set ON_ERROR_STOP off
create schema t;
create table t.resultado (n serial, nome text, ok boolean);
grant usage on schema t to public; grant all on t.resultado to public; grant all on sequence t.resultado_n_seq to public;
create function t._q(p text) returns text language sql immutable as $$
  select replace(replace(p, '{E}', '''aaaaaaaa-0000-0000-0000-000000000001''::uuid'), '{O}', '''bbbbbbbb-0000-0000-0000-000000000002''::uuid') $$;
create function t._sub(p text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', case when p = '' then '' else '00000000-0000-0000-0000-0000000000' || p end, true); end $$;
create function t.run(rol text, sub text, p_sql text) returns void language plpgsql as $$
begin
  perform t._sub(sub); if rol <> '' then execute 'set local role ' || rol; end if;
  execute t._q(p_sql); reset role;
exception when others then reset role; raise;
end $$;
create function t.val(rol text, sub text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform t._sub(sub); if rol <> '' then execute 'set local role ' || rol; end if;
  execute 'select (' || t._q(p_sql) || ')::text' into v; reset role; return v;
exception when others then reset role; raise;
end $$;
create function t.chk(p_nome text, p_cond boolean) returns void language sql as $$
  insert into t.resultado (nome, ok) values (p_nome, coalesce(p_cond, false)) $$;
create function t.erro(p_nome text, rol text, sub text, p_sql text, p_esperado text) returns void language plpgsql as $$
declare v text := '';
begin
  begin perform t.run(rol, sub, p_sql); exception when others then v := sqlstate; end;
  reset role;
  insert into t.resultado (nome, ok) values (p_nome || ' [' || coalesce(nullif(v, ''), 'ok') || ']', v = p_esperado);
end $$;
create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role; -- como no Supabase
\i ../0014_ia_assistente_permissoes.sql
\i ../0021_conhecimento_rag.sql
\i ../0023_historico_assistente.sql
create function t.ch(p_textos text[]) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('indice', i - 1, 'titulo', '', 'conteudo', x,
           'hash', encode(sha256(convert_to(x, 'UTF8')), 'hex'), 'tokens', ceil(length(x) / 4.0)) order by i)
    from unnest(p_textos) with ordinality u(x, i) $$;
create function t.gravar(p_emp uuid, p_titulo text, p_textos text[], p_sens text default 'baixa') returns jsonb language sql as $$
  select api.svc_gravar_fonte(p_emp, p_titulo, 'documento', p_sens, 'arquivo.md', array_to_string(p_textos, E'\n\n'),
           encode(sha256(convert_to(array_to_string(p_textos, E'\n\n'), 'UTF8')), 'hex'), t.ch(p_textos), '{}'::jsonb, null) $$;
create function t.vec(n int) returns jsonb language sql immutable as $$
  select jsonb_agg(case when i = n then 1 else 0 end order by i) from generate_series(1, 1024) i $$;
create function t.vq(a int, b int default 0) returns extensions.vector language sql immutable as $$
  select ('[' || (select string_agg(case when i = a or i = b then '1' else '0' end, ',' order by i) from generate_series(1, 1024) i) || ']')::extensions.vector $$;

create function t.fid(p text) returns uuid language sql security definer as $$
  select id from conhecimento.cad_fonte where empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001' and titulo like p order by titulo limit 1 $$;
grant execute on function t.fid(text) to public;
grant execute on all functions in schema t to public;

select t.chk('extensão vector instalada', (select count(*) from pg_extension where extname = 'vector') = 1);
select t.chk('tela conhecimento ativa e aplicada também no banco', (select situacao || aplicacao from crm.cad_tela where tela = 'conhecimento') = 'ativatela_e_banco');
select t.chk('coluna vetor tem 1024 dimensões', (select atttypmod from pg_attribute where attrelid = 'conhecimento.mov_chunk'::regclass and attname = 'embedding') = 1024);

select t.chk('cria fonte 1 com 2 trechos', (t.val('', '', $$t.gravar({E}, 'Regras da reserva na live', array['A reserva de uma peça expira em 15 minutos depois do envio do link de pagamento.', 'Se o pagamento não for confirmado, a peça volta para a fila de espera e o próximo cliente é avisado.'])$$)::jsonb ->> 'estado') = 'criada');
select t.chk('cria fonte 2', (t.val('', '', $$t.gravar({E}, 'Política de frete e envio', array['O frete é calculado pelo CEP e o código de rastreamento é enviado ao cliente após a expedição.'])$$)::jsonb ->> 'trechos') = '1');
select t.chk('cria fonte 3', (t.val('', '', $$t.gravar({E}, 'Política de devolução', array['A devolução de peças exige solicitação em até 7 dias após o recebimento e a peça deve estar sem uso.'])$$)::jsonb ->> 'estado') = 'criada');
select t.chk('mesma fonte em outra empresa é independente', (t.val('', '', $$t.gravar({O}, 'Regras da reserva na live', array['Na outra empresa a reserva dura 99 minutos e o brinde sai grátis.'])$$)::jsonb ->> 'estado') = 'criada');
select t.chk('4 trechos pendentes na empresa E', (select count(*) from conhecimento.mov_chunk where empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001' and embedding_status = 'pending') = 4);
select t.chk('mesmo conteúdo = sem mudança', (t.val('', '', $$t.gravar({E}, 'Política de devolução', array['A devolução de peças exige solicitação em até 7 dias após o recebimento e a peça deve estar sem uso.'])$$)::jsonb ->> 'estado') = 'sem_mudanca');
select t.chk('"(1).pdf" e extensão contam como a mesma fonte', (t.val('', '', $$t.gravar({E}, 'POLÍTICA DE DEVOLUÇÃO (1).pdf', array['A devolução de peças exige solicitação em até 7 dias após o recebimento e a peça deve estar sem uso.'])$$)::jsonb ->> 'estado') = 'sem_mudanca');
select t.chk('continuam 3 fontes na empresa E', (select count(*) from conhecimento.cad_fonte where empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 3);
select t.chk('fila de serviço lista os 4 pendentes', jsonb_array_length(api.svc_chunks_pendentes('aaaaaaaa-0000-0000-0000-000000000001', 32)) = 4);
select t.chk('texto do pendente leva título e conteúdo', (api.svc_chunks_pendentes('aaaaaaaa-0000-0000-0000-000000000001', 1) -> 0 ->> 'texto') like '% ' || '%' and (api.svc_chunks_pendentes('aaaaaaaa-0000-0000-0000-000000000001', 1) -> 0 ->> 'texto') like '%' || E'\n' || '%');
select t.chk('limite da fila é respeitado', jsonb_array_length(api.svc_chunks_pendentes('aaaaaaaa-0000-0000-0000-000000000001', 2)) = 2);

select t.erro('tipo inválido', '', '', $$select api.svc_gravar_fonte({E}, 'x', 'tipo_x', 'baixa', null, 'texto', repeat('a', 64), t.ch(array['texto']), '{}', null)$$, '22023');
select t.erro('sensibilidade inválida', '', '', $$select api.svc_gravar_fonte({E}, 'x', 'documento', 'zzz', null, 'texto', repeat('a', 64), t.ch(array['texto']), '{}', null)$$, '22023');
select t.erro('hash curto', '', '', $$select api.svc_gravar_fonte({E}, 'x', 'documento', 'baixa', null, 'texto', 'abc', t.ch(array['texto']), '{}', null)$$, '22023');
select t.erro('título vazio', '', '', $$select api.svc_gravar_fonte({E}, '  ', 'documento', 'baixa', null, 'texto', repeat('a', 64), t.ch(array['texto']), '{}', null)$$, '22023');
select t.erro('título só de símbolos', '', '', $$select api.svc_gravar_fonte({E}, '!!!', 'documento', 'baixa', null, 'texto', repeat('a', 64), t.ch(array['texto']), '{}', null)$$, '22023');
select t.erro('texto vazio', '', '', $$select api.svc_gravar_fonte({E}, 'x', 'documento', 'baixa', null, '', repeat('a', 64), t.ch(array['texto']), '{}', null)$$, '22023');
select t.erro('sem trechos', '', '', $$select api.svc_gravar_fonte({E}, 'x', 'documento', 'baixa', null, 'texto', repeat('a', 64), '[]', '{}', null)$$, '22023');
select t.erro('trecho grande demais', '', '', $$select api.svc_gravar_fonte({E}, 'x', 'documento', 'baixa', null, 'texto', repeat('a', 64), t.ch(array[repeat('a', 8001)]), '{}', null)$$, '22023');
select t.erro('índices repetidos', '', '', $$select api.svc_gravar_fonte({E}, 'x', 'documento', 'baixa', null, 'texto', repeat('a', 64), jsonb_build_array(t.ch(array['um'])->0, t.ch(array['dois'])->0), '{}', null)$$, '22023');
select t.erro('empresa inexistente', '', '', $$select api.svc_gravar_fonte('99999999-0000-0000-0000-000000000009', 'x', 'documento', 'baixa', null, 'texto', repeat('a', 64), t.ch(array['texto']), '{}', null)$$, 'P0002');
select t.chk('nada foi gravado pelas chamadas inválidas', (select count(*) from conhecimento.cad_fonte) = 4);

select t.chk('"quanto tempo dura a reserva" acha a fonte da reserva', t.val('authenticated', 'a1', $$(select fonte_titulo from api.buscar_conhecimento_texto({E}, 'quanto tempo dura a reserva', 5) limit 1)$$) = 'Regras da reserva na live');
select t.chk('sem acento acha com acento (devolucao)', t.val('authenticated', 'a1', $$(select fonte_titulo from api.buscar_conhecimento_texto({E}, 'devolucao', 5) limit 1)$$) = 'Política de devolução');
select t.chk('com acento acha o mesmo (devolução)', t.val('authenticated', 'a1', $$(select fonte_titulo from api.buscar_conhecimento_texto({E}, 'devolução', 5) limit 1)$$) = 'Política de devolução');
select t.chk('prefixo de palavra longa (rastreament)', t.val('authenticated', 'a1', $$(select fonte_titulo from api.buscar_conhecimento_texto({E}, 'rastreament', 5) limit 1)$$) = 'Política de frete e envio');
select t.chk('pergunta longa casa por qualquer termo', t.val('authenticated', 'a1', $$(select fonte_titulo from api.buscar_conhecimento_texto({E}, 'o cliente pergunta quando recebe o código de rastreamento do pedido enviado pela loja', 5) limit 1)$$) = 'Política de frete e envio');
select t.chk('só palavras vazias não devolve nada', t.val('authenticated', 'a1', $$(select count(*) from api.buscar_conhecimento_texto({E}, 'o que é isso e como', 5))$$) = '0');
select t.chk('consulta vazia não devolve nada', t.val('authenticated', 'a1', $$(select count(*) from api.buscar_conhecimento_texto({E}, '', 5))$$) = '0');
select t.chk('termo inexistente não devolve nada', t.val('authenticated', 'a1', $$(select count(*) from api.buscar_conhecimento_texto({E}, 'xyzqwerty', 5))$$) = '0');
select t.chk('aspas e símbolos na pergunta não quebram', t.val('authenticated', 'a1', $$(select count(*) from api.buscar_conhecimento_texto({E}, $q$'); drop table x; -- & | ! ( ) : * reserva$q$, 5))$$) >= '0');
select t.chk('não vaza a outra empresa (brinde/99 minutos)', t.val('authenticated', 'a1', $$(select count(*) from api.buscar_conhecimento_texto({E}, 'brinde grátis 99 minutos', 5) where conteudo like '%brinde%')$$) = '0');
select t.chk('a outra empresa só enxerga o dela', t.val('authenticated', 'a4', $$(select count(*) from api.buscar_conhecimento_texto({O}, 'brinde grátis', 5))$$) = '1');
select t.chk('limite é aplicado', t.val('authenticated', 'a1', $$(select count(*) from api.buscar_conhecimento_texto({E}, 'reserva peça cliente frete devolução', 2))$$) = '2');
select t.chk('suporte pode buscar', t.val('authenticated', 'a5', $$(select count(*) from api.buscar_conhecimento_texto({E}, 'reserva', 5))$$) >= '1');
select t.erro('leitura não busca', 'authenticated', 'a3', $$select * from api.buscar_conhecimento_texto({E}, 'reserva', 5)$$, '42501');
select t.erro('admin de outra empresa não busca aqui', 'authenticated', 'a4', $$select * from api.buscar_conhecimento_texto({E}, 'reserva', 5)$$, '42501');
select t.erro('anon não busca', 'anon', '', $$select * from api.buscar_conhecimento_texto({E}, 'reserva', 5)$$, '42501');

select t.erro('suporte (só ver) não desativa', 'authenticated', 'a5', $$select api.alternar_fonte({E}, t.fid('Regras%'), false)$$, '42501');
select t.erro('admin de outra empresa não desativa', 'authenticated', 'a4', $$select api.alternar_fonte({E}, t.fid('Regras%'), false)$$, '42501');
select t.run('authenticated', 'a2', $$select api.alternar_fonte({E}, t.fid('Regras%'), false)$$);
select t.chk('fonte desativada some da busca', (select count(*) from conhecimento.mov_chunk where fonte_id = (select id from conhecimento.cad_fonte where empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001' and titulo like 'Regras%') and ativo) = 0
  and t.val('authenticated', 'a1', $$(select count(*) from api.buscar_conhecimento_texto({E}, 'reserva expira minutos', 5))$$) = '0');
select t.run('authenticated', 'a2', $$select api.alternar_fonte({E}, t.fid('Regras%'), true)$$);
select t.chk('reativada volta a ser encontrada', t.val('authenticated', 'a1', $$(select count(*) from api.buscar_conhecimento_texto({E}, 'reserva expira minutos', 5))$$) >= '1');
select t.erro('fonte inexistente', 'authenticated', 'a2', $$select api.alternar_fonte({E}, '99999999-0000-0000-0000-000000000009', true)$$, 'P0002');
select t.erro('valor nulo', 'authenticated', 'a2', $$select api.alternar_fonte({E}, t.fid('%'), null)$$, '22023');

select t.chk('4 vetores gravados', api.svc_gravar_vetores((select jsonb_agg(jsonb_build_object('id', x.id, 'embedding', t.vec(x.rn::int)) order by x.rn)
    from (select c.id, row_number() over (order by f.titulo, c.chunk_index) rn from conhecimento.mov_chunk c join conhecimento.cad_fonte f on f.id = c.fonte_id
           where c.empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001') x), 'voyage-4') = 4);
select t.chk('todos prontos com o modelo gravado', (select count(*) from conhecimento.mov_chunk where empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001' and embedding_status = 'ready' and embedding_model = 'voyage-4') = 4);
select t.chk('fila vazia depois dos vetores', jsonb_array_length(api.svc_chunks_pendentes('aaaaaaaa-0000-0000-0000-000000000001', 32)) = 0);
select t.chk('busca vetorial acha o trecho exato (devolução)', t.val('authenticated', 'a1', $$(select fonte_titulo from api.buscar_conhecimento_vetor({E}, t.vq(1), 'voyage-4', 5) limit 1)$$) = 'Política de devolução');
select t.chk('similaridade 1 para vetor idêntico', t.val('authenticated', 'a1', $$(select round(score::numeric, 3) from api.buscar_conhecimento_vetor({E}, t.vq(2), 'voyage-4', 5) limit 1)$$) = '1.000');
select t.chk('vetor misto traz os dois trechos próximos', t.val('authenticated', 'a1', $$(select count(*) from api.buscar_conhecimento_vetor({E}, t.vq(1, 2), 'voyage-4', 5))$$) = '2');
select t.chk('similaridade mínima corta (0,8)', t.val('authenticated', 'a1', $$(select count(*) from api.buscar_conhecimento_vetor({E}, t.vq(1, 2), 'voyage-4', 5, 0.8))$$) = '0');
select t.chk('modelo diferente não compara', t.val('authenticated', 'a1', $$(select count(*) from api.buscar_conhecimento_vetor({E}, t.vq(1), 'voyage-3', 5))$$) = '0');
select t.chk('não vaza a outra empresa no vetor', t.val('authenticated', 'a4', $$(select count(*) from api.buscar_conhecimento_vetor({O}, t.vq(1), 'voyage-4', 5))$$) = '0');
select t.erro('vetor com tamanho errado', 'authenticated', 'a1', $$select * from api.buscar_conhecimento_vetor({E}, '[1,2,3]'::extensions.vector, 'voyage-4', 5)$$, '22023');
select t.erro('modelo vazio', 'authenticated', 'a1', $$select * from api.buscar_conhecimento_vetor({E}, t.vq(1), '', 5)$$, '22023');
select t.erro('leitura não faz busca vetorial', 'authenticated', 'a3', $$select * from api.buscar_conhecimento_vetor({E}, t.vq(1), 'voyage-4', 5)$$, '42501');
select t.erro('anon não faz busca vetorial', 'anon', '', $$select * from api.buscar_conhecimento_vetor({E}, t.vq(1), 'voyage-4', 5)$$, '42501');
select t.run('', '', $$select api.svc_gravar_vetores(jsonb_build_array(jsonb_build_object('id', (select id from conhecimento.mov_chunk where empresa_id = {O} limit 1), 'embedding', '[1,2,3]'::jsonb)), 'voyage-4')$$);
select t.chk('vetor de tamanho errado marca falha e não grava', (select embedding_status || embedding_tentativas::text || coalesce(embedding_model, '-') from conhecimento.mov_chunk where empresa_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 'failed1-');
select t.erro('modelo inválido na gravação', '', '', $$select api.svc_gravar_vetores('[]', 'modelo com espaço')$$, '22023');

select t.run('', '', $$select t.gravar({E}, 'Regras da reserva na live', array['A reserva de uma peça expira em 15 minutos depois do envio do link de pagamento.', 'Agora a reserva expira em 20 minutos para peças de live.'])$$);
select t.chk('atualização: 1 trecho reaproveitado (pronto), 1 novo pendente',
  (select count(*) from conhecimento.mov_chunk where fonte_id = t.fid('Regras%') and embedding_status = 'ready' and embedding_model = 'voyage-4') = 1
  and (select count(*) from conhecimento.mov_chunk where fonte_id = t.fid('Regras%') and embedding_status = 'pending') = 1);
select t.chk('versão 2, trechos antigos removidos, texto antigo apagado',
  (select versao from conhecimento.mov_versao v join conhecimento.cad_fonte f on f.versao_atual_id = v.id where f.empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001' and f.titulo like 'Regras%') = 2
  and (select count(*) from conhecimento.mov_chunk where fonte_id = (select id from conhecimento.cad_fonte where empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001' and titulo like 'Regras%')) = 2
  and (select texto from conhecimento.mov_versao where fonte_id = (select id from conhecimento.cad_fonte where empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001' and titulo like 'Regras%') and versao = 1) is null);
select t.chk('busca já acha o texto novo (20 minutos)', t.val('authenticated', 'a1', $$(select count(*) from api.buscar_conhecimento_texto({E}, 'expira 20 minutos', 5))$$) >= '1');

select t.run('', '', $$select api.svc_marcar_falha_chunks((select array_agg(id) from conhecimento.mov_chunk where embedding_status = 'pending' and empresa_id = {E}), '429 rate limit', false)$$);
select t.chk('cota: continua pendente, sem tentativa gasta, erro registrado', (select count(*) from conhecimento.mov_chunk where embedding_status = 'pending' and embedding_tentativas = 0 and embedding_erro like '429%') = 1);
select t.run('', '', $$select api.svc_marcar_falha_chunks((select array_agg(id) from conhecimento.mov_chunk where embedding_status = 'pending' and empresa_id = {E}), 'modelo inválido', true)$$);
select t.chk('erro real: failed com 1 tentativa e ainda na fila', (select count(*) from conhecimento.mov_chunk where embedding_status = 'failed' and embedding_tentativas = 1 and empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1
  and jsonb_array_length(api.svc_chunks_pendentes('aaaaaaaa-0000-0000-0000-000000000001', 32)) = 1);
select t.run('', '', $$select api.svc_marcar_falha_chunks((select array_agg(id) from conhecimento.mov_chunk where embedding_status = 'failed' and empresa_id = {E}), 'modelo inválido', true) from generate_series(1, 4)$$);
select t.chk('5 tentativas esgotam: sai da fila', (select count(*) from conhecimento.mov_chunk where embedding_status = 'failed' and embedding_tentativas = 5 and empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1
  and jsonb_array_length(api.svc_chunks_pendentes('aaaaaaaa-0000-0000-0000-000000000001', 32)) = 0);
select t.chk('painel enxerga 1 falho e o último erro', t.val('authenticated', 'a1', $$api.listar_fontes({E}) -> 'resumo' ->> 'falhos'$$) = '1'
  and t.val('authenticated', 'a1', $$api.listar_fontes({E}) -> 'resumo' ->> 'ultimo_erro'$$) = 'modelo inválido');
select t.run('', '', $$select api.svc_preparar_fila({E}, 'voyage-4', true)$$);
select t.chk('reabrir falhas devolve à fila', (select count(*) from conhecimento.mov_chunk where empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001' and embedding_status = 'failed') = 0
  and jsonb_array_length(api.svc_chunks_pendentes('aaaaaaaa-0000-0000-0000-000000000001', 32)) = 1);
select t.run('', '', $$select api.svc_preparar_fila({E}, 'voyage-5', false)$$);
select t.chk('trocar de modelo descarta os vetores antigos e recoloca na fila', (select count(*) from conhecimento.mov_chunk where empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001' and embedding is not null) = 0
  and jsonb_array_length(api.svc_chunks_pendentes('aaaaaaaa-0000-0000-0000-000000000001', 32)) = 4);
select t.chk('texto continua pesquisável sem nenhum vetor', t.val('authenticated', 'a1', $$(select count(*) from api.buscar_conhecimento_texto({E}, 'devolucao', 5))$$) = '1');
select t.chk('outra empresa não foi tocada pela troca', (select count(*) from conhecimento.mov_chunk where empresa_id = 'bbbbbbbb-0000-0000-0000-000000000002' and embedding_status = 'failed') = 1);

select t.chk('listar_fontes: resumo e fontes', t.val('authenticated', 'a1', $$api.listar_fontes({E}) -> 'resumo' ->> 'fontes'$$) = '3'
  and t.val('authenticated', 'a1', $$api.listar_fontes({E}) -> 'resumo' ->> 'trechos'$$) = '4' and t.val('authenticated', 'a1', $$jsonb_array_length(api.listar_fontes({E}) -> 'fontes')$$) = '3');
select t.chk('suporte lista (ver)', t.val('authenticated', 'a5', $$api.listar_fontes({E}) -> 'resumo' ->> 'fontes'$$) = '3');
select t.erro('leitura não lista (padrão)', 'authenticated', 'a3', $$select api.listar_fontes({E})$$, '42501');
select t.run('authenticated', 'a1', $$select api.salvar_permissoes({E}, '[{"tela":"conhecimento","papel":"leitura","nivel":"ver"}]')$$);
select t.chk('a matriz vale no banco: leitura liberada passa a listar', t.val('authenticated', 'a3', $$api.listar_fontes({E}) -> 'resumo' ->> 'fontes'$$) = '3');
select t.erro('liberada só para ver: continua sem alterar', 'authenticated', 'a3', $$select api.alternar_fonte({E}, t.fid('%'), false)$$, '42501');
select t.erro('admin de outra empresa não lista', 'authenticated', 'a4', $$select api.listar_fontes({E})$$, '42501');
select t.erro('anon não lista', 'anon', '', $$select api.listar_fontes({E})$$, '42501');

select t.run('', '', $$select api.svc_registrar_recuperacao({E}, null, repeat('p', 600), 'hybrid', array(select id from conhecimento.mov_chunk limit 2), 42)$$);
select t.chk('log guarda a pergunta truncada em 500', (select length(pergunta) from conhecimento.log_recuperacao) = 500);
select t.erro('modo inválido no log', '', '', $$select api.svc_registrar_recuperacao({E}, null, 'p', 'xx', '{}', 1)$$, '23514');

select t.erro('authenticated não executa gravar_fonte', 'authenticated', 'a1', $$select api.svc_gravar_fonte({E}, 'x', 'documento', 'baixa', null, 'texto', repeat('a', 64), t.ch(array['texto']), '{}', null)$$, '42501');
select t.erro('authenticated não executa chunks_pendentes', 'authenticated', 'a1', $$select api.svc_chunks_pendentes({E}, 5)$$, '42501');
select t.erro('authenticated não executa gravar_vetores', 'authenticated', 'a1', $$select api.svc_gravar_vetores('[]', 'voyage-4')$$, '42501');
select t.erro('authenticated não executa preparar_fila', 'authenticated', 'a1', $$select api.svc_preparar_fila({E}, 'voyage-4', false)$$, '42501');
select t.erro('anon não executa gravar_fonte', 'anon', '', $$select api.svc_gravar_fonte({E}, 'x', 'documento', 'baixa', null, 'texto', repeat('a', 64), t.ch(array['texto']), '{}', null)$$, '42501');
select t.erro('authenticated não lê trechos direto', 'authenticated', 'a1', $$select * from conhecimento.mov_chunk$$, '42501');
select t.erro('authenticated não lê fontes direto', 'authenticated', 'a1', $$select * from conhecimento.cad_fonte$$, '42501');
select t.erro('authenticated não lê o log direto', 'authenticated', 'a1', $$select * from conhecimento.log_recuperacao$$, '42501');
select t.erro('authenticated não executa norm()', 'authenticated', 'a1', $$select conhecimento.norm('x')$$, '42501');
select t.erro('authenticated não executa _exigir', 'authenticated', 'a1', $$select conhecimento._exigir({E}, 'ver', array['conhecimento'])$$, '42501');
select t.chk('RLS ligada nas 4 tabelas', (select count(*) from pg_class where relnamespace = 'conhecimento'::regnamespace and relkind = 'r' and relrowsecurity) = 4);


-- 0023: histórico pessoal e tela Assistente
select t.chk('tela assistente ativa; conhecimento vai para Configuração', (select situacao from crm.cad_tela where tela = 'assistente') = 'ativa'
  and (select grupo from crm.cad_tela where tela = 'conhecimento') = 'Configuração');
select t.run('', '', $$select api.svc_registrar_recuperacao({E}, '00000000-0000-0000-0000-0000000000a1', 'Quanto tempo dura a reserva?', 'text', '{}', 5)$$);
select t.run('', '', $$select api.svc_registrar_recuperacao({E}, '00000000-0000-0000-0000-0000000000a1', 'quanto tempo dura a RESERVA?', 'hybrid', '{}', 5)$$);
select t.run('', '', $$select api.svc_registrar_recuperacao({E}, '00000000-0000-0000-0000-0000000000a1', 'Pedido sem nota fiscal', 'text', '{}', 5)$$);
select t.run('', '', $$select api.svc_registrar_recuperacao({E}, '00000000-0000-0000-0000-0000000000a2', 'pergunta do gestor', 'text', '{}', 5)$$);
select t.chk('histórico do a1: 2 perguntas distintas, mais recente primeiro', t.val('authenticated', 'a1', $$jsonb_array_length(api.historico_perguntas({E}))$$) = '2'
  and t.val('authenticated', 'a1', $$api.historico_perguntas({E}) -> 0 ->> 'pergunta'$$) = 'Pedido sem nota fiscal');
select t.chk('repetição (caixa diferente) fica com a versão mais recente', t.val('authenticated', 'a1', $$api.historico_perguntas({E}) -> 1 ->> 'pergunta'$$) = 'quanto tempo dura a RESERVA?');
select t.chk('histórico é pessoal: a2 vê só a dele', t.val('authenticated', 'a2', $$jsonb_array_length(api.historico_perguntas({E}))$$) = '1'
  and t.val('authenticated', 'a2', $$api.historico_perguntas({E}) -> 0 ->> 'pergunta'$$) = 'pergunta do gestor');
select t.chk('limite do histórico é respeitado', t.val('authenticated', 'a1', $$jsonb_array_length(api.historico_perguntas({E}, 1))$$) = '1');
select t.chk('suporte (assistente em ver) tem histórico vazio, sem erro', t.val('authenticated', 'a5', $$jsonb_array_length(api.historico_perguntas({E}))$$) = '0');
select t.erro('expedição sem permissão não lê histórico', 'authenticated', 'a6', $$select api.historico_perguntas({E})$$, '42501');
select t.erro('admin de outra empresa não lê histórico', 'authenticated', 'a4', $$select api.historico_perguntas({E})$$, '42501');
select t.erro('anon não lê histórico', 'anon', '', $$select api.historico_perguntas({E})$$, '42501');
select t.erro('anon não limpa histórico', 'anon', '', $$select api.limpar_historico_perguntas({E})$$, '42501');
select t.chk('limpar remove só as perguntas do próprio usuário', t.val('authenticated', 'a1', $$api.limpar_historico_perguntas({E})$$) = '3'
  and t.val('authenticated', 'a1', $$jsonb_array_length(api.historico_perguntas({E}))$$) = '0'
  and t.val('authenticated', 'a2', $$jsonb_array_length(api.historico_perguntas({E}))$$) = '1');
select t.erro('service_role não executa o histórico do painel', 'service_role', '', $$select api.historico_perguntas({E})$$, '42501');

select 'total: '||count(*)||'  passou: '||count(*) filter (where ok)||'  falhou: '||count(*) filter (where not ok) from t.resultado;
select 'FAIL: '||nome from t.resultado where not ok order by n;
