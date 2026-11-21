# Painel Ane Brechó (v0.1)

Front React + Vite + TypeScript. Fala só com o schema `api` do Supabase (funções com papel por empresa).

## Rodar local
    cp .env.example .env.local
    npm install
    npm run dev

## Publicar (Cloudflare Pages)
Build: `npm run build` · Saída: `dist` · Variáveis: VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (chave publicável, nunca a secret).
