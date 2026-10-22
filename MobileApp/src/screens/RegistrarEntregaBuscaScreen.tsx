import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Campo } from '../components/Campo';
import { Botao } from '../components/Botao';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { cores } from '../theme';
import { syncManager } from '../sync/syncManager';
import { salvarCacheKits, lerCacheKits } from '../db/localDb';
import { KitBuscarPorNfOk, KitBuscarPorNfRequest, KitResumo } from '../types/protocol';
import { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'RegistrarEntregaBusca'>;

export function RegistrarEntregaBuscaScreen({ navigation }: Props): React.ReactElement {
  const [numeroNf, setNumeroNf] = useState('');
  const [erro, setErro] = useState('');
  const [buscando, setBuscando] = useState(false);

  async function buscar() {
    setErro('');
    const nf = numeroNf.trim();
    if (!nf) {
      setErro('Informe o número da NF.');
      return;
    }
    setBuscando(true);

    if (syncManager.getEstado() === 'online') {
      try {
        const resp = await syncManager
          .getWs()
          .enviar<KitBuscarPorNfRequest, KitBuscarPorNfOk>('kit_buscar_por_nf', { numeroNf: nf });

        if (resp.t === 'kit_buscar_por_nf_ok') {
          const p = resp.p as KitBuscarPorNfOk;
          salvarCacheKits(p.numeroNf, p.obra, p.etiquetas);
          irParaConferencia(p.obra, p.etiquetas, nf);
        } else {
          setErro((resp.p as { msg?: string })?.msg ?? 'NF não encontrada.');
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Falha ao buscar a NF.');
      } finally {
        setBuscando(false);
      }
      return;
    }

    // Offline: só funciona se essa NF/obra já tiver sido consultada antes
    // com internet (o app guarda a última lista de etiquetas vista).
    const cache = lerCacheKits(nf);
    setBuscando(false);
    if (cache) {
      irParaConferencia(cache.obra, cache.etiquetas as KitResumo[], nf);
    } else {
      setErro(
        'Sem conexão e sem dados salvos localmente para essa NF. Conecte-se à internet ao menos uma vez para carregar as etiquetas desta obra.',
      );
    }
  }

  function irParaConferencia(obra: string, etiquetas: KitResumo[], numeroNfBuscada: string) {
    navigation.navigate('ConferenciaEtiquetas', { numeroNf: numeroNfBuscada, obra, etiquetas });
  }

  return (
    <ScrollView style={estilos.container} contentContainerStyle={estilos.conteudo}>
      <ConnectionBadge />

      <View style={estilos.introCard}>
        <Text style={estilos.icone}>📦</Text>
        <Text style={estilos.introTitulo}>Localizar Obra</Text>
        <Text style={estilos.introTexto}>
          Informe o número da NF para carregar as etiquetas dos kits da obra relacionada.
        </Text>
      </View>

      <Campo
        rotulo="Nº da Nota Fiscal"
        obrigatorio
        value={numeroNf}
        onChangeText={setNumeroNf}
        keyboardType="numeric"
        erro={erro}
      />

      <Botao titulo="Continuar" onPress={buscar} carregando={buscando} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: 20, gap: 4 },
  introCard: {
    backgroundColor: cores.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginVertical: 20,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  icone: { fontSize: 32, marginBottom: 8 },
  introTitulo: { fontSize: 18, fontWeight: '700', color: cores.texto },
  introTexto: { fontSize: 13, color: cores.textoSuave, textAlign: 'center', marginTop: 6 },
});
