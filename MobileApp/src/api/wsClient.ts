/**
 * Cliente WebSocket do app. Responsável só pela conexão/protocolo — não
 * decide QUANDO enviar (isso é do sync/syncManager.ts, que lê a fila local
 * e chama os métodos daqui). Mantém uma única conexão persistente, com
 * reconexão automática (backoff exponencial) e heartbeat (ping/pong) para
 * detectar quedas silenciosas comuns em rede móvel.
 */
import {
  EnvelopeCliente,
  EnvelopeServidor,
  PROTOCOL_VERSION,
  TipoMsgCliente,
} from '../types/protocol';

/**
 * O .d.ts global do React Native (react-native/src/types/globals.d.ts)
 * declara um `WebSocket` propositalmente mínimo — sem `binaryType` na
 * instância nem os `readonly OPEN/CLOSED/...` na instância (só existem no
 * objeto construtor). Em tempo de execução o `WebSocket` do RN suporta os
 * dois (ver Libraries/WebSocket/WebSocket.js) — este tipo só preenche a
 * lacuna da tipagem, sem mudar nada em runtime.
 */
type RNWebSocket = WebSocket & { binaryType: 'blob' | 'arraybuffer' };
const WS_OPEN = WebSocket.OPEN;

export type EstadoConexao = 'desconectado' | 'conectando' | 'autenticando' | 'online';

type Ouvinte = (estado: EstadoConexao) => void;

const TIMEOUT_RESPOSTA_MS = 15000;
const HEARTBEAT_INTERVALO_MS = 25000;
const HEARTBEAT_TOLERANCIA_MS = 10000;
const BACKOFF_INICIAL_MS = 1000;
const BACKOFF_MAXIMO_MS = 30000;

