/**
 * Protocolo WebSocket entre o app (Android/iOS) e o servidor
 * (backend/src/ws). Mantido idêntico dos dois lados propositalmente — os
 * dois projetos são independentes (apps separados), então este arquivo é
 * espelhado em backend/src/ws/protocol.ts. Se um dia esse projeto virar um
 * monorepo, dá para extrair para um pacote compartilhado.
 *
 * Formato de cada mensagem (envelope), para ficar leve na banda:
 *   Cliente -> Servidor:  { v: 1, id: string, t: TipoMsgCliente, p: object }
 *   Servidor -> Cliente:  { v: 1, re?: string, t: TipoMsgServidor, p: object }
 * "re" (reply-to) ecoa o "id" da mensagem que originou a resposta, para o
 * cliente casar request/response mesmo com várias em voo ao mesmo tempo.
 * Mensagens sem "re" são iniciadas pelo servidor (ping, avisos).
 *
 * Fotos NÃO vão dentro do JSON (evita custo de base64, ~33% maior). O fluxo
 * é: envia um "photo_begin" (JSON) com metadados, seguido imediatamente por
 * um único frame BINÁRIO com os bytes do arquivo (já comprimido/redimensionado
 * no app antes de sair do aparelho). O servidor casa o binário com o
 * "photo_begin" mais recente daquela conexão (mensagens numa mesma conexão
 * WebSocket chegam em ordem, então isso é seguro).
 */

export const PROTOCOL_VERSION = 1;

/** Códigos de defeito do checklist de conferência (tela Registrar Entrega). */
export const DEFEITOS_KIT = [
  { codigo: 'fechadura_danificada', label: 'Fechadura danificada' },
  { codigo: 'salto_avariado', label: 'Salto com avaria' },
  { codigo: 'pintura_arranhada', label: 'Pintura arranhada' },
  { codigo: 'batente_quebrado', label: 'Batente quebrado' },
  { codigo: 'alisar_quebrado', label: 'Alisar quebrado' },
  { codigo: 'dobradica_defeito', label: 'Dobradiça com defeito' },
] as const;

export type CodigoDefeito = (typeof DEFEITOS_KIT)[number]['codigo'];

export interface EnvelopeCliente<T = unknown> {
  v: typeof PROTOCOL_VERSION;
  id: string;
  t: TipoMsgCliente;
  p: T;
}

export interface EnvelopeServidor<T = unknown> {
  v: typeof PROTOCOL_VERSION;
  re?: string;
  t: TipoMsgServidor;
  p: T;
}

export type TipoMsgCliente =
  | 'auth'
  | 'ping'
  | 'cadastro_new'
  | 'sap_sync_notas'
  | 'kit_buscar_por_nf'
  | 'conferencia_submit'
  | 'photo_begin'
  | 'sync_pull';

export type TipoMsgServidor =
  | 'auth_ok'
  | 'auth_err'
  | 'pong'
  | 'cadastro_ok'
  | 'cadastro_err'
  | 'sap_sync_notas_ok'
  | 'sap_sync_notas_err'
  | 'kit_buscar_por_nf_ok'
  | 'kit_buscar_por_nf_err'
  | 'conferencia_ok'
  | 'conferencia_err'
  | 'photo_ack'
  | 'photo_err'
  | 'sync_pull_ok'
  | 'erro_generico';

// ---------------------------------------------------------------------
// Payloads: auth
// ---------------------------------------------------------------------
/**
 * Autenticação por usuário/senha (primeiro login, feito na tela de Login)
 * OU por token de sessão salvo localmente (reconexão automática em segundo
 * plano, feita pelo syncManager — nunca guardamos a senha do usuário no
 * aparelho, só o token que o servidor emitiu no login anterior).
 */
export type AuthRequest = { usuario: string; senha: string } | { sessionToken: string };

