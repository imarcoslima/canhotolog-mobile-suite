/**
 * Validações espelhando as já usadas no CanhotoLog web (includes/functions.php),
 * para o app rejeitar dado inválido na hora, antes mesmo de gravar na fila
 * local — evita descobrir um problema só quando o servidor recusar depois.
 */

export const LISTA_UF = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
  'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export function apenasDigitos(valor: string): string {
  return (valor ?? '').replace(/\D/g, '');
}

/** Mesmo algoritmo (dígitos verificadores) usado em validarCPF() no PHP. */
export function validarCPF(valorEntrada: string): boolean {
  const cpf = apenasDigitos(valorEntrada);
  if (cpf.length !== 11) {
    return false;
  }
  if (/^(\d)\1{10}$/.test(cpf)) {
    return false;
  }
  for (let posicao = 9; posicao < 11; posicao++) {
    let soma = 0;
    for (let i = 0; i < posicao; i++) {
      soma += Number(cpf[i]) * ((posicao + 1) - i);
    }
    const digitoVerificador = ((10 * soma) % 11) % 10;
    if (Number(cpf[posicao]) !== digitoVerificador) {
      return false;
    }
  }
  return true;
}

export function formatarCPF(valorEntrada: string): string {
  const digitos = apenasDigitos(valorEntrada);
  if (digitos.length !== 11) {
    return valorEntrada;
  }
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9, 11)}`;
}

/** Aceita placa no formato antigo (ABC1234) e Mercosul (ABC1D23). */
export function validarPlaca(valor: string): boolean {
  const limpa = (valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{3}\d{4}$/.test(limpa) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(limpa);
}
