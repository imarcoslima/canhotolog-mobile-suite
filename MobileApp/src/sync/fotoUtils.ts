/**
 * Utilitários de foto: tirar/escolher (já redimensionada pela própria
 * biblioteca, para economizar banda antes mesmo de sair do aparelho) e ler
 * os bytes do arquivo local como ArrayBuffer (para mandar binário puro pelo
 * WebSocket, sem custo de base64 na rede — o base64 aqui é só um passo
 * intermediário local, de arquivo -> memória, e não trafega assim).
 */
import { launchCamera, launchImageLibrary, Asset } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import { toByteArray } from 'base64-js';
import { LIMITE_TAMANHO_FOTO_BYTES } from '../types/protocol';

/**
 * Limites passados pro seletor nativo — a foto já sai da câmera/galeria
 * redimensionada, então não precisamos de uma etapa extra de compressão em
 * JS. 1600px no maior lado e qualidade 70% dão um bom equilíbrio
 * tamanho/legibilidade para fotos de comprovação (não são material de
 * impressão), o que já cobre a exigência de "economizar banda".
 */
const OPCOES_IMAGEM = {
  mediaType: 'photo' as const,
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.7 as const,
  includeBase64: false,
  saveToPhotos: false,
};

export interface FotoSelecionada {
  uri: string;
  mime: string;
  tamanho: number;
  nomeArquivo: string;
}

function ativoParaFoto(asset: Asset): FotoSelecionada | null {
  if (!asset.uri) {
    return null;
  }
  return {
    uri: asset.uri,
    mime: asset.type ?? 'image/jpeg',
    tamanho: asset.fileSize ?? 0,
    nomeArquivo: asset.fileName ?? `foto_${Date.now()}.jpg`,
  };
}

export async function tirarFoto(): Promise<FotoSelecionada | null> {
  const resultado = await launchCamera(OPCOES_IMAGEM);
  if (resultado.didCancel || !resultado.assets?.[0]) {
    return null;
  }
  return ativoParaFoto(resultado.assets[0]);
}

export async function escolherFotoDaGaleria(): Promise<FotoSelecionada | null> {
  const resultado = await launchImageLibrary(OPCOES_IMAGEM);
  if (resultado.didCancel || !resultado.assets?.[0]) {
    return null;
  }
  return ativoParaFoto(resultado.assets[0]);
}

export function fotoDentroDoLimite(tamanho: number): boolean {
  return tamanho > 0 && tamanho <= LIMITE_TAMANHO_FOTO_BYTES;
}

/** Lê o arquivo local e devolve os bytes prontos para ir num frame binário do WebSocket. */
export async function lerArquivoComoArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const base64 = await RNFS.readFile(uri, 'base64');
  const bytes = toByteArray(base64);
  // bytes.buffer é sempre um ArrayBuffer de verdade aqui (o Uint8Array veio de
  // toByteArray(), nunca de uma view sobre SharedArrayBuffer) — o "as" só
  // contorna o tipo genérico ArrayBufferLike do TypeScript.
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
