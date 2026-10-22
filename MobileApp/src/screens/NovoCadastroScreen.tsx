import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  FlatList,
  Pressable,
  Alert,
} from 'react-native';
import { v4 as uuid } from 'uuid';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Campo } from '../components/Campo';
import { Botao } from '../components/Botao';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { cores } from '../theme';
import { LISTA_UF, validarCPF, formatarCPF, validarPlaca, apenasDigitos } from '../utils/validacao';
import { enfileirar } from '../db/localDb';
import { syncManager } from '../sync/syncManager';
import { CadastroNewRequest, SapSyncNotasOk } from '../types/protocol';
import { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'NovoCadastro'>;

export function NovoCadastroScreen({ navigation }: Props): React.ReactElement {
  const [numeroNf, setNumeroNf] = useState('');
  const [numeroSerie, setNumeroSerie] = useState('');
  const [nomeMotorista, setNomeMotorista] = useState('');
  const [cpfMotorista, setCpfMotorista] = useState('');
  const [placaVeiculo, setPlacaVeiculo] = useState('');
  const [obra, setObra] = useState('');
  const [uf, setUf] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const [modalNotasAberto, setModalNotasAberto] = useState(false);
  const [carregandoNotas, setCarregandoNotas] = useState(false);
  const [notasSap, setNotasSap] = useState<SapSyncNotasOk['notas']>([]);

  async function abrirNotasSap() {
    if (syncManager.getEstado() !== 'online') {
      Alert.alert(
        'Sem conexão',
        'É preciso estar online para buscar as notas fiscais do SAP B1. Você pode digitar o número manualmente.',
      );
      return;
    }
    setModalNotasAberto(true);
    setCarregandoNotas(true);
    try {
      const resp = await syncManager.getWs().enviar<{}, SapSyncNotasOk>('sap_sync_notas', {});
      if (resp.t === 'sap_sync_notas_ok') {
        setNotasSap((resp.p as SapSyncNotasOk).notas);
      } else {
        Alert.alert('Erro', (resp.p as { msg?: string })?.msg ?? 'Falha ao buscar notas do SAP.');
        setModalNotasAberto(false);
      }
    } catch (e) {
      Alert.alert('Erro', e instanceof Error ? e.message : 'Falha ao buscar notas do SAP.');
      setModalNotasAberto(false);
    } finally {
      setCarregandoNotas(false);
    }
  }

  function validar(): boolean {
    const novosErros: Record<string, string> = {};
    if (!numeroNf.trim()) novosErros.numeroNf = 'Informe o número da NF.';
    if (!nomeMotorista.trim()) novosErros.nomeMotorista = 'Informe o nome do motorista.';
    if (!validarCPF(cpfMotorista)) novosErros.cpfMotorista = 'CPF inválido.';
    if (!validarPlaca(placaVeiculo)) novosErros.placaVeiculo = 'Placa inválida.';
    if (!obra.trim()) novosErros.obra = 'Informe a obra.';
    if (!uf) novosErros.uf = 'Selecione a UF.';
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  function salvar() {
    if (!validar()) {
      return;
    }
    setEnviando(true);

    const payload: CadastroNewRequest = {
      clientTempId: uuid(),
      numeroNf: numeroNf.trim(),
      numeroSerie: numeroSerie.trim() || null,
      dataCarregamento: new Date().toISOString(),
      nomeMotorista: nomeMotorista.trim(),
      cpfMotorista: apenasDigitos(cpfMotorista),
      placaVeiculo: placaVeiculo.trim().toUpperCase(),
      obra: obra.trim(),
      uf,
      observacoes: observacoes.trim() || null,
    };

    enfileirar(payload.clientTempId, 'cadastro_new', payload);
    syncManager.notificarNovoItem();
    setEnviando(false);

    Alert.alert(
      'Cadastro salvo',
      syncManager.getEstado() === 'online'
        ? 'Carregamento cadastrado — enviando ao servidor.'
        : 'Sem conexão agora — o cadastro foi salvo neste aparelho e será enviado assim que a internet voltar.',
      [{ text: 'OK', onPress: () => navigation.goBack() }],
    );
  }

  return (
    <ScrollView style={estilos.container} contentContainerStyle={estilos.conteudo}>
      <ConnectionBadge />

      <Campo
        rotulo="Nº da Nota Fiscal"
        obrigatorio
        value={numeroNf}
        onChangeText={setNumeroNf}
        keyboardType="numeric"
        erro={erros.numeroNf}
      />

      <Botao titulo="Buscar notas pendentes no SAP B1" variante="secundario" onPress={abrirNotasSap} />

      <View style={{ height: 8 }} />

      <Campo
        rotulo="Número de Série (SAP B1, se souber)"
        value={numeroSerie}
        onChangeText={setNumeroSerie}
      />

      <Campo
        rotulo="Nome do Motorista"
        obrigatorio
        value={nomeMotorista}
        onChangeText={setNomeMotorista}
        erro={erros.nomeMotorista}
      />

      <Campo
        rotulo="CPF do Motorista"
        obrigatorio
        value={cpfMotorista}
        onChangeText={setCpfMotorista}
        onBlur={() => setCpfMotorista(v => (validarCPF(v) ? formatarCPF(v) : v))}
        keyboardType="numeric"
        erro={erros.cpfMotorista}
      />

      <Campo
        rotulo="Placa do Veículo"
        obrigatorio
        value={placaVeiculo}
        onChangeText={t => setPlacaVeiculo(t.toUpperCase())}
        autoCapitalize="characters"
        erro={erros.placaVeiculo}
      />

      <Campo rotulo="Obra" obrigatorio value={obra} onChangeText={setObra} erro={erros.obra} />

      <Text style={estilos.rotuloUf}>
        UF <Text style={{ color: cores.erro }}>*</Text>
      </Text>
      <View style={estilos.ufGrid}>
        {LISTA_UF.map(sigla => (
          <Pressable
            key={sigla}
            onPress={() => setUf(sigla)}
            style={[estilos.ufChip, uf === sigla && estilos.ufChipSelecionado]}
          >
            <Text style={[estilos.ufTexto, uf === sigla && estilos.ufTextoSelecionado]}>{sigla}</Text>
          </Pressable>
        ))}
      </View>
      {erros.uf ? <Text style={estilos.erroUf}>{erros.uf}</Text> : null}

      <Campo
        rotulo="Anotação (opcional)"
        value={observacoes}
        onChangeText={setObservacoes}
        multiline
        numberOfLines={3}
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />

      <Botao titulo="Salvar Cadastro" onPress={salvar} carregando={enviando} />

      <Modal visible={modalNotasAberto} animationType="slide" onRequestClose={() => setModalNotasAberto(false)}>
        <View style={estilos.modalContainer}>
          <Text style={estilos.modalTitulo}>Notas pendentes (SAP B1)</Text>
          {carregandoNotas ? (
            <Text style={estilos.modalTextoAjuda}>Buscando…</Text>
          ) : (
            <FlatList
              data={notasSap}
              keyExtractor={item => item.numeroNf}
              ListEmptyComponent={<Text style={estilos.modalTextoAjuda}>Nenhuma nota pendente encontrada.</Text>}
              renderItem={({ item }) => (
                <Pressable
                  style={estilos.notaItem}
                  onPress={() => {
                    setNumeroNf(item.numeroNf);
                    if (item.cliente) setObra(item.cliente);
                    setModalNotasAberto(false);
                  }}
                >
                  <Text style={estilos.notaNumero}>NF {item.numeroNf}</Text>
                  <Text style={estilos.notaDetalhe}>{item.cliente ?? '-'}</Text>
                </Pressable>
              )}
            />
          )}
          <Botao titulo="Fechar" variante="secundario" onPress={() => setModalNotasAberto(false)} />
        </View>
      </Modal>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: 20, gap: 4 },
  rotuloUf: { fontSize: 14, fontWeight: '600', color: cores.texto, marginBottom: 8 },
  ufGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  ufChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: cores.bordaForte,
    backgroundColor: cores.card,
  },
  ufChipSelecionado: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  ufTexto: { color: cores.texto, fontWeight: '600' },
  ufTextoSelecionado: { color: '#fff' },
  erroUf: { color: cores.erro, fontSize: 12, marginBottom: 12, fontWeight: '600' },
  modalContainer: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: cores.fundo, gap: 16 },
  modalTitulo: { fontSize: 20, fontWeight: '700', color: cores.texto },
  modalTextoAjuda: { color: cores.textoSuave, textAlign: 'center', marginTop: 20 },
  notaItem: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: cores.card,
    borderWidth: 1,
    borderColor: cores.borda,
    marginBottom: 8,
  },
  notaNumero: { fontWeight: '700', color: cores.texto },
  notaDetalhe: { color: cores.textoSuave, marginTop: 2 },
});
