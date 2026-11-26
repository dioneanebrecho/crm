-- Testes da 0085 (pedido 044), atualizados no pedido 047: o CPF agora fica cifrado no PARCEIRO (crm.cad_parceiro_documento)
-- e o final do CPF mostrado na página tem 4 dígitos.
-- Tudo dentro de um DO que termina em exceção: o banco desfaz o que o teste criou.
-- Resultado esperado: "ERROR: TESTES_OK (rollback forçado) ..." — qualquer outra mensagem é falha.
do $t$
declare v jsonb; cod text; q jsonb; tok text; r jsonb; log text := '';
begin
  v := api.publico_vitrine(null, null);
  assert v ->> 'situacao' = 'ok', 'vitrine deveria abrir';
  log := log || format('arara=%s itens; ', jsonb_array_length(v -> 'itens'));
  assert api.publico_vitrine(null, gen_random_uuid()) ->> 'situacao' = 'nao_encontrada', 'empresa inexistente';
  select x ->> 'codigo' into cod from jsonb_array_elements(v -> 'itens') x where x ->> 'situacao' = 'disponivel' limit 1;
  q := api.publico_quero(p_codigo => cod, p_canal => 'whatsapp', p_nome => 'Maria Teste Silva', p_whatsapp => '34991234567', p_instagram => null,
                         p_aceite => true, p_marketing => false, p_chave => 'teste-0085-chave-abcdef');
  tok := q ->> 'token';
  assert tok is not null and q ->> 'situacao' = 'reservada', 'quero: ' || q::text;
  assert (api.publico_entrega_obter(tok) ->> 'pode')::boolean, 'reserva ativa';
  assert api.publico_entrega_salvar(tok, false, '11111111111', '38400000', 'Rua X', '10', null, 'Centro', 'Uberlândia', 'MG') ->> 'erro' = 'cpf_invalido', 'cpf repetido';
  assert api.publico_entrega_salvar(tok, false, '52998224726', '38400000', 'Rua X', '10', null, 'Centro', 'Uberlândia', 'MG') ->> 'erro' = 'cpf_invalido', 'dígito';
  assert api.publico_entrega_salvar(tok, false, '52998224725', '384', 'Rua X', '10', null, 'Centro', 'Uberlândia', 'MG') ->> 'erro' = 'cep_invalido', 'cep';
  assert api.publico_entrega_salvar(tok, false, '52998224725', '38400000', 'Rua X', '', null, 'Centro', 'Uberlândia', 'MG') ->> 'erro' = 'endereco_incompleto', 'número';
  assert api.publico_entrega_salvar(tok, false, '52998224725', '38400000', '<script>', '1', null, 'Centro', 'Uberlândia', 'MG') ->> 'erro' = 'endereco_invalido', 'html';
  assert api.publico_entrega_salvar(tok, true) ->> 'erro' = 'sem_dados_salvos', 'salvo vazio';
  assert (api.publico_entrega_salvar(tok, false, '529.982.247-25', '38400-000', 'Rua das Flores', '123', 'ap 2', 'Centro', 'Uberlândia', 'mg') ->> 'ok')::boolean, 'válida';
  r := api.publico_entrega_obter(tok);
  log := log || format('entrega=%s; ', r);
  assert r ->> 'cpf_final' = '4725', 'cpf final';
  assert (api.publico_entrega_salvar(tok, true) ->> 'ok')::boolean, 'usar salvo';
  assert extensions.pgp_sym_decrypt((select d.documento_cifrado from crm.cad_parceiro_documento d join crm.cad_cliente c on c.parceiro_id = d.parceiro_id
                                      join venda.mov_acompanhamento a on a.cliente_id = c.id where a.token = tok), venda._chave_documento()) = '52998224725', 'cifra';
  assert api.publico_entrega_obter(repeat('0', 64)) ->> 'erro' = 'nao_encontrada', 'token falso';
  assert api.publico_entrega_obter('x') ->> 'erro' = 'nao_encontrada', 'token mal formado';
  assert api.publico_vitrine('whatsapp', null) ->> 'canal' = 'whatsapp', 'canal';
  assert api.publico_vitrine('xpto', null) ->> 'canal' = 'link', 'canal inválido';
  assert not has_function_privilege('anon', 'venda._chave_documento()', 'execute'), 'anon lendo a chave';
  assert has_function_privilege('anon', 'api.publico_vitrine(text,uuid)', 'execute'), 'anon sem arara';
  raise exception 'TESTES_OK (rollback forçado) %', log;
end $t$;
