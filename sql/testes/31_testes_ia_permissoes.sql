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
grant execute on all functions in schema t to public;

-- 0. aplica a migration (precisa passar inteira)
\i ../0014_ia_assistente_permissoes.sql
\i ../0019_ia_base_url.sql

-- 1. semeadura e provisionamento
select t.chk('ia_chat e ia_embedding semeados nas 2 empresas', (select count(*) from engine.cfg_integracao where integracao in ('ia_chat','ia_embedding')) = 4);
select t.chk('assistente com padrões 90 / ligado / ligado / consentimento',
  (select count(*) from engine.cfg_assistente where retencao_dias = 90 and usar_whatsapp and usar_instagram_dm and exigir_consentimento) = 2);
select t.chk('catálogo com 26 telas (7 ativas)', (select count(*) from crm.cad_tela) = 26 and (select count(*) from crm.cad_tela where situacao = 'ativa') = 7);
select t.chk('matriz completa: telas x 6 papéis por empresa',
  (select count(*) from crm.cfg_permissao_tela where empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 26 * 6
  and (select count(*) from crm.cfg_permissao_tela where empresa_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 26 * 6);
select t.chk('permissoes e usuarios nunca liberados por padrão',
  (select count(*) from crm.cfg_permissao_tela where tela in ('permissoes','usuarios') and nivel <> 'nenhum') = 0);
select t.chk('nenhum padrão acima do máximo da tela',
  (select count(*) from crm.cfg_permissao_tela p join crm.cad_tela c using (tela) where crm._rank_nivel(p.nivel) > crm._rank_nivel(c.nivel_max)) = 0);
select crm.provisionar_empresa('aaaaaaaa-0000-0000-0000-000000000001');
select t.chk('provisionar_empresa idempotente', (select count(*) from engine.cfg_integracao where empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 9
  and (select count(*) from crm.cfg_permissao_tela where empresa_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 156);
insert into crm.cad_empresa (id, razao_social) values ('cccccccc-0000-0000-0000-000000000003','Nova');
select crm.provisionar_empresa('cccccccc-0000-0000-0000-000000000003');
select t.chk('empresa nova nasce com 9 integrações, assistente e matriz',
  (select count(*) from engine.cfg_integracao where empresa_id = 'cccccccc-0000-0000-0000-000000000003') = 9
  and (select count(*) from engine.cfg_assistente where empresa_id = 'cccccccc-0000-0000-0000-000000000003') = 1
  and (select count(*) from crm.cfg_permissao_tela where empresa_id = 'cccccccc-0000-0000-0000-000000000003') = 156);

-- 2. integrações de IA: parâmetros
select t.run('authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"provedor":"google_gemini","modelo":"gemini-3.8-flash"}')$$);
select t.chk('ia_chat guarda provedor e modelo', (select parametros->>'provedor' || '|' || (parametros->>'modelo') from engine.cfg_integracao where empresa_id='aaaaaaaa-0000-0000-0000-000000000001' and integracao='ia_chat') = 'google_gemini|gemini-3.8-flash');
select t.chk('ia_chat fica configurada e desligada', (select status || modo from engine.cfg_integracao where empresa_id='aaaaaaaa-0000-0000-0000-000000000001' and integracao='ia_chat') = 'configuradadesligado');
select t.run('authenticated','a1',$$select api.salvar_integracao({E},'ia_embedding','{"provedor":"voyage","modelo":"voyage-4"}')$$);
select t.chk('ia_embedding guarda voyage', (select parametros->>'provedor' from engine.cfg_integracao where empresa_id='aaaaaaaa-0000-0000-0000-000000000001' and integracao='ia_embedding') = 'voyage');
select t.run('authenticated','a1',$$select api.salvar_integracao({E},'ia_embedding','{"provedor":"google_gemini","modelo":"gemini-embedding-001"}')$$);
select t.erro('ia_chat recusa provedor fora da lista','authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"provedor":"openai"}')$$,'22023');
select t.erro('ia_embedding recusa provedor fora da lista','authenticated','a1',$$select api.salvar_integracao({E},'ia_embedding','{"provedor":"cohere"}')$$,'22023');
select t.erro('modelo com barra é recusado','authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"modelo":"a/b"}')$$,'22023');
select t.erro('modelo com ../ é recusado','authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"modelo":"../x"}')$$,'22023');
select t.erro('modelo com espaço é recusado','authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"modelo":"a b"}')$$,'22023');
select t.erro('chave de API não entra como parâmetro','authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"api_key":"x"}')$$,'22023');
select t.erro('URL base fora da lista é recusada','authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"base_url":"https://x"}')$$,'22023');
select t.erro('URL base http é recusada','authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"base_url":"http://generativelanguage.googleapis.com/v1beta"}')$$,'22023');
select t.erro('URL base com host disfarçado é recusada','authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"base_url":"https://generativelanguage.googleapis.com.evil.com/v1beta"}')$$,'22023');
select t.erro('URL base com usuário@ é recusada','authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"base_url":"https://generativelanguage.googleapis.com@evil.com/x"}')$$,'22023');
select t.erro('URL base com .. é recusada','authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"base_url":"https://generativelanguage.googleapis.com/v1beta/../x"}')$$,'22023');
select t.erro('URL base com porta é recusada','authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"base_url":"https://generativelanguage.googleapis.com:8443/v1beta"}')$$,'22023');
select t.erro('Voyage não vale como URL de resposta','authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"base_url":"https://api.voyageai.com/v1"}')$$,'22023');
select t.erro('Vertex não vale como URL de vetor','authenticated','a1',$$select api.salvar_integracao({E},'ia_embedding','{"base_url":"https://aiplatform.googleapis.com/v1/publishers/google"}')$$,'22023');
select t.erro('gestor não salva URL base','authenticated','a2',$$select api.salvar_integracao({E},'ia_chat','{"base_url":"https://generativelanguage.googleapis.com/v1beta"}')$$,'42501');
select t.run('authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"base_url":"https://aiplatform.googleapis.com/v1/publishers/google/"}')$$);
select t.chk('Vertex aceita e a barra final é removida', (select parametros->>'base_url' from engine.cfg_integracao where empresa_id='aaaaaaaa-0000-0000-0000-000000000001' and integracao='ia_chat') = 'https://aiplatform.googleapis.com/v1/publishers/google');
select t.run('authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"base_url":"https://generativelanguage.googleapis.com/v1beta"}')$$);
select t.chk('AI Studio aceita', (select parametros->>'base_url' from engine.cfg_integracao where empresa_id='aaaaaaaa-0000-0000-0000-000000000001' and integracao='ia_chat') = 'https://generativelanguage.googleapis.com/v1beta');
select t.run('authenticated','a1',$$select api.salvar_integracao({E},'ia_chat','{"base_url":""}')$$);
select t.chk('URL em branco remove o campo', not ((select parametros from engine.cfg_integracao where empresa_id='aaaaaaaa-0000-0000-0000-000000000001' and integracao='ia_chat') ? 'base_url'));
select t.run('authenticated','a1',$$select api.salvar_integracao({E},'ia_embedding','{"provedor":"voyage","base_url":"https://api.voyageai.com/v1"}')$$);
select t.chk('Voyage aceita como URL de vetor', (select parametros->>'base_url' from engine.cfg_integracao where empresa_id='aaaaaaaa-0000-0000-0000-000000000001' and integracao='ia_embedding') = 'https://api.voyageai.com/v1');
select t.erro('bling não aceita base_url','authenticated','a1',$$select api.salvar_integracao({E},'bling','{"base_url":"https://generativelanguage.googleapis.com"}')$$,'22023');
select t.erro('gestor não salva IA','authenticated','a2',$$select api.salvar_integracao({E},'ia_chat','{"modelo":"x"}')$$,'42501');
select t.erro('admin de outra empresa não salva IA aqui','authenticated','a4',$$select api.salvar_integracao({E},'ia_chat','{"modelo":"x"}')$$,'42501');
select t.run('authenticated','a1',$$select api.salvar_integracao({E},'bling','{"client_id":"abc","empresa_id_bling":"123"}')$$);
select t.chk('bling continua funcionando na função substituída', (select parametros->>'client_id' from engine.cfg_integracao where empresa_id='aaaaaaaa-0000-0000-0000-000000000001' and integracao='bling') = 'abc'
  and (select bling_empresa_id_esperado from crm.cad_empresa where id='aaaaaaaa-0000-0000-0000-000000000001') = '123');
