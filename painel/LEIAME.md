# Painel Ane Brechó (v0.1)

Front React + Vite + TypeScript. Fala só com o schema `api` do Supabase (funções com papel por empresa).

## Rodar local
    cp .env.example .env.local
    npm install
    npm run dev

## Publicar (Cloudflare Pages)
Build: `npm run build` · Saída: `dist` · Variáveis: VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (chave publicável, nunca a secret).

## Tela de entrada (login)
Fundo com até 10 fotos em transição (crossfade + zoom lento), logomarca acima do cartão e favicon.
- Fotos: `public/fundo/` + lista em `public/fundo/fundo.json` (`[{"arquivo":"01.jpg","legenda":"Live Shop · sáb 14"}]`). Lista vazia = fundo padrão dourado.
- Atalho: `scripts/preparar-fundo.sh <pasta-com-as-fotos>` redimensiona e gera o `fundo.json` (usa `sips`, do macOS).
- Logo: `public/logo-anebrecho.jpg`. Favicons: `public/favicon.ico`, `favicon-32.png`, `favicon-192.png`, `apple-touch-icon.png`.
- Respeita `prefers-reduced-motion` (sem animação). Componente: `src/TelaEntrada.tsx`.
