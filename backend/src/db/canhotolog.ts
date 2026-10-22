/**
 * Acesso ao MESMO banco do CanhotoLog web (SQLite ou SQL Server, conforme
 * DB_DRIVER) — o app mobile lê/grava exatamente as mesmas tabelas
 * "transportes", "usuarios" etc. que o sistema PHP usa, então um cadastro
 * feito pelo celular aparece no Painel web e vice-versa.
 *
 * Assim como o PDO do lado PHP abstrai as diferenças entre SQLite e SQL
 * Server usando sempre "?" como placeholder, esta camada faz o mesmo aqui:
 * todo o resto do backend escreve SQL com "?" e nunca precisa saber qual
 * driver está ativo por baixo.
 */
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import sql from 'mssql';
import { config } from '../config';

export interface ResultadoEscrita {
  lastInsertRowid: number;
  changes: number;
}

export interface CanhotoDb {
  get<T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]>;
  run(query: string, params?: unknown[]): Promise<ResultadoEscrita>;
  exec(query: string): Promise<void>;
}

// ------------------------------------------------------------------
// Driver SQLite (better-sqlite3 é síncrono; envolvemos em Promise só para
// a interface ficar igual à do driver SQL Server, que é assíncrono de verdade)
// ------------------------------------------------------------------
class SqliteDb implements CanhotoDb {
  private db: Database.Database;

  constructor(caminho: string) {
    const existiaAntes = fs.existsSync(caminho);
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
    this.db = new Database(caminho);
    // WAL melhora muito o acesso concorrente entre o processo do PHP
    // (servidor web) e este processo Node rodando ao mesmo tempo.
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    if (!existiaAntes) {
      throw new Error(
        `Banco SQLite não encontrado em ${caminho}. Rode o CanhotoLog web pelo menos uma vez ` +
          '(ele cria o schema automaticamente no primeiro acesso) antes de iniciar este backend.',
      );
    }
  }

  async get<T>(query: string, params: unknown[] = []): Promise<T | undefined> {
    return this.db.prepare(query).get(...params) as T | undefined;
  }

  async all<T>(query: string, params: unknown[] = []): Promise<T[]> {
    return this.db.prepare(query).all(...params) as T[];
  }

  async run(query: string, params: unknown[] = []): Promise<ResultadoEscrita> {
    const info = this.db.prepare(query).run(...params);
    return { lastInsertRowid: Number(info.lastInsertRowid), changes: info.changes };
  }

  async exec(query: string): Promise<void> {
    this.db.exec(query);
  }
}

// ------------------------------------------------------------------
// Driver SQL Server (mssql) — traduz "?" posicional para "@p0, @p1, ..."
// nomeado, que é o que a biblioteca espera.
// ------------------------------------------------------------------
class SqlServerDb implements CanhotoDb {
  private pool: sql.ConnectionPool;

  constructor(pool: sql.ConnectionPool) {
    this.pool = pool;
  }

  static async conectar(): Promise<SqlServerDb> {
    const pool = await new sql.ConnectionPool({
      server: config.sqlsrv.host,
      database: config.sqlsrv.database,
      user: config.sqlsrv.user,
      password: config.sqlsrv.password,
      options: { trustServerCertificate: true },
    }).connect();
    return new SqlServerDb(pool);
  }

  private montarRequest(query: string, params: unknown[]): { texto: string; request: sql.Request } {
    const request = this.pool.request();
    let indice = 0;
    const texto = query.replace(/\?/g, () => {
      const nome = `p${indice}`;
      request.input(nome, params[indice]);
      indice += 1;
      return `@${nome}`;
    });
    return { texto, request };
  }

  async get<T>(query: string, params: unknown[] = []): Promise<T | undefined> {
    const { texto, request } = this.montarRequest(query, params);
    const resultado = await request.query(texto);
    return resultado.recordset[0] as T | undefined;
  }

  async all<T>(query: string, params: unknown[] = []): Promise<T[]> {
    const { texto, request } = this.montarRequest(query, params);
    const resultado = await request.query(texto);
    return resultado.recordset as T[];
  }

  async run(query: string, params: unknown[] = []): Promise<ResultadoEscrita> {
    const { texto, request } = this.montarRequest(query, params);
    const resultado = await request.query(
      `${texto}; SELECT SCOPE_IDENTITY() AS lastInsertRowid;`,
    );
    const linha = (resultado.recordset?.[0] as { lastInsertRowid?: number }) ?? {};
    return {
      lastInsertRowid: Number(linha.lastInsertRowid ?? 0),
      changes: resultado.rowsAffected?.[0] ?? 0,
    };
  }

  async exec(query: string): Promise<void> {
    await this.pool.request().batch(query);
  }
}

let instancia: CanhotoDb | null = null;

export async function getCanhotoDb(): Promise<CanhotoDb> {
  if (instancia) {
    return instancia;
  }
  instancia = config.dbDriver === 'sqlsrv' ? await SqlServerDb.conectar() : new SqliteDb(config.sqlitePath);
  return instancia;
}
