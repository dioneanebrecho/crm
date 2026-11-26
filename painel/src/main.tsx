import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '@fontsource-variable/inter'
import '@fontsource-variable/plus-jakarta-sans'
import './styles.css'
import { lerTema, aplicarTema } from './tema'
import { lerDensidade, aplicarDensidade } from './densidade'

if (!/^\/vitrine(\/|$)/.test(location.pathname)) { aplicarTema(lerTema()); aplicarDensidade(lerDensidade()) }

// /vitrine é a página pública da loja (sem login); o resto é o painel.
const Vitrine = lazy(() => import('./vitrine/Vitrine'))
const ehVitrine = /^\/vitrine(\/|$)/.test(location.pathname)
createRoot(document.getElementById('root')!).render(
  <StrictMode>{ehVitrine ? <Suspense fallback={null}><Vitrine /></Suspense> : <App />}</StrictMode>,
)
