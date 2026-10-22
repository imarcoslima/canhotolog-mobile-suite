/**
 * Expõe o estado da conexão (online/offline/etc) para qualquer tela mostrar
 * um indicador visual — importante aqui, já que o app promete funcionar sem
 * conexão: a pessoa precisa sempre saber se o que ela está fazendo vai sair
 * na hora ou ficar na fila local para depois.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { syncManager } from '../sync/syncManager';
import { EstadoConexao } from '../api/wsClient';

const ConnectionContext = createContext<EstadoConexao>('desconectado');

export function ConnectionProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [estado, setEstado] = useState<EstadoConexao>(syncManager.getEstado());

  useEffect(() => {
    return syncManager.onStatusMudou(setEstado);
  }, []);

  return <ConnectionContext.Provider value={estado}>{children}</ConnectionContext.Provider>;
}

export function useConexao(): EstadoConexao {
  return useContext(ConnectionContext);
}

export function rotuloConexao(estado: EstadoConexao): string {
  switch (estado) {
    case 'online':
      return 'Online';
    case 'autenticando':
      return 'Conectando…';
    case 'conectando':
      return 'Conectando…';
    default:
      return 'Offline — salvando localmente';
  }
}
