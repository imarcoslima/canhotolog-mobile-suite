/**
 * Servidor WebSocket do CanhotoLog Mobile. Um único WebSocketServer cuida de
 * todas as conexões dos apps (Android/iOS); cada conexão carrega seu próprio
 * estado (sessão autenticada, foto binária em andamento) — a sessão em si é
 * validada contra o Map em memória de ws/session.ts, não fica presa à
 * conexão (uma reconexão reautentica e retoma normalmente).
 *
 * Mensagens de texto = JSON (protocolo em ws/protocol.ts). Mensagens
 * binárias só são esperadas logo depois de um "photo_begin" — qualquer
 * binário fora desse contexto é ignorado.
 */
import http from 'node:http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { config } from '../config';
import { getCanhotoDb } from '../db/canhotolog';
import { migrarBancoParaMobile } from '../db/migrations';
import { validarSessao, Sessao } from './session';
import {
  EnvelopeCliente,
  EnvelopeServidor,
  PROTOCOL_VERSION,
  TipoMsgCliente,
  TipoMsgServidor,
} from './protocol';
import { tratarAuth } from './handlers/auth';
import { tratarCadastroNew } from './handlers/cadastro';
import { tratarSapSyncNotas } from './handlers/sap';
import { tratarKitBuscarPorNf, tratarConferenciaSubmit } from './handlers/entrega';
import { tratarPhotoBegin, salvarFotoBinaria, FotoEmAndamento } from './handlers/photo';

interface EstadoConexao {
  sessao: Sessao | null;
  fotoEmAndamento: FotoEmAndamento | null;
}

function enviar<T>(ws: WebSocket, t: TipoMsgServidor, p: T, re?: string): void {
  if (ws.readyState !== ws.OPEN) {
    return;
  }
  const env: EnvelopeServidor<T> = { v: PROTOCOL_VERSION, t, p, ...(re ? { re } : {}) };
  ws.send(JSON.stringify(env));
}

/** Mapeia cada tipo de mensagem do cliente para o tipo "_err" correspondente, usado quando falta autenticação. */
const TIPO_ERRO_POR_TIPO: Partial<Record<TipoMsgCliente, TipoMsgServidor>> = {
  cadastro_new: 'cadastro_err',
  sap_sync_notas: 'sap_sync_notas_err',
  kit_buscar_por_nf: 'kit_buscar_por_nf_err',
  conferencia_submit: 'conferencia_err',
  photo_begin: 'photo_err',
};

async function tratarMensagemJson(
  ws: WebSocket,
  estado: EstadoConexao,
  env: EnvelopeCliente,
): Promise<void> {
  if (env.t === 'ping') {
    enviar(ws, 'pong', {}, env.id);
    return;
  }

  if (env.t === 'auth') {
    const resultado = await tratarAuth(env.p as never);
    if (resultado.tipo === 'auth_ok') {
      // Reidrata a sessão nesta conexão a partir do token recém-emitido.
      estado.sessao = validarSessao(resultado.corpo.sessionToken);
    }
    enviar(ws, resultado.tipo, resultado.corpo, env.id);
    return;
  }

  if (!estado.sessao) {
    const tipoErro = TIPO_ERRO_POR_TIPO[env.t] ?? 'erro_generico';
    enviar(ws, tipoErro, { msg: 'Não autenticado. Faça login novamente.' }, env.id);
    return;
  }

  switch (env.t) {
    case 'cadastro_new': {
      const resultado = await tratarCadastroNew(env.p as never, estado.sessao);
      enviar(ws, resultado.tipo, resultado.corpo, env.id);
      return;
    }
    case 'sap_sync_notas': {
      const resultado = await tratarSapSyncNotas();
      enviar(ws, resultado.tipo, resultado.corpo, env.id);
      return;
    }
    case 'kit_buscar_por_nf': {
      const resultado = await tratarKitBuscarPorNf(env.p as never);
      enviar(ws, resultado.tipo, resultado.corpo, env.id);
      return;
    }
    case 'conferencia_submit': {
      const resultado = await tratarConferenciaSubmit(env.p as never, estado.sessao);
      enviar(ws, resultado.tipo, resultado.corpo, env.id);
      return;
    }
    case 'photo_begin': {
      const resultado = await tratarPhotoBegin(env.p as never);
      if (resultado.tipo === 'photo_ack') {
        estado.fotoEmAndamento = resultado.fotoEmAndamento;
      }
      enviar(ws, resultado.tipo, resultado.corpo, env.id);
      return;
    }
    default:
      enviar(ws, 'erro_generico', { msg: `Tipo de mensagem não reconhecido: ${env.t}` }, env.id);
  }
}

async function tratarMensagemBinaria(ws: WebSocket, estado: EstadoConexao, dado: Buffer): Promise<void> {
  if (!estado.fotoEmAndamento) {
    // Binário sem um "photo_begin" correspondente — ignora silenciosamente
    // (pode acontecer se o app reconectou no meio do envio de uma foto).
    return;
  }
  const fotoEmAndamento = estado.fotoEmAndamento;
  estado.fotoEmAndamento = null;

  const resultado = await salvarFotoBinaria(fotoEmAndamento, dado);
  // SEM "re": não é resposta a nenhuma mensagem de texto específica — o
  // cliente casa pelo tempId dentro do payload (ver api/wsClient.ts do app).
  enviar(ws, resultado.tipo, resultado.corpo);
}

export async function iniciarServidor(): Promise<void> {
  const db = await getCanhotoDb();
  await migrarBancoParaMobile(db);

  const servidorHttp = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server: servidorHttp, path: '/ws' });

  wss.on('connection', ws => {
    const estado: EstadoConexao = { sessao: null, fotoEmAndamento: null };

    ws.on('message', (dado: RawData, isBinary: boolean) => {
      if (isBinary) {
        const buffer = Array.isArray(dado) ? Buffer.concat(dado) : Buffer.from(dado as ArrayBuffer);
        tratarMensagemBinaria(ws, estado, buffer).catch(erro => {
          console.error('[ws] erro ao tratar foto binária:', erro);
        });
        return;
      }

      let env: EnvelopeCliente;
      try {
        env = JSON.parse(dado.toString('utf8'));
      } catch {
        return;
      }
      tratarMensagemJson(ws, estado, env).catch(erro => {
        console.error('[ws] erro ao tratar mensagem:', env.t, erro);
        enviar(ws, 'erro_generico', { msg: 'Erro interno ao processar a solicitação.' }, env.id);
      });
    });
  });

  servidorHttp.listen(config.wsPort, () => {
    console.log(`[ws] CanhotoLog Mobile backend ouvindo em ws://0.0.0.0:${config.wsPort}/ws`);
  });
}
