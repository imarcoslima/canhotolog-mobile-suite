/**
 * Verificação de usuário/senha contra a MESMA tabela "usuarios" do
 * CanhotoLog web. bcryptjs entende nativamente o prefixo "$2y$" que o
 * password_hash() do PHP gera (testado: um hash gerado com
 * password_hash($senha, PASSWORD_DEFAULT) é validado igual por
 * bcrypt.compareSync no Node) — não precisa de nenhuma conversão de prefixo.
 */
import bcrypt from 'bcryptjs';
import { getCanhotoDb } from './db/canhotolog';

export interface UsuarioAutenticado {
  id: number;
  nome: string;
  perfil: 'transporte' | 'entrega';
}

interface LinhaUsuario {
  id: number;
  nome: string;
  senha_hash: string;
  perfil: string;
}

export async function autenticar(usuario: string, senha: string): Promise<UsuarioAutenticado | null> {
  const db = await getCanhotoDb();
  const linha = await db.get<LinhaUsuario>('SELECT id, nome, senha_hash, perfil FROM usuarios WHERE usuario = ?', [
    usuario,
  ]);
  if (!linha) {
    return null;
  }
  const senhaCorreta = bcrypt.compareSync(senha, linha.senha_hash);
  if (!senhaCorreta) {
    return null;
  }
  return {
    id: linha.id,
    nome: linha.nome,
    perfil: linha.perfil === 'entrega' ? 'entrega' : 'transporte',
  };
}

export async function buscarUsuarioPorId(id: number): Promise<UsuarioAutenticado | null> {
  const db = await getCanhotoDb();
  const linha = await db.get<LinhaUsuario>('SELECT id, nome, senha_hash, perfil FROM usuarios WHERE id = ?', [id]);
  if (!linha) {
    return null;
  }
  return {
    id: linha.id,
    nome: linha.nome,
    perfil: linha.perfil === 'entrega' ? 'entrega' : 'transporte',
  };
}