select t.erro('bling recusa ID com símbolo','authenticated','a1',$$select api.salvar_integracao({E},'bling','{"empresa_id_bling":"x!"}')$$,'22023');
select t.erro('nfe continua não configurável','authenticated','a1',$$select api.salvar_integracao({E},'nfe','{"a":"b"}')$$,'22023');

-- 3. chaves de IA (Vault): só o serviço grava; o painel só pela função de segredo
select t.chk('admin grava api_key da IA de resposta', t.val('authenticated','a1',$$api.pode_gravar_segredo_painel({E},'ia_chat','api_key')$$) = 'true');
select t.chk('admin grava api_key da IA de vetor', t.val('authenticated','a1',$$api.pode_gravar_segredo_painel({E},'ia_embedding','api_key')$$) = 'true');
select t.chk('admin NÃO grava outro nome de segredo da IA', t.val('authenticated','a1',$$api.pode_gravar_segredo_painel({E},'ia_chat','access_token')$$) = 'false');
select t.chk('gestor NÃO grava a chave da IA', t.val('authenticated','a2',$$api.pode_gravar_segredo_painel({E},'ia_chat','api_key')$$) = 'false');
select t.erro('authenticated não executa svc_gravar_segredo','authenticated','a1',$$select api.svc_gravar_segredo({E},'ia_chat','api_key','GEMINI-CHAVE')$$,'42501');
select t.run('service_role','',$$select api.svc_gravar_segredo({E},'ia_chat','api_key','GEMINI-CHAVE-1')$$);
select t.run('service_role','',$$select api.svc_gravar_segredo({E},'ia_embedding','api_key','VOYAGE-CHAVE-1')$$);
select t.chk('duas chaves no cofre, separadas', (select count(*) from vault.secrets where secret in ('GEMINI-CHAVE-1','VOYAGE-CHAVE-1')) = 2
  and (select count(*) from private.cad_credencial where nome in ('ia_chat.api_key','ia_embedding.api_key')) = 2);
