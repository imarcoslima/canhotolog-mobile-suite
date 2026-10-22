/**
 * Integração com a Service Layer do SAP Business One — mesma lógica (e
 * mesmos campos configuráveis) de transporte/includes/sap_b1.php no
 * CanhotoLog web, só que em Node: faz login, busca as notas fiscais de
 * saída (recurso/campos vêm de config.sapB1.*) e faz upsert na MESMA
 * tabela local "notas_fiscais_saida" que o sistema web já usa e lê.
 *
 * Reaproveita a tabela em vez de criar uma cópia própria do app — assim,
 * sincronizar pelo celular também deixa a lista pronta pra quem usa o
 * sistema web (e vice-versa).
 */
import https from 'node:https';
import { config } from './config';
import { getCanhotoDb } from './db/canhotolog';

interface NotaSap {
  numeroNf: string;
  dataEmissao: string | null;
  clienteObra: string | null;
  origemDocEntry: string | null;
}

function agenteHttps(): https.Agent | undefined {
  return config.sapB1.verificarSsl ? undefined : new https.Agent({ rejectUnauthorized: false });
}

async function requisicao(
  metodo: string,
  caminho: string,
  sessionId: string | null,
  corpo?: unknown,
): Promise<Record<string, unknown>> {
  const url = config.sapB1.serviceLayerUrl + caminho.replace(/ /g, '%20');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionId) {
    headers.Cookie = `B1SESSION=${sessionId}`;
  }

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: metodo,
      headers,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      // @ts-expect-error — "agent" é uma extensão do runtime Node ao fetch, não faz parte do tipo padrão do DOM.
      agent: agenteHttps(),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw new Error(
      `Não foi possível conectar à Service Layer do SAP B1 em "${config.sapB1.serviceLayerUrl}" ` +
        `(${(e as Error).message}). Confira o endereço, a porta e se o servidor está acessível a partir de ` +
        'onde este backend está rodando.',
    );
  }

  const texto = await resposta.text();
  const corpoDecodificado = texto ? JSON.parse(texto) : {};

  if (resposta.status >= 400) {
    const mensagemErro =
      (corpoDecodificado?.error?.message?.value as string | undefined) ?? `HTTP ${resposta.status}`;
    throw new Error(`A Service Layer do SAP B1 retornou um erro: ${mensagemErro}`);
  }

  return corpoDecodificado;
}

async function login(): Promise<string> {
  const resposta = await requisicao('POST', '/Login', null, {
    CompanyDB: config.sapB1.companyDb,
    UserName: config.sapB1.user,
    Password: config.sapB1.password,
  });
  const sessionId = resposta.SessionId as string | undefined;
  if (!sessionId) {
    throw new Error(
      'Não foi possível autenticar na Service Layer do SAP B1. Confira usuário, senha e o CompanyDB.',
    );
  }
  return sessionId;
}

async function logout(sessionId: string): Promise<void> {
  try {
    await requisicao('POST', '/Logout', sessionId);
  } catch {
    // Sem problema: a sessão expira sozinha no SAP B1 depois de um tempo.
  }
}

function normalizarData(valor: unknown): string | null {
  if (!valor) {
    return null;
  }
  const data = new Date(String(valor));
  if (Number.isNaN(data.getTime())) {
    return null;
  }
  return data.toISOString().slice(0, 10);
}

async function buscarNotas(sessionId: string): Promise<NotaSap[]> {
  const caminho = `/${config.sapB1.nfResource.replace(/^\//, '')}${config.sapB1.nfQuery}`;
  const resposta = await requisicao('GET', caminho, sessionId);
  const itens = resposta.value as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(itens)) {
    throw new Error(
      'A Service Layer respondeu em um formato inesperado ao buscar notas fiscais (esperava uma lista em "value").',
    );
  }

  const notas: NotaSap[] = [];
  for (const item of itens) {
    const numero = item[config.sapB1.campoNumeroNf];
    if (numero === null || numero === undefined || numero === '') {
      continue;
    }
    notas.push({
      numeroNf: String(numero),
      dataEmissao: normalizarData(item[config.sapB1.campoDataEmissao]),
      clienteObra: item[config.sapB1.campoCliente] != null ? String(item[config.sapB1.campoCliente]) : null,
      origemDocEntry: item.DocEntry != null ? String(item.DocEntry) : null,
    });
  }
  return notas;
}

/** Login + busca + upsert local — chamado a cada "sap_sync_notas" do app. */
export async function sapB1Sincronizar(): Promise<number> {
  const sessionId = await login();
  let notas: NotaSap[];
  try {
    notas = await buscarNotas(sessionId);
  } finally {
    await logout(sessionId);
  }

  const db = await getCanhotoDb();
  for (const nota of notas) {
    if (config.dbDriver === 'sqlsrv') {
      await db.run(
        `IF EXISTS (SELECT 1 FROM notas_fiscais_saida WHERE numero_nf = ?)
           UPDATE notas_fiscais_saida
           SET data_emissao = ?, cliente_obra = ?, origem_doc_entry = ?, sincronizado_em = GETDATE()
           WHERE numero_nf = ?
         ELSE
           INSERT INTO notas_fiscais_saida (numero_nf, data_emissao, cliente_obra, origem_doc_entry, sincronizado_em)
           VALUES (?, ?, ?, ?, GETDATE())`,
        [
          nota.numeroNf,
          nota.dataEmissao, nota.clienteObra, nota.origemDocEntry, nota.numeroNf,
          nota.numeroNf, nota.dataEmissao, nota.clienteObra, nota.origemDocEntry,
        ],
      );
    } else {
      await db.run(
        `INSERT INTO notas_fiscais_saida (numero_nf, data_emissao, cliente_obra, origem_doc_entry, sincronizado_em)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(numero_nf) DO UPDATE SET
           data_emissao = excluded.data_emissao,
           cliente_obra = excluded.cliente_obra,
           origem_doc_entry = excluded.origem_doc_entry,
           sincronizado_em = excluded.sincronizado_em`,
        [nota.numeroNf, nota.dataEmissao, nota.clienteObra, nota.origemDocEntry],
      );
    }
  }
  return notas.length;
}

export interface NotaPendente {
  numero_nf: string;
  data_emissao: string | null;
  cliente_obra: string | null;
}

/** Mesma consulta de notas_pendentes.php: notas do SAP sem cadastro local ainda. */
export async function buscarNotasPendentes(): Promise<NotaPendente[]> {
  const db = await getCanhotoDb();
  return db.all<NotaPendente>(
    `SELECT n.numero_nf, n.data_emissao, n.cliente_obra
     FROM notas_fiscais_saida n
     LEFT JOIN transportes t ON t.numero_nf = n.numero_nf
     WHERE t.id IS NULL
     ORDER BY n.data_emissao DESC, n.numero_nf DESC`,
  );
}
