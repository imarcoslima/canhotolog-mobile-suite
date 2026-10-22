/**
 * Recebimento de fotos: "photo_begin" valida e reserva o destino; o frame
 * BINÁRIO que chega logo em seguida (tratado em ws/server.ts, que é quem
 * sabe ler frames binários da conexão) é gravado em disco e registrado na
 * tabela conferencias_entrega_fotos.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from '../../config';
import { getCanhotoDb } from '../../db/canhotolog';
import { PhotoBeginRequest, LIMITE_TAMANHO_FOTO_BYTES } from '../protocol';

const EXTENSAO_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export interface FotoEmAndamento {
  tempId: string;
  conferenciaId: number;
  tamanhoAnunciado: number;
  caminhoRelativo: string;
  caminhoAbsoluto: string;
}

export async function tratarPhotoBegin(
  payload: PhotoBeginRequest,
): Promise<
  | { tipo: 'photo_ack'; corpo: { tempId: string; ok: true }; fotoEmAndamento: FotoEmAndamento }
  | { tipo: 'photo_err'; corpo: { tempId: string; msg: string } }
> {
  if (payload.tamanho > LIMITE_TAMANHO_FOTO_BYTES) {
    return { tipo: 'photo_err', corpo: { tempId: payload.tempId, msg: 'Foto maior que o limite de 8 MB.' } };
  }

  const extensao = EXTENSAO_POR_MIME[payload.mime] ?? 'jpg';

  const db = await getCanhotoDb();
  const conferencia = await db.get<{ id: number }>(
    'SELECT id FROM conferencias_entrega WHERE client_temp_id = ?',
    [payload.conferenciaClientTempId],
  );
  if (!conferencia) {
    return {
      tipo: 'photo_err',
      corpo: { tempId: payload.tempId, msg: 'Conferência ainda não confirmada pelo servidor — reenvie depois.' },
    };
  }

  const nomeArquivo = `${payload.tempId}.${extensao}`;
  const caminhoRelativo = path.join('conferencias', String(conferencia.id), nomeArquivo);
  const caminhoAbsoluto = path.join(config.uploadDir, caminhoRelativo);

  return {
    tipo: 'photo_ack',
    corpo: { tempId: payload.tempId, ok: true },
    fotoEmAndamento: {
      tempId: payload.tempId,
      conferenciaId: conferencia.id,
      tamanhoAnunciado: payload.tamanho,
      caminhoRelativo,
      caminhoAbsoluto,
    },
  };
}

export async function salvarFotoBinaria(
  fotoEmAndamento: FotoEmAndamento,
  bytes: Buffer,
): Promise<{ tipo: 'photo_ack' | 'photo_err'; corpo: { tempId: string; ok?: true; msg?: string } }> {
  if (bytes.byteLength > LIMITE_TAMANHO_FOTO_BYTES) {
    return { tipo: 'photo_err', corpo: { tempId: fotoEmAndamento.tempId, msg: 'Foto maior que o limite de 8 MB.' } };
  }
  try {
    await fs.mkdir(path.dirname(fotoEmAndamento.caminhoAbsoluto), { recursive: true });
    await fs.writeFile(fotoEmAndamento.caminhoAbsoluto, bytes);

    const db = await getCanhotoDb();
    await db.run('INSERT INTO conferencias_entrega_fotos (conferencia_id, arquivo) VALUES (?, ?)', [
      fotoEmAndamento.conferenciaId,
      fotoEmAndamento.caminhoRelativo,
    ]);

    return { tipo: 'photo_ack', corpo: { tempId: fotoEmAndamento.tempId, ok: true } };
  } catch (e) {
    return { tipo: 'photo_err', corpo: { tempId: fotoEmAndamento.tempId, msg: (e as Error).message } };
  }
}
