// Validação de CPF e CNPJ pelos dígitos verificadores (mesmo algoritmo de bling.fn_cpf_valido / fn_cnpj_valido).
export const soDigitos = (v: string) => v.replace(/\D/g, '')

export function cpfValido(v: string): boolean {
  const d = soDigitos(v)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

export function cnpjValido(v: string): boolean {
  const d = soDigitos(v)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const dv = (pesos: number[]) => { const s = pesos.reduce((a, p, i) => a + Number(d[i]) * p, 0) % 11; return s < 2 ? 0 : 11 - s }
  return dv([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[12]) && dv([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[13])
}

export type TipoDocumento = 'cpf' | 'cnpj' | 'indefinido'
export interface Documento { tipo: TipoDocumento; digitos: string; valido: boolean; formatado: string; mensagem: string }

export function classificar(v: string): Documento {
  const d = soDigitos(v)
  if (d.length === 11) {
    const ok = cpfValido(d)
    return { tipo: 'cpf', digitos: d, valido: ok, formatado: d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'), mensagem: ok ? 'CPF válido (dígitos verificadores conferem).' : 'CPF inválido: os dígitos verificadores não conferem.' }
  }
  if (d.length === 14) {
    const ok = cnpjValido(d)
    return { tipo: 'cnpj', digitos: d, valido: ok, formatado: d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'), mensagem: ok ? 'CNPJ válido (dígitos verificadores conferem).' : 'CNPJ inválido: os dígitos verificadores não conferem.' }
  }
  return { tipo: 'indefinido', digitos: d, valido: false, formatado: d, mensagem: d === '' ? '' : `Informe 11 dígitos (CPF) ou 14 (CNPJ); há ${d.length}.` }
}