select t.chk('gravar a chave derruba o modo e o teste', (select status || modo from engine.cfg_integracao where empresa_id='aaaaaaaa-0000-0000-0000-000000000001' and integracao='ia_chat') = 'configuradadesligado');
select t.run('service_role','',$$select api.svc_gravar_segredo({E},'ia_chat','api_key','GEMINI-CHAVE-2')$$);
select t.chk('trocar a chave mantém 1 linha, sobe a versão e não deixa órfão',
  (select versao from private.cad_credencial where empresa_id='aaaaaaaa-0000-0000-0000-000000000001' and nome='ia_chat.api_key') = 2
  and (select count(*) from vault.secrets) = 2);
select t.erro('svc recusa segredo fora da lista da IA','service_role','',$$select api.svc_gravar_segredo({E},'ia_chat','refresh_token','x')$$,'22023');
select t.chk('auditoria não guarda o valor da chave', (select count(*) from audit.log_alteracao where dados_depois::text like '%GEMINI-CHAVE%' or dados_depois::text like '%VOYAGE-CHAVE%') = 0);

-- 4. configuração do assistente
select t.chk('admin lê os padrões do assistente', t.val('authenticated','a1',$$api.obter_config_assistente({E})->>'retencao_dias'$$) = '90'
  and t.val('authenticated','a1',$$api.obter_config_assistente({E})->>'usar_whatsapp'$$) = 'true'
  and t.val('authenticated','a1',$$api.obter_config_assistente({E})->>'usar_instagram_dm'$$) = 'true'
  and t.val('authenticated','a1',$$api.obter_config_assistente({E})->>'exigir_consentimento'$$) = 'true');
