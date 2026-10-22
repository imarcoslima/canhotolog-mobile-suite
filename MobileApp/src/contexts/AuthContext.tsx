/**
 * Identidade do usuário logado. O primeiro login de cada aparelho precisa de
 * conexão (é o servidor quem valida usuário/senha, contra a mesma tabela
 * "usuarios" do CanhotoLog). Depois disso, o app guarda localmente o
 * necessário para abrir direto nas telas mesmo offline — a reautenticação
 * silenciosa (por token) é feita em segundo plano pelo syncManager assim que
 * a conexão volta.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { syncManager } from '../sync/syncManager';
import { lerSessao, salvarSessao, limparSessao } from '../db/localDb';
import { AuthOk } from '../types/protocol';

export interface UsuarioLogado {
  usuarioId: number;
  nome: string;
  perfil: 'transporte' | 'entrega';
}

interface AuthContextValue {
  usuario: UsuarioLogado | null;
  carregando: boolean;
  login: (usuario: string, senha: string) => Promise<{ ok: boolean; msg?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const sessao = lerSessao();
    if (sessao.sessionToken && sessao.usuarioId && sessao.nome && sessao.perfil) {
      setUsuario({
        usuarioId: Number(sessao.usuarioId),
        nome: sessao.nome,
        perfil: sessao.perfil as 'transporte' | 'entrega',
      });
    }
    setCarregando(false);
  }, []);

  const login = async (usuarioLogin: string, senha: string) => {
    if (syncManager.getEstado() !== 'online') {
      return {
        ok: false,
        msg: 'Sem conexão no momento. O primeiro acesso neste aparelho precisa de internet — depois disso, o app funciona offline normalmente.',
      };
    }
    try {
      const resp = await syncManager.getWs().enviar<{ usuario: string; senha: string }, AuthOk>(
        'auth',
        { usuario: usuarioLogin, senha },
      );
      if (resp.t === 'auth_ok') {
        const p = resp.p as AuthOk;
        syncManager.getWs().setSessionToken(p.sessionToken);
        salvarSessao({
          sessionToken: p.sessionToken,
          usuarioId: String(p.usuarioId),
          nome: p.nome,
          perfil: p.perfil,
        });
        setUsuario({ usuarioId: p.usuarioId, nome: p.nome, perfil: p.perfil });
        return { ok: true };
      }
      return { ok: false, msg: (resp.p as { msg?: string })?.msg ?? 'Usuário ou senha inválidos.' };
    } catch (e) {
      return { ok: false, msg: e instanceof Error ? e.message : 'Falha ao conectar.' };
    }
  };

  const logout = () => {
    limparSessao();
    syncManager.getWs().setSessionToken(null);
    setUsuario(null);
  };

  const valor = useMemo(() => ({ usuario, carregando, login, logout }), [usuario, carregando]);

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth precisa ser usado dentro de <AuthProvider>.');
  }
  return ctx;
}
