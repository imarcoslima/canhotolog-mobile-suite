/**
 * Migrações leves do banco do CanhotoLog para suportar o app mobile — mesmo
 * espírito das funções migrarXxx() em db.php do sistema web: rodam toda vez
 * que o backend inicia, e não fazem nada se já tiverem sido aplicadas antes.
 *
 * Novidades trazidas pelo app:
 *   - transportes.numero_serie: número de série do SAP B1 (OINV.Serial),
 *     coletado no Novo Cadastro do app (o cadastro.php web pode ganhar esse
 *     campo depois, se quiserem — por ora só o app usa).
 *   - conferencias_entrega / _itens / _fotos: registram a conferência de
 *     etiquetas (kits) feita na tela "Registrar Entrega" do app — o
 *     resultado (OK/defeito por etiqueta), a observação geral e as até 8
 *     fotos ficam aqui, já que o kitbase não guarda nada disso.
 */
import { CanhotoDb } from './canhotolog';
import { config } from '../config';

export async function migrarBancoParaMobile(db: CanhotoDb): Promise<void> {
  await migrarColunaNumeroSerie(db);
  await migrarTabelasConferencia(db);
}

async function migrarColunaNumeroSerie(db: CanhotoDb): Promise<void> {
  try {
    if (config.dbDriver === 'sqlsrv') {
      const existe = await db.get<{ c: number }>(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_NAME = 'transportes' AND COLUMN_NAME = 'numero_serie'`,
      );
      if (!existe || Number(existe.c) === 0) {
        await db.exec('ALTER TABLE transportes ADD numero_serie NVARCHAR(50) NULL');
      }
    } else {
      const colunas = await db.all<{ name: string }>('PRAGMA table_info(transportes)');
      if (!colunas.some(c => c.name === 'numero_serie')) {
        await db.exec('ALTER TABLE transportes ADD COLUMN numero_serie TEXT');
      }
    }
  } catch (e) {
    // Silencioso, mesmo padrão do db.php: se a tabela transportes ainda nem
    // existir (CanhotoLog web nunca rodou), não há nada a migrar ainda.
    console.warn('[migracao] numero_serie:', (e as Error).message);
  }
}

async function migrarTabelasConferencia(db: CanhotoDb): Promise<void> {
  try {
    if (config.dbDriver === 'sqlsrv') {
      await db.exec(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'conferencias_entrega' AND xtype = 'U')
        BEGIN
          CREATE TABLE conferencias_entrega (
            id                INT IDENTITY(1,1) PRIMARY KEY,
            numero_nf         NVARCHAR(50) NOT NULL,
            obra              NVARCHAR(300) NOT NULL,
            observacao_geral  NVARCHAR(MAX) NULL,
            usuario_id        INT NULL,
            client_temp_id    NVARCHAR(64) NOT NULL UNIQUE,
            criado_em         DATETIME NOT NULL DEFAULT GETDATE(),
            CONSTRAINT FK_conferencias_entrega_usuarios FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
          );
          CREATE INDEX idx_conferencias_entrega_nf ON conferencias_entrega(numero_nf);
        END
      `);
      await db.exec(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'conferencias_entrega_itens' AND xtype = 'U')
        BEGIN
          CREATE TABLE conferencias_entrega_itens (
            id               INT IDENTITY(1,1) PRIMARY KEY,
            conferencia_id   INT NOT NULL,
            etiqueta         NVARCHAR(50) NOT NULL,
            status           NVARCHAR(10) NOT NULL, -- 'ok' | 'defeito'
            defeitos         NVARCHAR(500) NULL,    -- códigos separados por vírgula
            CONSTRAINT FK_conferencias_itens_conferencia FOREIGN KEY (conferencia_id) REFERENCES conferencias_entrega(id)
          );
          CREATE INDEX idx_conferencias_itens_conferencia ON conferencias_entrega_itens(conferencia_id);
        END
      `);
      await db.exec(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'conferencias_entrega_fotos' AND xtype = 'U')
        BEGIN
          CREATE TABLE conferencias_entrega_fotos (
            id               INT IDENTITY(1,1) PRIMARY KEY,
            conferencia_id   INT NOT NULL,
            arquivo          NVARCHAR(255) NOT NULL,
            CONSTRAINT FK_conferencias_fotos_conferencia FOREIGN KEY (conferencia_id) REFERENCES conferencias_entrega(id)
          );
        END
      `);
    } else {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS conferencias_entrega (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          numero_nf         TEXT NOT NULL,
          obra              TEXT NOT NULL,
          observacao_geral  TEXT,
          usuario_id        INTEGER,
          client_temp_id    TEXT NOT NULL UNIQUE,
          criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        );
        CREATE INDEX IF NOT EXISTS idx_conferencias_entrega_nf ON conferencias_entrega(numero_nf);

        CREATE TABLE IF NOT EXISTS conferencias_entrega_itens (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          conferencia_id   INTEGER NOT NULL,
          etiqueta         TEXT NOT NULL,
          status           TEXT NOT NULL,
          defeitos         TEXT,
          FOREIGN KEY (conferencia_id) REFERENCES conferencias_entrega(id)
        );
        CREATE INDEX IF NOT EXISTS idx_conferencias_itens_conferencia ON conferencias_entrega_itens(conferencia_id);

        CREATE TABLE IF NOT EXISTS conferencias_entrega_fotos (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          conferencia_id   INTEGER NOT NULL,
          arquivo          TEXT NOT NULL,
          FOREIGN KEY (conferencia_id) REFERENCES conferencias_entrega(id)
        );
      `);
    }
  } catch (e) {
    console.warn('[migracao] tabelas de conferência:', (e as Error).message);
  }
}