select t.chk('gestor também lê', t.val('authenticated','a2',$$api.obter_config_assistente({E})->>'retencao_dias'$$) = '90');
select t.erro('leitura não lê','authenticated','a3','select api.obter_config_assistente({E})','42501');
select t.erro('admin de outra empresa não lê','authenticated','a4','select api.obter_config_assistente({E})','42501');
select t.erro('anon não lê','anon','','select api.obter_config_assistente({E})','42501');
select t.run('authenticated','a1',$$select api.salvar_config_assistente({E},'{"retencao_dias":120,"usar_whatsapp":false}')$$);
select t.chk('retenção e WhatsApp salvos', (select retencao_dias::text || usar_whatsapp::text from engine.cfg_assistente where empresa_id='aaaaaaaa-0000-0000-0000-000000000001') = '120false');
select t.chk('campos não enviados ficam como estavam', (select usar_instagram_dm and exigir_consentimento from engine.cfg_assistente where empresa_id='aaaaaaaa-0000-0000-0000-000000000001'));
select t.chk('outra empresa não mudou', (select retencao_dias = 90 and usar_whatsapp from engine.cfg_assistente where empresa_id='bbbbbbbb-0000-0000-0000-000000000002'));
select t.run('authenticated','a1',$$select api.salvar_config_assistente({E},'{"usar_whatsapp":true,"retencao_dias":7}')$$);
select t.chk('limite inferior de 7 dias aceito', (select retencao_dias from engine.cfg_assistente where empresa_id='aaaaaaaa-0000-0000-0000-000000000001') = 7);
select t.run('authenticated','a1',$$select api.salvar_config_assistente({E},'{"retencao_dias":3650}')$$);
select t.chk('limite superior de 3650 dias aceito', (select retencao_dias from engine.cfg_assistente where empresa_id='aaaaaaaa-0000-0000-0000-000000000001') = 3650);
select t.erro('retenção abaixo de 7','authenticated','a1',$$select api.salvar_config_assistente({E},'{"retencao_dias":6}')$$,'22023');
select t.erro('retenção acima de 3650','authenticated','a1',$$select api.salvar_config_assistente({E},'{"retencao_dias":3651}')$$,'22023');
select t.erro('retenção em texto','authenticated','a1',$$select api.salvar_config_assistente({E},'{"retencao_dias":"90"}')$$,'22023');
select t.erro('retenção decimal','authenticated','a1',$$select api.salvar_config_assistente({E},'{"retencao_dias":90.5}')$$,'22023');
select t.erro('retenção negativa','authenticated','a1',$$select api.salvar_config_assistente({E},'{"retencao_dias":-1}')$$,'22023');
select t.erro('booleano em texto','authenticated','a1',$$select api.salvar_config_assistente({E},'{"usar_whatsapp":"sim"}')$$,'22023');
select t.erro('campo desconhecido','authenticated','a1',$$select api.salvar_config_assistente({E},'{"x":1}')$$,'22023');
select t.erro('corpo não-objeto','authenticated','a1',$$select api.salvar_config_assistente({E},'[1]')$$,'22023');
select t.erro('gestor não salva','authenticated','a2',$$select api.salvar_config_assistente({E},'{"retencao_dias":30}')$$,'42501');
select t.erro('admin de outra empresa não salva aqui','authenticated','a4',$$select api.salvar_config_assistente({E},'{"retencao_dias":30}')$$,'42501');
select t.run('authenticated','a1',$$select api.salvar_config_assistente({E},'{"retencao_dias":90,"exigir_consentimento":false,"usar_instagram_dm":false}')$$);
select t.chk('consentimento e DM desligáveis', (select not exigir_consentimento and not usar_instagram_dm and retencao_dias = 90 from engine.cfg_assistente where empresa_id='aaaaaaaa-0000-0000-0000-000000000001'));
select t.chk('auditoria registrou o assistente', (select count(*) from audit.log_alteracao where tabela = 'cfg_assistente' and operacao = 'U') >= 4);
select t.chk('auditoria guarda o ator', (select count(*) from audit.log_alteracao where tabela = 'cfg_assistente' and usuario_id = '00000000-0000-0000-0000-0000000000a1') >= 1);