function gerarId(): string {
  return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

interface PendenteResposta {
  resolve: (env: EnvelopeServidor) => void;
  reject: (erro: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class WsClient {
  private url: string;
  private ws: RNWebSocket | null = null;
  private estado: EstadoConexao = 'desconectado';
  private ouvintes = new Set<Ouvinte>();
  private pendentes = new Map<string, PendenteResposta>();
  private sessionToken: string | null = null;
  private tentativasReconexao = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatEsperandoDesde: number | null = null;
  private reconectarTimer: ReturnType<typeof setTimeout> | null = null;
  private fechadoManualmente = false;
  /** Correlaciona o próximo frame binário ao "photo_begin" que acabou de ser enviado. */
  private aguardandoBinarioPara: string | null = null;
  private onBinarioRecebido: ((tempId: string, ok: boolean) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  onEstadoMudou(fn: Ouvinte): () => void {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  }

  getEstado(): EstadoConexao {
    return this.estado;
  }

  getSessionToken(): string | null {
    return this.sessionToken;
  }

  setSessionToken(token: string | null): void {
    this.sessionToken = token;
  }

  private mudarEstado(novo: EstadoConexao): void {
    this.estado = novo;
    this.ouvintes.forEach(fn => fn(novo));
  }

  conectar(): void {
    if (this.ws || this.estado === 'conectando') {
      return;
    }
    this.fechadoManualmente = false;
    this.mudarEstado('conectando');

    let ws: RNWebSocket;
    try {
      ws = new WebSocket(this.url) as RNWebSocket;
    } catch {
      this.agendarReconexao();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.tentativasReconexao = 0;
      this.iniciarHeartbeat();
      // "online" de verdade só depois que reautenticar (ver auth() chamado
      // pelo syncManager assim que onEstadoMudou disparar 'conectando'->socket aberto).
      this.mudarEstado('autenticando');
    };

    ws.onmessage = (evento: WebSocketMessageEvent) => {
      this.tratarMensagem(evento.data);
    };

    ws.onerror = () => {
      // onclose é chamado logo em seguida pelo runtime — não duplica lógica aqui.
    };

    ws.onclose = () => {
      this.pararHeartbeat();
      this.ws = null;
      this.rejeitarTodasPendentes(new Error('Conexão fechada'));
      if (!this.fechadoManualmente) {
        this.mudarEstado('desconectado');
        this.agendarReconexao();
      }
    };
  }

  desconectar(): void {
    this.fechadoManualmente = true;
    if (this.reconectarTimer) {
      clearTimeout(this.reconectarTimer);
      this.reconectarTimer = null;
    }
    this.pararHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.mudarEstado('desconectado');
  }

  private agendarReconexao(): void {
    if (this.reconectarTimer) {
      return;
    }
    const espera = Math.min(
      BACKOFF_MAXIMO_MS,
      BACKOFF_INICIAL_MS * 2 ** this.tentativasReconexao,
    );
    this.tentativasReconexao += 1;
    this.reconectarTimer = setTimeout(() => {
      this.reconectarTimer = null;
      this.conectar();
    }, espera);
  }

  private iniciarHeartbeat(): void {
    this.pararHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.heartbeatEsperandoDesde !== null) {
        const semResposta = Date.now() - this.heartbeatEsperandoDesde > HEARTBEAT_TOLERANCIA_MS;
        if (semResposta) {
          // Servidor não respondeu a tempo — trata como conexão morta.
          this.ws?.close();
          return;
        }
      }
      this.heartbeatEsperandoDesde = Date.now();
      this.enviarSemResposta('ping', {});
    }, HEARTBEAT_INTERVALO_MS);
  }

  private pararHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatEsperandoDesde = null;
  }

  private rejeitarTodasPendentes(erro: Error): void {
    this.pendentes.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(erro);
    });
    this.pendentes.clear();
  }

  private tratarMensagem(dado: string | ArrayBuffer): void {
    if (typeof dado !== 'string') {
      // O servidor nunca manda frame binário de volta neste protocolo — só o
      // app envia binário (a foto). Se algo chegar aqui, é ignorado.
      return;
    }

    let env: EnvelopeServidor;
    try {
      env = JSON.parse(dado);
    } catch {
      return;
    }

    if (env.t === 'pong') {
      this.heartbeatEsperandoDesde = null;
      return;
    }

    if (env.t === 'auth_ok') {
      this.mudarEstado('online');
    }

    // Confirmação (ou erro) do upload de uma foto DEPOIS do frame binário:
    // mensagem SEM "re", pois não é resposta a um "enviar()" específico — o
    // frame binário em si não carrega id de correlação. Casamos pelo tempId
    // dentro do payload. (A resposta AO "photo_begin" em si tem "re" e cai
    // no fluxo normal de baixo, resolvendo a Promise do enviar().)
    if (!env.re && (env.t === 'photo_ack' || env.t === 'photo_err') && this.onBinarioRecebido) {
      const tempId = (env.p as { tempId?: string })?.tempId;
      if (tempId && tempId === this.aguardandoBinarioPara) {
        const callback = this.onBinarioRecebido;
        this.aguardandoBinarioPara = null;
        this.onBinarioRecebido = null;
        callback(tempId, env.t === 'photo_ack');
      }
      return;
    }

    if (env.re) {
      const pendente = this.pendentes.get(env.re);
      if (pendente) {
        clearTimeout(pendente.timeout);
        this.pendentes.delete(env.re);
        pendente.resolve(env);
      }
    }
  }

  private enviarSemResposta<T>(t: TipoMsgCliente, p: T): void {
    if (!this.ws || this.ws.readyState !== WS_OPEN) {
      return;
    }
    const env: EnvelopeCliente<T> = { v: PROTOCOL_VERSION, id: gerarId(), t, p };
    this.ws.send(JSON.stringify(env));
  }

  /** Envia uma mensagem e aguarda a resposta correlacionada (ou timeout). */
  enviar<TReq, TResp = unknown>(t: TipoMsgCliente, p: TReq): Promise<EnvelopeServidor<TResp>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WS_OPEN) {
        reject(new Error('Sem conexão com o servidor no momento.'));
        return;
      }
      const id = gerarId();
      const env: EnvelopeCliente<TReq> = { v: PROTOCOL_VERSION, id, t, p };

      const timeout = setTimeout(() => {
        this.pendentes.delete(id);
        reject(new Error('O servidor demorou demais para responder.'));
      }, TIMEOUT_RESPOSTA_MS);

      this.pendentes.set(id, {
        resolve: resolve as (env: EnvelopeServidor) => void,
        reject,
        timeout,
      });

      this.ws.send(JSON.stringify(env));
    });
  }

  /**
   * Envia uma foto: manda o "photo_begin" (JSON) e, na sequência imediata,
   * o frame binário com os bytes. `bytes` já deve vir comprimido/redimensionado
   * (ver sync/fotoUtils.ts) — este método não faz nenhum processamento de imagem.
   */
  async enviarFoto(
    tempId: string,
    conferenciaClientTempId: string,
    mime: string,
    bytes: ArrayBuffer,
  ): Promise<void> {
    if (!this.ws || this.ws.readyState !== WS_OPEN) {
      throw new Error('Sem conexão com o servidor no momento.');
    }

    const respostaBegin = await this.enviar('photo_begin', {
      conferenciaClientTempId,
      tempId,
      mime,
      tamanho: bytes.byteLength,
    });

    if (respostaBegin.t === 'photo_err') {
      throw new Error((respostaBegin.p as { msg?: string })?.msg ?? 'Falha ao enviar a foto.');
    }

    await new Promise<void>((resolve, reject) => {
      this.aguardandoBinarioPara = tempId;
      this.onBinarioRecebido = (idRecebido, ok) => {
        this.onBinarioRecebido = null;
        if (idRecebido === tempId && ok) {
          resolve();
        } else {
          reject(new Error('Confirmação da foto não recebida.'));
        }
      };
      this.ws!.send(bytes);

      // Se o servidor não confirmar em tempo hábil, desiste (a foto continua
      // marcada como não enviada na fila local e será tentada de novo depois).
      setTimeout(() => {
        if (this.onBinarioRecebido) {
          this.onBinarioRecebido = null;
          reject(new Error('Sem confirmação do envio da foto.'));
        }
      }, TIMEOUT_RESPOSTA_MS);
    });
  }
}
