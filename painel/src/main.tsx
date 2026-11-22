import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '@fontsource-variable/inter'
import '@fontsource-variable/plus-jakarta-sans'
import './styles.css'
import { lerTema, aplicarTema } from './tema'

aplicarTema(lerTema())

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
