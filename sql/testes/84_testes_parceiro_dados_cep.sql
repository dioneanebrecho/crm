-- Testes da 0084 (rodar com o usuário superadmin; tudo é revertido pelo RAISE final). Ajuste o e-mail se necessário.
do $$
declare r1 jsonb; r2 jsonb; r3 jsonb; r4 jsonb; r5 jsonb; uid uuid; emp uuid; par uuid;
begin
  insert into crm.cfg_cep_cache values ('38400000', true, 'Rua das Flores', null, 'Centro', 'Uberlândia', 'MG', '3170206', 'teste', now());
  insert into crm.cfg_cep_cache values ('38999999', true, null, null, null, 'Uberlândia', 'MG', '3170206', 'teste', now());
  insert into crm.cfg_cep_cache values ('11111111', false, null, null, null, null, null, null, 'teste', now());
  r1 := crm._endereco_padrao('38400-000', 'R DAS FLORES', 'CENTRO', 'UBERLANDIA', 'mg');  -- esperado: padronizado / Rua das Flores
  r2 := crm._endereco_padrao('38400000', 'R X', 'B', 'Araguari', 'MG');                   -- esperado: divergente / R X (mantém o original)
  r3 := crm._endereco_padrao('38999999', 'AV Y', 'Bairro Y', 'UBERLANDIA', 'MG');         -- esperado: parcial / AV Y / Uberlândia
  r4 := crm._endereco_padrao('11111111', 'AV Z', null, 'X', 'MG');                         -- esperado: nao_encontrado / AV Z
  r5 := crm._endereco_padrao('123', 'AV Z', null, 'X', 'MG');                              -- esperado: cep_invalido
  select id into uid from auth.users where email = 'dione.anebrecho@gmail.com';
  select empresa_id into emp from crm.cad_parceiro limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  insert into crm.cad_parceiro (empresa_id, nome, ativo, origem) values (emp, 'TESTE FORNECEDOR', true, 'manual') returning id into par;
  perform api.parceiro_salvar_dados(emp, par, jsonb_build_object('documento','11.222.333/0001-81','ie','123456','endereco', jsonb_build_object('cep','38400-000','logradouro','R. DAS FLORES','numero','10','municipio','UBERLANDIA','uf','MG')));
  perform api.parceiro_salvar_dados(emp, par, jsonb_build_object('documento','11222333000181','endereco', jsonb_build_object('cep','38400-000','municipio','UBERLANDIA','uf','MG')));
  raise exception 'T1 % | T2 % | T3 % | T4 % | T5 % | numero preservado: % (esperado 10)', r1->>'situacao', r2->>'situacao', r3->>'situacao', r4->>'situacao', r5->>'situacao',
    (select numero from crm.cad_parceiro_dados where parceiro_id = par);
end $$;
