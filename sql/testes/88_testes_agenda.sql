-- Testes da 0088 (agenda). Bloco que termina em exceção (nada fica gravado). Esperado: TESTES_OK.
-- Rodados em 25/11/2026 após a aplicação: OK.
do $t$
declare e uuid; u uuid; u2 uuid; c uuid; r jsonb; v text; ok boolean; comp agenda.mov_compromisso;
begin
  select r.empresa_id, r.usuario_id into e, u from crm.rel_usuario_empresa r join crm.cad_usuario x on x.id=r.usuario_id
   where r.ativo and x.ativo limit 1;
  select r.usuario_id into u2 from crm.rel_usuario_empresa r where r.empresa_id=e and r.ativo and r.usuario_id<>u limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);

  -- 1 criar follow-up para outra pessoa (decisão 1)
  c := api.agenda_salvar(e, jsonb_build_object('tipo','follow_up','titulo','Ligar; cliente, teste','inicio_em', now()+interval '2 hours','responsavel_id', coalesce(u2,u)));
  -- 2 resolver sem resposta da cliente deve falhar (decisão 2)
  ok := false; begin perform api.agenda_concluir(e, c, 'resolvido', 'ok'); exception when others then ok := sqlerrm like 'registre a resposta%'; end;
  if not ok then raise exception 'T2 falhou'; end if;
  -- 3 tentativa leva a aguardando_cliente
  perform api.agenda_registrar_interacao(e, c, 'tentativa', 'whatsapp', 'sem retorno');
  select estado into v from agenda.mov_compromisso where id=c; if v<>'aguardando_cliente' then raise exception 'T3 %', v; end if;
  -- 4 encerrar 'sem_resposta' com 1 tentativa deve falhar (mínimo 3)
  ok := false; begin perform api.agenda_concluir(e, c, 'encerrado', null, 'sem_resposta'); exception when others then ok := sqlerrm like 'encerrar por falta%'; end;
  if not ok then raise exception 'T4 falhou'; end if;
  -- 5 resposta volta a pendente; resolver passa
  perform api.agenda_registrar_interacao(e, c, 'resposta_cliente', 'whatsapp', 'vai buscar sábado');
  perform api.agenda_concluir(e, c, 'resolvido', 'Combinado retirada');
  select estado into v from agenda.mov_compromisso where id=c; if v<>'resolvido' then raise exception 'T5 %', v; end if;
  -- 6 reabrir
  perform api.agenda_reabrir(e, c, 'cliente remarcou');
  select estado into v from agenda.mov_compromisso where id=c; if v<>'pendente' then raise exception 'T6 %', v; end if;
  -- 7 lembrete resolve sem interação da cliente
  c := api.agenda_salvar(e, jsonb_build_object('tipo','lembrete','titulo','Comprar cabides','inicio_em', now()-interval '2 days','dia_inteiro',true));
  perform api.agenda_concluir(e, c, 'resolvido', 'feito');
  -- 8 listar e minha fila
  r := api.agenda_listar(e, now()-interval '7 days', now()+interval '7 days');
  if jsonb_array_length(r) < 2 then raise exception 'T8 listar %', r; end if;
  r := api.agenda_minha_fila(e, coalesce(u2,u));
  if r->'hoje' is null then raise exception 'T8 fila'; end if;
  -- 9 vínculo inexistente ou de outra empresa
  ok := false; begin perform api.agenda_salvar(e, jsonb_build_object('tipo','tarefa','titulo','x','inicio_em',now(),'cliente_id', gen_random_uuid())); exception when others then ok := sqlerrm = 'vínculo inválido'; end;
  if not ok then raise exception 'T9 falhou'; end if;
  -- 10 convites: criar, remarcar, cancelar => REQUEST0, REQUEST1, CANCEL2; .ics com UID, SEQUENCE, alarme e escape
  update agenda.cfg_agenda set enviar_convite = true where empresa_id = e;
  c := api.agenda_salvar(e, jsonb_build_object('tipo','tarefa','titulo','Conferir etiquetas','inicio_em', now()+interval '1 day'));
  perform api.agenda_salvar(e, jsonb_build_object('id', c, 'inicio_em', now()+interval '25 hours'));
  perform api.agenda_concluir(e, c, 'cancelado', null, 'não precisa');
  select string_agg(metodo||sequencia, ',' order by id) into v from agenda.mov_convite where compromisso_id=c;
  if v <> 'REQUEST0,REQUEST1,CANCEL2' then raise exception 'T10 convites %', v; end if;
  select * into comp from agenda.mov_compromisso where id=c;
  v := agenda._ics(comp, 'REQUEST', 1, 'a@b.com', 'crm@x.com');
  if v not like '%SEQUENCE:1%' or v not like '%TRIGGER:-PT30M%' or v not like '%UID:'||c||'@crm.anebrecho%' then raise exception 'T10 ics %', v; end if;
  v := agenda._ics((select x from agenda.mov_compromisso x where tipo_codigo='follow_up' and empresa_id=e order by criado_em desc limit 1), 'REQUEST', 0, 'a@b.com', 'crm@x.com');
  if position(E'Ligar\\; cliente\\, teste' in v) = 0 then raise exception 'T10 escape %', v; end if;
  -- 11 usuário sem vínculo com a empresa é barrado
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  ok := false; begin perform api.agenda_listar(e, now(), now()+interval '1 day'); exception when others then ok := sqlstate = '42501'; end;
  if not ok then raise exception 'T11 falhou'; end if;
  raise exception 'TESTES_OK';
end $t$;