export interface AuthOk {
  sessionToken: string;
  usuarioId: number;
  nome: string;
  perfil: 'transporte' | 'entrega';
  expiraEm: string; // ISO
}

export interface AuthErr {
  msg: string;
}

// ---------------------------------------------------------------------
// Payloads: cadastro de carregamento (Novo Cadastro)
// ---------------------------------------------------------------------
export interface CadastroNewRequest {
  clientTempId: string; // uuid gerado no app — evita duplicar se reenviado
  numeroNf: string;
  numeroSerie: string | null;
  dataCarregamento: string; // ISO date (o momento da coleta, mesmo se offline)
  nomeMotorista: string;
  cpfMotorista: string;
  placaVeiculo: string;
  obra: string;
  uf: string;
  observacoes: string | null;
}

export interface CadastroOk {
  clientTempId: string;
  id: number;
}

export interface CadastroErr {
  clientTempId: string;
  msg: string;
}

// ---------------------------------------------------------------------
// Payloads: sincronização de notas fiscais pendentes via SAP B1 (HANA)
// ---------------------------------------------------------------------
export interface SapSyncNotasOk {
  notas: Array<{
    numeroNf: string;
    dataEmissao: string | null;
    cliente: string | null;
  }>;
  sincronizadoEm: string; // ISO
}

export interface SapSyncNotasErr {
  msg: string;
}

// ---------------------------------------------------------------------
// Payloads: busca de etiquetas do kitbase pela obra (via NF)
// ---------------------------------------------------------------------
export interface KitBuscarPorNfRequest {
  numeroNf: string;
}

export interface KitResumo {
  etiqueta: number;
  obra: string | null;
  construtora: string | null;
  bloco: string | null;
  andar: string | null;
  aptos: string | null;
  comodo: string | null;
  abertura: string | null;
  kit: string | null;
  cor: string | null;
  altura: string | null;
  largura: string | null;
  statusAtual: string | null;
}

export interface KitBuscarPorNfOk {
  numeroNf: string;
  obra: string;
  etiquetas: KitResumo[];
  origem: 'servidor' | 'cache'; // o servidor sempre manda 'servidor'; o app usa 'cache' quando offline
}

export interface KitBuscarPorNfErr {
  msg: string;
}

// ---------------------------------------------------------------------
// Payloads: conferência de entrega (checklist por etiqueta + fotos gerais)
// ---------------------------------------------------------------------
export interface ConferenciaItem {
  etiqueta: number;
  status: 'ok' | 'defeito';
  defeitos: CodigoDefeito[]; // vazio quando status === 'ok'
}

export interface ConferenciaSubmitRequest {
  clientTempId: string;
  numeroNf: string;
  obra: string;
  itens: ConferenciaItem[];
  observacaoGeral: string | null;
  fotos: Array<{ tempId: string; nomeArquivo: string; mime: string; tamanho: number }>;
  criadoEmCliente: string; // ISO
}

export interface ConferenciaOk {
  clientTempId: string;
  conferenciaId: number;
  fotosRecebidas: number;
  fotosEsperadas: number;
}

export interface ConferenciaErr {
  clientTempId: string;
  msg: string;
}

// ---------------------------------------------------------------------
// Payloads: envio de foto (metadados; bytes vêm no frame binário seguinte)
// ---------------------------------------------------------------------
export interface PhotoBeginRequest {
  conferenciaClientTempId: string;
  tempId: string;
  mime: string;
  tamanho: number;
}

export interface PhotoAck {
  tempId: string;
  ok: true;
}

export interface PhotoErr {
  tempId: string;
  msg: string;
}

// ---------------------------------------------------------------------
// Limites (espelhar no app E no servidor — o servidor é quem manda de verdade)
// ---------------------------------------------------------------------
export const LIMITE_FOTOS_POR_CONFERENCIA = 8;
export const LIMITE_TAMANHO_FOTO_BYTES = 8 * 1024 * 1024; // 8 MB
