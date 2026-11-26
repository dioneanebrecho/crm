do $m$ begin
  execute regexp_replace(pg_get_functiondef('api.parceiro_resumo'::regproc),
    'v_faltas := v_faltas \|\| (''[^'']+'')', 'v_faltas := array_append(v_faltas, \1::text)', 'g');
end $m$;