-- 5. permissões por tela
select t.chk('admin tem editar em todas as telas', t.val('authenticated','a1',$$(select count(*) from jsonb_each_text(api.minhas_permissoes({E})) where value <> 'editar')$$) = '0');
select t.chk('superadmin tem editar em todas', t.val('authenticated','a7',$$(select count(*) from jsonb_each_text(api.minhas_permissoes({E})) where value <> 'editar')$$) = '0');
select t.chk('gestor edita peças', t.val('authenticated','a2',$$api.nivel_tela({E},'pecas')$$) = 'editar');
select t.chk('leitura só vê peças', t.val('authenticated','a3',$$api.nivel_tela({E},'pecas')$$) = 'ver');
select t.chk('leitura não vê integrações', t.val('authenticated','a3',$$api.nivel_tela({E},'integracoes')$$) = 'nenhum');
select t.chk('gestor só vê integrações', t.val('authenticated','a2',$$api.nivel_tela({E},'integracoes')$$) = 'ver');
select t.chk('suporte edita clientes', t.val('authenticated','a5',$$api.nivel_tela({E},'clientes')$$) = 'editar');
select t.chk('suporte só vê peças', t.val('authenticated','a5',$$api.nivel_tela({E},'pecas')$$) = 'ver');
select t.chk('expedição edita estoque e só vê clientes', t.val('authenticated','a6',$$api.nivel_tela({E},'estoque')$$) = 'editar' and t.val('authenticated','a6',$$api.nivel_tela({E},'clientes')$$) = 'ver');
select t.chk('expedição não vê contas a receber', t.val('authenticated','a6',$$api.nivel_tela({E},'contas_receber')$$) = 'nenhum');
select t.chk('papéis somados: gestor+financeiro edita contas a receber', t.val('authenticated','a8',$$api.nivel_tela({E},'contas_receber')$$) = 'editar');
select t.chk('ninguém além do admin vê permissões e usuários', t.val('authenticated','a2',$$api.nivel_tela({E},'permissoes')$$) = 'nenhum' and t.val('authenticated','a2',$$api.nivel_tela({E},'usuarios')$$) = 'nenhum');
select t.chk('admin de outra empresa não tem nível aqui', t.val('authenticated','a4',$$api.nivel_tela({E},'pecas')$$) = 'nenhum');
select t.chk('tela inexistente é nenhum para não-admin', t.val('authenticated','a3',$$api.nivel_tela({E},'inexistente')$$) = 'nenhum');
select t.chk('pode_tela: gestor edita peças', t.val('authenticated','a2',$$api.pode_tela({E},'pecas','editar')$$) = 'true');
select t.chk('pode_tela: leitura vê mas não edita', t.val('authenticated','a3',$$api.pode_tela({E},'pecas','ver')$$) = 'true' and t.val('authenticated','a3',$$api.pode_tela({E},'pecas','editar')$$) = 'false');
select t.chk('pode_tela com nível "nenhum" ou lixo é falso', t.val('authenticated','a1',$$api.pode_tela({E},'pecas','nenhum')$$) = 'false' and t.val('authenticated','a1',$$api.pode_tela({E},'pecas','x')$$) = 'false');
select t.chk('minhas_permissoes devolve todas as telas', t.val('authenticated','a3',$$(select count(*) from jsonb_object_keys(api.minhas_permissoes({E})))$$) = '26');
select t.chk('minhas_permissoes da leitura', t.val('authenticated','a3',$$api.minhas_permissoes({E})->>'pecas'$$) = 'ver' and t.val('authenticated','a3',$$api.minhas_permissoes({E})->>'integracoes'$$) = 'nenhum');
select t.erro('sem papel na empresa não vê permissões','authenticated','a4','select api.minhas_permissoes({E})','42501');
select t.erro('anon não vê permissões','anon','','select api.minhas_permissoes({E})','42501');
select t.chk('admin lista a matriz completa', t.val('authenticated','a1',$$jsonb_array_length(api.listar_permissoes({E})->'telas')$$) = '26'
  and t.val('authenticated','a1',$$jsonb_array_length(api.listar_permissoes({E})->'papeis')$$) = '6'
  and t.val('authenticated','a1',$$api.listar_permissoes({E})->'matriz'->'pecas'->>'gestor'$$) = 'editar');
select t.erro('gestor não lista a matriz','authenticated','a2','select api.listar_permissoes({E})','42501');
select t.erro('admin de outra empresa não lista','authenticated','a4','select api.listar_permissoes({E})','42501');

