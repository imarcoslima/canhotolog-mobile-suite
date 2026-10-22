import { autenticar, buscarUsuarioPorId } from '../../auth';
import { criarSessao, validarSessao, Sessao } from '../session';
import { AuthRequest, AuthOk, AuthErr } from '../protocol';

export async function tratarAuth(payload: AuthRequest): Promise<
  | { tipo: 'auth_ok'; corpo: AuthOk }
  | { tipo: 'auth_err'; corpo: AuthErr }
> {
  // Reautenticação silenciosa por token (reconexão em segundo plano).
  if ('sessionToken' in payload) {
    const sessaoExistente = validarSessao(payload.sessionToken);
    if (!sessaoExistente) {
      return { tipo: 'auth_err', corpo: { msg: 'Sessão expirada. Faça login novamente.' } };
    }
    // Reconfirma o perfil atual no banco (pode ter mudado desde o login).
    const usuarioAtual = await buscarUsuarioPorId(sessaoExistente.usuarioId);
    if (!usuarioAtual) {
      return { tipo: 'auth_err', corpo: { msg: 'Usuário não encontrado.' } };
    }
    const { token, sessao } = criarSessao(usuarioAtual.id, usuarioAtual.nome, usuarioAtual.perfil);
    return { tipo: 'auth_ok', corpo: montarResposta(token, usuarioAtual.id, sessao) };
  }

  // Login normal, usuário e senha.
  const usuario = await autenticar(payload.usuario, payload.senha);
  if (!usuario) {
    return { tipo: 'auth_err', corpo: { msg: 'Usuário ou senha inválidos.' } };
  }
  const { token, sessao } = criarSessao(usuario.id, usuario.nome, usuario.perfil);
  return { tipo: 'auth_ok', corpo: montarResposta(token, usuario.id, sessao) };
}

function montarResposta(token: string, usuarioId: number, sessao: Sessao): AuthOk {
  return {
    sessionToken: token,
    usuarioId,
    nome: sessao.nome,
    perfil: sessao.perfil,
    expiraEm: sessao.expiraEm.toISOString(),
  };
}
