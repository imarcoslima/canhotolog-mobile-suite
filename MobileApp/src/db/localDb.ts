/**
 * Banco local (SQLite via op-sqlite) do app — é o que faz o app funcionar
 * "mesmo sem conexão": toda tela grava aqui primeiro (na hora, sem esperar
 * rede) e o sync/syncManager.ts é quem depois envia isso pro servidor quando
 * a conexão estiver disponível.
 *
 * Tabelas:
 *   - outbox: fila genérica de mensagens ainda não confirmadas pelo servidor
 *     (cadastro de carregamento, conferência de entrega).
 *   - kits_cache: última lista de etiquetas de uma obra vista com sucesso,
 *     para a tela de conferência continuar usável mesmo sem internet.
 *   - fotos_pendentes: fotos já tiradas/anexadas, aguardando envio (ligadas
 *     a um item da outbox pelo clientTempId da conferência).
 *   - sessao: token de autenticação da última vez que logou com sucesso.
 */
import { open, DB } from '@op-engineering/op-sqlite';

let db: DB | null = null;

export function getDb(): DB {
  if (!db) {
    db = open({ name: 'canhotolog_mobile.sqlite' });
    migrar(db);
  }
  return db;
}

function migrar(instancia: DB): void {
  instancia.executeSync(`
    CREATE TABLE IF NOT EXISTS outbox (
      id            TEXT PRIMARY KEY,
      tipo          TEXT NOT NULL,           -- 'cadastro_new' | 'conferencia_submit'
      payload_json  TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pendente', -- 'pendente' | 'enviando' | 'enviado' | 'erro'
      tentativas    INTEGER NOT NULL DEFAULT 0,
      ultimo_erro   TEXT,
      criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  instancia.executeSync(`
    CREATE TABLE IF NOT EXISTS kits_cache (
      numero_nf   TEXT PRIMARY KEY,
      obra        TEXT NOT NULL,
      etiquetas_json TEXT NOT NULL,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  instancia.executeSync(`
    CREATE TABLE IF NOT EXISTS fotos_pendentes (
      temp_id                  TEXT PRIMARY KEY,
      conferencia_client_temp_id TEXT NOT NULL,
      caminho_arquivo          TEXT NOT NULL,
      mime                     TEXT NOT NULL,
      tamanho                  INTEGER NOT NULL,
      enviada                  INTEGER NOT NULL DEFAULT 0,
      criado_em                TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  instancia.executeSync(`
    CREATE TABLE IF NOT EXISTS sessao (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );
  `);
}

// ------------------------------------------------------------------
// Sessão (token de autenticação, perfil do usuário logado)
// ------------------------------------------------------------------
export function salvarSessao(campos: Record<string, string>): void {
  const instancia = getDb();
  Object.entries(campos).forEach(([chave, valor]) => {
    instancia.executeSync(
      'INSERT INTO sessao (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
      [chave, valor],
    );
  });
}

export function lerSessao(): Record<string, string> {
  const instancia = getDb();
  const { rows } = instancia.executeSync('SELECT chave, valor FROM sessao');
  const resultado: Record<string, string> = {};
  rows.forEach((linha: any) => {
    resultado[linha.chave] = linha.valor;
  });
  return resultado;
}

export function limparSessao(): void {
  getDb().executeSync('DELETE FROM sessao');
}

// ------------------------------------------------------------------
// Outbox
// ------------------------------------------------------------------
export interface ItemOutbox {
  id: string;
  tipo: 'cadastro_new' | 'conferencia_submit';
  payload_json: string;
  status: 'pendente' | 'enviando' | 'enviado' | 'erro';
  tentativas: number;
  ultimo_erro: string | null;
  criado_em: string;
}

export function enfileirar(id: string, tipo: ItemOutbox['tipo'], payload: unknown): void {
  getDb().executeSync(
    'INSERT INTO outbox (id, tipo, payload_json) VALUES (?, ?, ?)',
    [id, tipo, JSON.stringify(payload)],
  );
}

export function listarPendentes(): ItemOutbox[] {
  const { rows } = getDb().executeSync(
    "SELECT * FROM outbox WHERE status IN ('pendente', 'erro') ORDER BY criado_em ASC",
  );
  return rows as unknown as ItemOutbox[];
}

export function marcarStatus(id: string, status: ItemOutbox['status'], erro?: string): void {
  getDb().executeSync(
    "UPDATE outbox SET status = ?, ultimo_erro = ?, tentativas = tentativas + CASE WHEN ? = 'erro' THEN 1 ELSE 0 END, atualizado_em = datetime('now') WHERE id = ?",
    [status, erro ?? null, status, id],
  );
}

// ------------------------------------------------------------------
// Cache de etiquetas por NF (para a tela de conferência funcionar offline
// quando a obra já foi carregada pelo menos uma vez com internet)
// ------------------------------------------------------------------
export function salvarCacheKits(numeroNf: string, obra: string, etiquetas: unknown[]): void {
  getDb().executeSync(
    `INSERT INTO kits_cache (numero_nf, obra, etiquetas_json, atualizado_em)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(numero_nf) DO UPDATE SET obra = excluded.obra, etiquetas_json = excluded.etiquetas_json, atualizado_em = excluded.atualizado_em`,
    [numeroNf, obra, JSON.stringify(etiquetas)],
  );
}

export function lerCacheKits(numeroNf: string): { obra: string; etiquetas: unknown[] } | null {
  const { rows } = getDb().executeSync(
    'SELECT obra, etiquetas_json FROM kits_cache WHERE numero_nf = ?',
    [numeroNf],
  );
  const linha = rows[0] as any;
  if (!linha) {
    return null;
  }
  return { obra: linha.obra, etiquetas: JSON.parse(linha.etiquetas_json) };
}

// ------------------------------------------------------------------
// Fotos pendentes de envio
// ------------------------------------------------------------------
export function salvarFotoPendente(
  tempId: string,
  conferenciaClientTempId: string,
  caminhoArquivo: string,
  mime: string,
  tamanho: number,
): void {
  getDb().executeSync(
    `INSERT INTO fotos_pendentes (temp_id, conferencia_client_temp_id, caminho_arquivo, mime, tamanho)
     VALUES (?, ?, ?, ?, ?)`,
    [tempId, conferenciaClientTempId, caminhoArquivo, mime, tamanho],
  );
}

export function listarFotosPendentesDaConferencia(conferenciaClientTempId: string) {
  const { rows } = getDb().executeSync(
    'SELECT * FROM fotos_pendentes WHERE conferencia_client_temp_id = ? AND enviada = 0',
    [conferenciaClientTempId],
  );
  return rows as any[];
}

export function marcarFotoEnviada(tempId: string): void {
  getDb().executeSync('UPDATE fotos_pendentes SET enviada = 1 WHERE temp_id = ?', [tempId]);
}
