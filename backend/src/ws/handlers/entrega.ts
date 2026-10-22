/**
 * Registrar Entrega (versão app): busca as etiquetas do kitbase relacionadas
 * à obra de uma NF, e grava o resultado da conferência (OK/defeito por
 * etiqueta + observação geral) nas tabelas locais conferencias_entrega* —
 * ver migrations.ts para o desenho dessas tabelas e o porquê de ficarem no
 * banco do CanhotoLog em vez do kitbase.
 */
import { getCanhotoDb } from '../../db/canhotolog';
import { kitbaseBuscarEtiquetasPorObra } from '../../db/kitbase';
import { Sessao } from '../session';
import {
  KitBuscarPorNfRequest,
  KitBuscarPorNfOk,
  KitBuscarPorNfErr,
  ConferenciaSubmitRequest,
  ConferenciaOk,
  ConferenciaErr,
  LIMITE_FOTOS_POR_CONFERENCIA,
  LIMITE_TAMANHO_FOTO_BYTES,
} from '../protocol';

export async function tratarKitBuscarPorNf(
  payload: KitBuscarPorNfRequest,
): Promise<
  { tipo: 'kit_buscar_por_nf_ok'; corpo: KitBuscarPorNfOk } | { tipo: 'kit_buscar_por_nf_err'; corpo: KitBuscarPorNfErr }
> {
  const db = await getCanhotoDb();
  const transporte = await db.get<{ obra: string }>(
    'SELECT obra FROM transportes WHERE numero_nf = ? ORDER BY id DESC LIMIT 1',
    [payload.numeroNf],
  );

  if (!transporte) {
    return {
      tipo: 'kit_buscar_por_nf_err',
      corpo: { msg: `NF ${payload.numeroNf} não encontrada no CanhotoLog. Cadastre o carregamento primeiro.` },
    };
  }

  let etiquetas;
  try {
    etiquetas = await kitbaseBuscarEtiquetasPorObra(transporte.obra);
  } catch (e) {
    return {
      tipo: 'kit_buscar_por_nf_err',
      corpo: { msg: `Não foi possível consultar o kitbase: ${(e as Error).message}` },
    };
  }

  if (etiquetas.length === 0) {
    return {
      tipo: 'kit_buscar_por_nf_err',
      corpo: { msg: `Nenhuma etiqueta encontrada no kitbase para a obra "${transporte.obra}".` },
    };
  }

  return {
    tipo: 'kit_buscar_por_nf_ok',
    corpo: { numeroNf: payload.numeroNf, obra: transporte.obra, etiquetas, origem: 'servidor' },
  };
}

export async function tratarConferenciaSubmit(
  payload: ConferenciaSubmitRequest,
  sessao: Sessao,
): Promise<{ tipo: 'conferencia_ok'; corpo: ConferenciaOk } | { tipo: 'conferencia_err'; corpo: ConferenciaErr }> {
  const erro = validar(payload);
  if (erro) {
    return { tipo: 'conferencia_err', corpo: { clientTempId: payload.clientTempId, msg: erro } };
  }

  const db = await getCanhotoDb();

  // Idempotência: reenvio do mesmo item da fila (client_temp_id é UNIQUE).
  const existente = await db.get<{ id: number }>(
    'SELECT id FROM conferencias_entrega WHERE client_temp_id = ?',
    [payload.clientTempId],
  );
  if (existente) {
    const fotosJaSalvas = await db.get<{ c: number }>(
      'SELECT COUNT(*) AS c FROM conferencias_entrega_fotos WHERE conferencia_id = ?',
      [existente.id],
    );
    return {
      tipo: 'conferencia_ok',
      corpo: {
        clientTempId: payload.clientTempId,
        conferenciaId: existente.id,
        fotosRecebidas: Number(fotosJaSalvas?.c ?? 0),
        fotosEsperadas: payload.fotos.length,
      },
    };
  }

  const resultado = await db.run(
    `INSERT INTO conferencias_entrega (numero_nf, obra, observacao_geral, usuario_id, client_temp_id)
     VALUES (?, ?, ?, ?, ?)`,
    [payload.numeroNf, payload.obra, payload.observacaoGeral, sessao.usuarioId, payload.clientTempId],
  );
  const conferenciaId = resultado.lastInsertRowid;

  for (const item of payload.itens) {
    await db.run(
      'INSERT INTO conferencias_entrega_itens (conferencia_id, etiqueta, status, defeitos) VALUES (?, ?, ?, ?)',
      [conferenciaId, String(item.etiqueta), item.status, item.defeitos.join(',') || null],
    );
  }

  return {
    tipo: 'conferencia_ok',
    corpo: {
      clientTempId: payload.clientTempId,
      conferenciaId,
      fotosRecebidas: 0,
      fotosEsperadas: payload.fotos.length,
    },
  };
}

function validar(payload: ConferenciaSubmitRequest): string | null {
  if (!payload.numeroNf?.trim()) return 'NF não informada.';
  if (!payload.obra?.trim()) return 'Obra não informada.';
  if (!payload.itens?.length) return 'Nenhum kit conferido.';
  if (payload.fotos.length > LIMITE_FOTOS_POR_CONFERENCIA) {
    return `No máximo ${LIMITE_FOTOS_POR_CONFERENCIA} fotos por entrega.`;
  }
  if (payload.fotos.some(f => f.tamanho > LIMITE_TAMANHO_FOTO_BYTES)) {
    return 'Uma ou mais fotos excedem o limite de 8 MB.';
  }
  return null;
}
