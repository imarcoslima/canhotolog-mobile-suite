/**
 * Acesso ao banco "kitbase" (SQL Server) — mesmo banco já usado pelo menu
 * Descarga do CanhotoLog web (ver transporte/includes/kitbase.php), aqui
 * consultado para carregar TODAS as etiquetas de uma obra de uma vez, para
 * a conferência de entrega do app.
 *
 * Diferente da tela de Descarga (que busca 1 etiqueta por vez e só aceita
 * um conjunto de status "elegíveis"), aqui trazemos todas as etiquetas da
 * obra, em qualquer status — a conferência de entrega é sobre inspecionar
 * fisicamente o que chegou, não sobre mudar o status de despacho. Se um dia
 * a Adooren quiser restringir por status aqui também, é só aplicar o mesmo
 * filtro que kitbaseStatusPermitidos() usa no lado PHP.
 */
import sql from 'mssql';
import { config } from '../config';
import { KitResumo } from '../ws/protocol';

let pool: sql.ConnectionPool | null = null;

async function getPool(): Promise<sql.ConnectionPool> {
  if (pool) {
    return pool;
  }
  pool = await new sql.ConnectionPool({
    server: config.kitbase.host,
    database: config.kitbase.database,
    user: config.kitbase.user,
    password: config.kitbase.password,
    options: { trustServerCertificate: true },
  }).connect();
  return pool;
}

interface LinhaKitbase {
  etiqueta: number;
  obra: string | null;
  construtora: string | null;
  bloco: string | null;
  andar: string | null;
  aptos: string | null;
  comodo: string | null;
  abertura: string | null;
  carrkit: string | null;
  kit: string | null;
  cor: string | null;
  altura: string | null;
  largura: string | null;
}

export async function kitbaseBuscarEtiquetasPorObra(obra: string): Promise<KitResumo[]> {
  const conexao = await getPool();
  const resultado = await conexao
    .request()
    .input('obra', sql.NVarChar, obra)
    .query<LinhaKitbase>(
      `SELECT [cód] AS etiqueta, obra, construtora, bloco, andar, aptos, comodo, abertura,
              [carr kit] AS carrkit, kit, cor, altura, largura
       FROM kitbase.dbo.[T00001 -Planilha Base]
       WHERE obra = @obra`,
    );

  return resultado.recordset.map(linha => ({
    etiqueta: linha.etiqueta,
    obra: linha.obra,
    construtora: linha.construtora,
    bloco: linha.bloco,
    andar: linha.andar,
    aptos: linha.aptos,
    comodo: linha.comodo,
    abertura: linha.abertura,
    kit: linha.kit,
    cor: linha.cor,
    altura: linha.altura,
    largura: linha.largura,
    statusAtual: linha.carrkit,
  }));
}
