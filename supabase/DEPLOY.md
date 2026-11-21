# Publicar as Edge Functions de integração (uma vez, e a cada alteração)

Pré-requisito: CLI do Supabase instalada (`supabase --version`). Os comandos abaixo já entram na pasta certa.

    cd "$HOME/Documents/Projeto Ane Brecho/painel-ane" && supabase login
    cd "$HOME/Documents/Projeto Ane Brecho/painel-ane" && supabase link --project-ref gikudypnbnnugduphbpb

Segredos das funções (troque pela URL real onde o painel estiver publicado; em desenvolvimento use localhost):

    cd "$HOME/Documents/Projeto Ane Brecho/painel-ane" && supabase secrets set PAINEL_URL=http://localhost:5173 PAINEL_ORIGENS=http://localhost:5173

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já existem dentro das funções; não precisa configurar.
A `service_role` nunca vai para o painel nem para o chat.

Publicar:

    cd "$HOME/Documents/Projeto Ane Brecho/painel-ane" && supabase functions deploy integracao-salvar-segredo
    cd "$HOME/Documents/Projeto Ane Brecho/painel-ane" && supabase functions deploy integracao-testar
    cd "$HOME/Documents/Projeto Ane Brecho/painel-ane" && supabase functions deploy bling-oauth-callback --no-verify-jwt

Link de redirecionamento a cadastrar no app do Bling (exatamente assim):

    https://gikudypnbnnugduphbpb.supabase.co/functions/v1/bling-oauth-callback