select t.run('authenticated','a1',$$select api.salvar_permissoes({E},'[{"tela":"pecas","papel":"leitura","nivel":"editar"},{"tela":"agenda","papel":"leitura","nivel":"nenhum"}]')$$);
select t.chk('liberar peças para leitura vale na hora', t.val('authenticated','a3',$$api.nivel_tela({E},'pecas')$$) = 'editar');
select t.chk('retirar agenda da leitura vale na hora', t.val('authenticated','a3',$$api.nivel_tela({E},'agenda')$$) = 'nenhum' and t.val('authenticated','a3',$$api.minhas_permissoes({E})->>'agenda'$$) = 'nenhum');
select t.chk('a outra empresa não mudou', (select nivel from crm.cfg_permissao_tela where empresa_id='bbbbbbbb-0000-0000-0000-000000000002' and tela='pecas' and papel='leitura') = 'ver');
select t.erro('integrações aceita no máximo "ver"','authenticated','a1',$$select api.salvar_permissoes({E},'[{"tela":"integracoes","papel":"gestor","nivel":"editar"}]')$$,'22023');
select t.erro('permissões não é liberável','authenticated','a1',$$select api.salvar_permissoes({E},'[{"tela":"permissoes","papel":"gestor","nivel":"ver"}]')$$,'22023');
select t.erro('papel admin não entra na matriz','authenticated','a1',$$select api.salvar_permissoes({E},'[{"tela":"pecas","papel":"admin","nivel":"nenhum"}]')$$,'22023');
select t.erro('tela desconhecida','authenticated','a1',$$select api.salvar_permissoes({E},'[{"tela":"xx","papel":"gestor","nivel":"ver"}]')$$,'22023');
select t.erro('nível inválido','authenticated','a1',$$select api.salvar_permissoes({E},'[{"tela":"pecas","papel":"gestor","nivel":"total"}]')$$,'22023');
select t.erro('corpo não é lista','authenticated','a1',$$select api.salvar_permissoes({E},'{"tela":"pecas"}')$$,'22023');
select t.erro('item não é objeto','authenticated','a1',$$select api.salvar_permissoes({E},'[1]')$$,'22023');
select t.erro('lote com item inválido é recusado inteiro','authenticated','a1',$$select api.salvar_permissoes({E},'[{"tela":"estoque","papel":"leitura","nivel":"editar"},{"tela":"zz","papel":"gestor","nivel":"ver"}]')$$,'22023');
select t.chk('lote recusado não aplicou o item válido', (select nivel from crm.cfg_permissao_tela where empresa_id='aaaaaaaa-0000-0000-0000-000000000001' and tela='estoque' and papel='leitura') = 'ver');
select t.erro('gestor não salva permissões','authenticated','a2',$$select api.salvar_permissoes({E},'[{"tela":"pecas","papel":"leitura","nivel":"nenhum"}]')$$,'42501');
select t.erro('admin de outra empresa não salva aqui','authenticated','a4',$$select api.salvar_permissoes({E},'[{"tela":"pecas","papel":"leitura","nivel":"nenhum"}]')$$,'42501');
select t.chk('auditoria registrou a matriz com ator', (select count(*) from audit.log_alteracao where tabela = 'cfg_permissao_tela' and operacao = 'U' and usuario_id = '00000000-0000-0000-0000-0000000000a1') >= 2);
select t.erro('gestor não restaura o padrão','authenticated','a2',$$select api.restaurar_permissoes_padrao({E})$$,'42501');
select t.run('authenticated','a1',$$select api.restaurar_permissoes_padrao({E})$$);
select t.chk('restaurar volta ao padrão', t.val('authenticated','a3',$$api.nivel_tela({E},'pecas')$$) = 'ver' and t.val('authenticated','a3',$$api.nivel_tela({E},'agenda')$$) = 'ver');
select t.chk('restaurar mantém 156 linhas e não toca a outra empresa',
  (select count(*) from crm.cfg_permissao_tela where empresa_id='aaaaaaaa-0000-0000-0000-000000000001') = 156
  and (select count(*) from crm.cfg_permissao_tela where empresa_id='bbbbbbbb-0000-0000-0000-000000000002') = 156);

-- 6. tabelas e funções internas fechadas
select t.erro('authenticated não lê a matriz direto','authenticated','a1','select * from crm.cfg_permissao_tela','42501');
select t.erro('authenticated não lê o catálogo direto','authenticated','a1','select * from crm.cad_tela','42501');
select t.erro('authenticated não lê a config do assistente direto','authenticated','a1','select * from engine.cfg_assistente','42501');
select t.erro('authenticated não escreve na matriz direto','authenticated','a1',$$update crm.cfg_permissao_tela set nivel='editar'$$,'42501');
select t.erro('authenticated não executa _semear_permissoes','authenticated','a1',$$select crm._semear_permissoes({E})$$,'42501');
select t.erro('authenticated não executa _padrao_nivel','authenticated','a1',$$select crm._padrao_nivel('pecas','gestor')$$,'42501');
select t.erro('anon não executa salvar_permissoes','anon','',$$select api.salvar_permissoes({E},'[]')$$,'42501');
select t.erro('anon não executa salvar_config_assistente','anon','',$$select api.salvar_config_assistente({E},'{}')$$,'42501');

select 'total: '||count(*)||'  passou: '||count(*) filter (where ok)||'  falhou: '||count(*) filter (where not ok) from t.resultado;
select 'FAIL: '||nome from t.resultado where not ok order by n;
