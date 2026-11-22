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

## Convite de usuários (`usuario-convidar`)

Publicar (com o endereço real do painel, para o link do convite e o CORS):

    cd "$HOME/Documents/Projeto Ane Brecho/painel-ane" && PAINEL_URL=https://crm.evoconecta.io bash scripts/publicar-funcoes.sh usuario-convidar

E-mail: a função reaproveita o Resend dos alertas (remetente em `engine.cfg_alerta`, chave no Vault) por `api.svc_email_config`. Provisório: com o remetente `onboarding@resend.dev` o Resend só entrega ao e-mail do dono da conta. Para convidar outras pessoas, verifique um domínio no Resend e troque o remetente em `engine.cfg_alerta`. Enquanto isso, a tela mostra o link de criação de senha para repassar à pessoa.

No Supabase (Authentication): em URL Configuration, deixe `https://crm.evoconecta.io` como Site URL e em Redirect URLs; em Email, ajuste "Email OTP expiration" para 86400 (24 h) para o link do convite valer o prazo prometido no e-mail.
