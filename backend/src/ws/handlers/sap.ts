import { sapB1Sincronizar, buscarNotasPendentes } from '../../sapb1';
import { SapSyncNotasOk, SapSyncNotasErr } from '../protocol';

export async function tratarSapSyncNotas(): Promise<
  { tipo: 'sap_sync_notas_ok'; corpo: SapSyncNotasOk } | { tipo: 'sap_sync_notas_err'; corpo: SapSyncNotasErr }
> {
  try {
    await sapB1Sincronizar();
    const pendentes = await buscarNotasPendentes();
    return {
      tipo: 'sap_sync_notas_ok',
      corpo: {
        notas: pendentes.map(n => ({
          numeroNf: n.numero_nf,
          dataEmissao: n.data_emissao,
          cliente: n.cliente_obra,
        })),
        sincronizadoEm: new Date().toISOString(),
      },
    };
  } catch (e) {
    return { tipo: 'sap_sync_notas_err', corpo: { msg: (e as Error).message } };
  }
}
