/**
 * Orquestra a sincronização: observa conectividade (NetInfo) + estado da
 * conexão WebSocket, autentica de novo quando a conexão volta, e drena a
 * fila local (outbox) enviando cada item pendente na ordem em que foi
 * criado. Sempre que uma conferência é confirmada pelo servidor, também
 * envia as fotos dela que ainda não tiverem sido enviadas.
 *
 * Este módulo é o único lugar que fala com o WsClient para escrita — as
 * telas só leem/gravam no banco local (db/localDb.ts) e chamam
 * `notificarNovoItem()` para acordar o drenador o quanto antes.
 */
import NetInfo from '@react-native-community/netinfo';
import { WsClient, EstadoConexao } from '../api/wsClient';
import {
  ItemOutbox,
  listarPendentes,
  marcarStatus,
  listarFotosPendentesDaConferencia,
  marcarFotoEnviada,
  lerSessao,
  salvarSessao,
} from '../db/localDb';
import { lerArquivoComoArrayBuffer } from './fotoUtils';
import {
  AuthOk,
  AuthRequest,
  CadastroNewRequest,
  ConferenciaSubmitRequest,
} from '../types/protocol';

type OuvinteStatus = (estado: EstadoConexao) => void;

class SyncManager {
  private ws: WsClient | null = null;
  private drenando = false;
  private precisaDrenarDeNovo = false;
  private ouvintesStatus = new Set<OuvinteStatus>();

  iniciar(url: string): void {
    if (this.ws) {
      return;
    }
    this.ws = new WsClient(url);
    this.ws.onEstadoMudou(async estado => {
      this.ouvintesStatus.forEach(fn => fn(estado));
      if (estado === 'autenticando') {
        await this.reautenticar();
      }
      if (estado === 'online') {
        this.drenar();
      }
    });
    this.ws.conectar();

    NetInfo.addEventListener(estadoRede => {
      if (estadoRede.isConnected && this.ws?.getEstado() === 'desconectado') {
        this.ws.conectar();
      }
    });
  }

  onStatusMudou(fn: OuvinteStatus): () => void {
    this.ouvintesStatus.add(fn);
    return () => this.ouvintesStatus.delete(fn);
  }

  getEstado(): EstadoConexao {
    return this.ws?.getEstado() ?? 'desconectado';
  }

  getWs(): WsClient {
    if (!this.ws) {
      throw new Error('syncManager.iniciar() precisa ser chamado antes de usar o WebSocket.');
    }
    return this.ws;
  }

  private async reautenticar(): Promise<void> {
    const sessao = lerSessao();
    if (!sessao.sessionToken) {
      // Sem sessão salva — a tela de Login é quem vai autenticar
      // explicitamente com usuário/senha (ver contexts/AuthContext.tsx).
      return;
    }
    try {
      const resp = await this.ws!.enviar<AuthRequest, AuthOk>('auth', {
        sessionToken: sessao.sessionToken,
      });
      if (resp.t === 'auth_ok') {
        const p = resp.p as AuthOk;
        this.ws!.setSessionToken(p.sessionToken);
        salvarSessao({ sessionToken: p.sessionToken });
      } else {
        // Token expirado/inválido — força novo login manual.
        salvarSessao({ sessionToken: '' });
      }
    } catch {
      // Sem sorte agora — tenta de novo na próxima mudança de estado/conectividade.
    }
  }

  /** Acorda o drenador da fila (chamar sempre que uma tela enfileirar algo novo). */
  notificarNovoItem(): void {
    if (this.getEstado() === 'online') {
      this.drenar();
    }
  }

  private async drenar(): Promise<void> {
    if (this.drenando) {
      this.precisaDrenarDeNovo = true;
      return;
    }
    this.drenando = true;
    try {
      let pendentes = listarPendentes();
      while (pendentes.length > 0 && this.getEstado() === 'online') {
        for (const item of pendentes) {
          if (this.getEstado() !== 'online') {
            break;
          }
          await this.enviarItem(item);
        }
        pendentes = listarPendentes();
      }
    } finally {
      this.drenando = false;
      if (this.precisaDrenarDeNovo) {
        this.precisaDrenarDeNovo = false;
        this.drenar();
      }
    }
  }

  private async enviarItem(item: ItemOutbox): Promise<void> {
    marcarStatus(item.id, 'enviando');
    try {
      const payload = JSON.parse(item.payload_json);

      if (item.tipo === 'cadastro_new') {
        const resp = await this.ws!.enviar<CadastroNewRequest>('cadastro_new', payload);
        if (resp.t === 'cadastro_ok') {
          marcarStatus(item.id, 'enviado');
        } else {
          const msg = (resp.p as { msg?: string })?.msg ?? 'Erro desconhecido.';
          marcarStatus(item.id, 'erro', msg);
        }
        return;
      }

      if (item.tipo === 'conferencia_submit') {
        const resp = await this.ws!.enviar<ConferenciaSubmitRequest>('conferencia_submit', payload);
        if (resp.t === 'conferencia_ok') {
          marcarStatus(item.id, 'enviado');
          await this.enviarFotosDaConferencia(payload.clientTempId);
        } else {
          const msg = (resp.p as { msg?: string })?.msg ?? 'Erro desconhecido.';
          marcarStatus(item.id, 'erro', msg);
        }
        return;
      }
    } catch (e) {
      marcarStatus(item.id, 'erro', e instanceof Error ? e.message : String(e));
    }
  }

  private async enviarFotosDaConferencia(conferenciaClientTempId: string): Promise<void> {
    const fotos = listarFotosPendentesDaConferencia(conferenciaClientTempId);
    for (const foto of fotos) {
      if (this.getEstado() !== 'online') {
        return;
      }
      try {
        const bytes = await lerArquivoComoArrayBuffer(foto.caminho_arquivo);
        await this.ws!.enviarFoto(foto.temp_id, conferenciaClientTempId, foto.mime, bytes);
        marcarFotoEnviada(foto.temp_id);
      } catch {
        // Fica marcada como não enviada — tenta de novo na próxima janela online.
      }
    }
  }
}

export const syncManager = new SyncManager();
