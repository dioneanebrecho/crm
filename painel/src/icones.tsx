import type { ReactNode } from 'react'
const Svg = ({ children, tam = 18 }: { children: ReactNode; tam?: number }) => (
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
export const IPecas = () => <Svg><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 12l8 4 8-4" /><path d="M4 17l8 4 8-4" /></Svg>
export const IEstoque = () => <Svg><path d="M3 9l9-6 9 6v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9z" /><path d="M9 21v-8h6v8" /></Svg>
export const IClientes = () => <Svg><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.3c2 .6 3.5 2.4 3.5 5.7" /></Svg>
export const ILocais = () => <Svg><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.800 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></Svg>
export const IAgenda = () => <Svg><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>
export const ILua = () => <Svg><path d="M20 14.5A8 8 0 0 1 9.500 4 8 8 0 1 0 20 14.500z" /></Svg>
export const ITema = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></Svg>
export const IMenu = () => <Svg tam={20}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>
export const ISair = () => <Svg><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" /><path d="M16 8l4 4-4 4M20 12H9" /></Svg>
export const IEsq = () => <Svg><path d="M15 6l-6 6 6 6" /></Svg>
export const IDir = () => <Svg><path d="M9 6l6 6-6 6" /></Svg>
export const IMarca = () => <Svg tam={20}><path d="M6 8h12l1.500 12h-15L6 8z" /><path d="M9 8V6.500a3 3 0 0 1 6 0V8" /></Svg>
export const IIntegracoes = () => <Svg><path d="M9 3v5M15 3v5" /><path d="M6 8h12v4a6 6 0 0 1-12 0V8z" /><path d="M12 18v3" /></Svg>
export const IBaixo = () => <Svg tam={14}><path d="M6 9l6 6 6-6" /></Svg>
export const IEtiqueta = () => <Svg><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9z" /><circle cx="8" cy="8" r="1.4" /></Svg>
export const IProdutos = () => <Svg><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></Svg>
export const INota = () => <Svg><path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M8 13h8M8 17h6" /></Svg>
export const IParceiros = () => <Svg><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" /></Svg>
export const IGrade = () => <Svg><rect x="3" y="3" width="7.500" height="7.500" rx="1.500" /><rect x="13.500" y="3" width="7.500" height="7.500" rx="1.500" /><rect x="3" y="13.500" width="7.500" height="7.500" rx="1.500" /><rect x="13.500" y="13.500" width="7.500" height="7.500" rx="1.500" /></Svg>
export const IAjustes = () => <Svg><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></Svg>
export const ILivro = () => <Svg><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z" /><path d="M4 19a2 2 0 0 1 2-2h13" /></Svg>
export const IEscudo = () => <Svg><path d="M12 3l8 3v6c0 4.500-3.200 8-8 9-4.800-1-8-4.500-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></Svg>
export const IGov = () => <Svg><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.4" /><path d="M12 3v5.6M12 15.4V21M3 12h5.6M15.4 12H21" /></Svg>
export const IFaisca = () => <Svg><path d="M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800L12 3z" /><path d="M18.500 16l.7 1.800 1.800.7-1.800.7-.7 1.800-.7-1.800-1.800-.7 1.800-.7.7-1.800z" /></Svg>

export const IGestao = () => <Svg><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Svg>
export const IBusca = () => <Svg><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Svg>
export const IConversa = () => <Svg><path d="M4 5h16v11H9l-5 4V5z" /><path d="M8 9.5h8M8 12.5h5" /></Svg>
export const IResposta = () => <Svg><path d="M4 5h16v11H9l-5 4V5z" /><path d="M10 8l-2 2.5 2 2.5M14 8l2 2.5-2 2.5" /></Svg>
