/**
 * Configuração central do backend — espelha as mesmas variáveis usadas em
 * config.php do CanhotoLog web, para os dois sistemas apontarem para a
 * mesma infraestrutura sem duplicar decisões.
 */
import 'dotenv/config';
import path from 'node:path';

function obrigatoria(nome: string, padrao: string): string {
  return process.env[nome] ?? padrao;
}

export const config = {
  wsPort: Number(obrigatoria('WS_PORT', '8787')),
  sessionTtlHoras: Number(obrigatoria('SESSION_TTL_HORAS', '12')),
  uploadDir: path.resolve(__dirname, '..', obrigatoria('UPLOAD_DIR', './uploads')),

  dbDriver: obrigatoria('DB_DRIVER', 'sqlite') as 'sqlite' | 'sqlsrv',
  sqlitePath: path.resolve(__dirname, '..', obrigatoria('SQLITE_PATH', '../db/database.sqlite')),
  sqlsrv: {
    host: obrigatoria('SQLSRV_HOST', 'localhost'),
    database: obrigatoria('SQLSRV_DATABASE', 'transporte'),
    user: obrigatoria('SQLSRV_USER', 'sa'),
    password: obrigatoria('SQLSRV_PASSWORD', ''),
  },

  kitbase: {
    host: obrigatoria('KITBASE_HOST', '10.1.1.2\\SQL2012'),
    database: obrigatoria('KITBASE_DATABASE', 'KITBASE'),
    user: obrigatoria('KITBASE_USER', 'sa'),
    password: obrigatoria('KITBASE_PASSWORD', 'P@ssw0rd'),
  },

  sapB1: {
    serviceLayerUrl: obrigatoria('SAP_B1_SERVICE_LAYER_URL', 'https://b1.ativy.com:50000/b1s/v1').replace(/\/$/, ''),
    companyDb: obrigatoria('SAP_B1_COMPANY_DB', 'SBO_3PKIT_PROD'),
    user: obrigatoria('SAP_B1_USER', 'manager'),
    password: obrigatoria('SAP_B1_PASSWORD', 'kit@1234'),
    verificarSsl: obrigatoria('SAP_B1_VERIFICAR_SSL', '1') !== '0',
    nfResource: obrigatoria('SAP_B1_NF_RESOURCE', 'Invoices'),
    nfQuery: obrigatoria(
      'SAP_B1_NF_QUERY',
      '?$select=DocEntry,DocNum,DocDate,CardName,Serial&$orderby=DocDate%20desc&$top=200',
    ).replace(/ /g, '%20'),
    campoNumeroNf: obrigatoria('SAP_B1_CAMPO_NUMERO_NF', 'Serial'),
    campoDataEmissao: obrigatoria('SAP_B1_CAMPO_DATA_EMISSAO', 'DocDate'),
    campoCliente: obrigatoria('SAP_B1_CAMPO_CLIENTE', 'CardName'),
  },
};
