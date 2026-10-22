/**
 * Sessões de autenticação em memória. Simples de propósito: o app troca de
 * conexão WebSocket com frequência (rede móvel cai o tempo todo), então a
 * sessão não pode viver "dentro" da conexão — ela precisa sobreviver a
 * reconexões, por isso é indexada por token e guardada aqui, não no objeto
 * da conexão.
 *
 * Se um dia o backend rodar em mais de um processo/instância (várias
 * réplicas atrás de um load balancer), troque isso por Redis ou pela
 * própria tabela "usuarios"/uma tabela de sessões no banco — a interface
 * abaixo foi pensada pequena de propósito para essa troca ser fácil.
 */
import { randomUUID } from 'node:crypto';
import { config } from '../config';

export interface Sessao {
  usuarioId: number;
  nome: string;
  perfil: 'transporte' | 'entrega';
  expiraEm: Date;
}

const sessoes = new Map<string, Sessao>();

export function criarSessao(usuarioId: number, nome: string, perfil: 'transporte' | 'entrega'): {
  token: string;
  sessao: Sessao;
} {
  const token = randomUUID();
  const sessao: Sessao = {
    usuarioId,
    nome,
    perfil,
    expiraEm: new Date(Date.now() + config.sessionTtlHoras * 60 * 60 * 1000),
  };
  sessoes.set(token, sessao);
  return { token, sessao };
}

export function validarSessao(token: string): Sessao | null {
  const sessao = sessoes.get(token);
  if (!sessao) {
    return null;
  }
  if (sessao.expiraEm.getTime() < Date.now()) {
    sessoes.delete(token);
    return null;
  }
  return sessao;
}

// Limpeza periódica de sessões expiradas, para não acumular memória à toa
// num servidor que fica no ar por muito tempo.
setInterval(() => {
  const agora = Date.now();
  for (const [token, sessao] of sessoes) {
    if (sessao.expiraEm.getTime() < agora) {
      sessoes.delete(token);
    }
  }
}, 30 * 60 * 1000).unref();
