import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Pressable, Alert } from 'react-native';
import RNFS from 'react-native-fs';
import { v4 as uuid } from 'uuid';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Campo } from '../components/Campo';
import { Botao } from '../components/Botao';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { cores } from '../theme';
import { tirarFoto, escolherFotoDaGaleria, fotoDentroDoLimite, FotoSelecionada } from '../sync/fotoUtils';
import { enfileirar, salvarFotoPendente } from '../db/localDb';
import { syncManager } from '../sync/syncManager';
import { ConferenciaSubmitRequest, LIMITE_FOTOS_POR_CONFERENCIA } from '../types/protocol';
import { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'FotosFinais'>;

interface FotoAnexada extends FotoSelecionada {
  tempId: string;
}

export function FotosFinaisScreen({ navigation, route }: Props): React.ReactElement {
  const { numeroNf, obra, itens } = route.params;
  const [fotos, setFotos] = useState<FotoAnexada[]>([]);
  const [observacaoGeral, setObservacaoGeral] = useState('');
  const [enviando, setEnviando] = useState(false);

  const okCount = itens.filter(i => i.status === 'ok').length;
  const defeitoCount = itens.length - okCount;

  async function adicionarFoto(origem: 'camera' | 'galeria') {
    if (fotos.length >= LIMITE_FOTOS_POR_CONFERENCIA) {
      Alert.alert('Limite atingido', `No máximo ${LIMITE_FOTOS_POR_CONFERENCIA} fotos por entrega.`);
      return;
    }
    const foto = origem === 'camera' ? await tirarFoto() : await escolherFotoDaGaleria();
    if (!foto) {
      return;
    }
    if (!fotoDentroDoLimite(foto.tamanho)) {
      Alert.alert('Arquivo muito grande', 'Cada foto deve ter até 8 MB.');
      return;
    }
    setFotos(prev => [...prev, { ...foto, tempId: uuid() }]);
  }

  function removerFoto(tempId: string) {
    setFotos(prev => prev.filter(f => f.tempId !== tempId));
  }

  async function enviar() {
    setEnviando(true);
    try {
      const clientTempId = uuid();

      // Copia cada foto para a pasta própria do app (a galeria/câmera pode
      // limpar o cache dela a qualquer momento) antes de enfileirar.
      const fotosMetadados: ConferenciaSubmitRequest['fotos'] = [];
      for (const foto of fotos) {
        const nomeArquivo = foto.nomeArquivo || `foto_${foto.tempId}.jpg`;
        const destino = `${RNFS.DocumentDirectoryPath}/conferencias/${clientTempId}/${nomeArquivo}`;
        await RNFS.mkdir(`${RNFS.DocumentDirectoryPath}/conferencias/${clientTempId}`);
        await RNFS.copyFile(foto.uri, destino);
        salvarFotoPendente(foto.tempId, clientTempId, destino, foto.mime, foto.tamanho);
        fotosMetadados.push({
          tempId: foto.tempId,
          nomeArquivo,
          mime: foto.mime,
          tamanho: foto.tamanho,
        });
      }

      const payload: ConferenciaSubmitRequest = {
        clientTempId,
        numeroNf,
        obra,
        itens,
        observacaoGeral: observacaoGeral.trim() || null,
        fotos: fotosMetadados,
        criadoEmCliente: new Date().toISOString(),
      };

      enfileirar(clientTempId, 'conferencia_submit', payload);
      syncManager.notificarNovoItem();

      Alert.alert(
        'Entrega registrada',
        syncManager.getEstado() === 'online'
          ? 'Conferência salva — enviando ao servidor.'
          : 'Sem conexão agora — a conferência foi salva neste aparelho e será enviada assim que a internet voltar.',
        [{ text: 'OK', onPress: () => navigation.popToTop() }],
      );
    } catch (e) {
      Alert.alert('Erro', e instanceof Error ? e.message : 'Falha ao salvar a conferência.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ScrollView style={estilos.container} contentContainerStyle={estilos.conteudo}>
      <ConnectionBadge />

      <View style={estilos.resumoCard}>
        <Text style={estilos.resumoTitulo}>Resumo da conferência — {obra}</Text>
        <Text style={estilos.resumoTexto}>
          {itens.length} kit(s) conferido(s) · {okCount} OK · {defeitoCount} com defeito
        </Text>
      </View>

      <Text style={estilos.rotuloSecao}>
        Fotos ({fotos.length}/{LIMITE_FOTOS_POR_CONFERENCIA})
      </Text>

      <View style={estilos.fotosGrid}>
        {fotos.map(foto => (
          <View key={foto.tempId} style={estilos.fotoWrap}>
            <Image source={{ uri: foto.uri }} style={estilos.fotoThumb} />
            <Pressable style={estilos.removerBotao} onPress={() => removerFoto(foto.tempId)}>
              <Text style={estilos.removerTexto}>✕</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={estilos.botoesFoto}>
        <Botao titulo="📷 Tirar Foto" variante="secundario" onPress={() => adicionarFoto('camera')} />
        <Botao titulo="🖼️ Galeria" variante="secundario" onPress={() => adicionarFoto('galeria')} />
      </View>

      <Campo
        rotulo="Observação (opcional)"
        value={observacaoGeral}
        onChangeText={setObservacaoGeral}
        multiline
        numberOfLines={4}
        style={{ minHeight: 100, textAlignVertical: 'top' }}
      />

      <Botao titulo="Concluir Registro de Entrega" onPress={enviar} carregando={enviando} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: 20, gap: 4 },
  resumoCard: {
    backgroundColor: cores.primariaClara,
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
  },
  resumoTitulo: { fontWeight: '700', color: cores.texto },
  resumoTexto: { color: cores.textoSuave, marginTop: 4 },
  rotuloSecao: { fontSize: 14, fontWeight: '600', color: cores.texto, marginBottom: 8 },
  fotosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  fotoWrap: { width: 80, height: 80 },
  fotoThumb: { width: 80, height: 80, borderRadius: 8, backgroundColor: cores.borda },
  removerBotao: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: cores.erro,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removerTexto: { color: '#fff', fontWeight: '800', fontSize: 12 },
  botoesFoto: { flexDirection: 'row', gap: 10, marginBottom: 16 },
});
