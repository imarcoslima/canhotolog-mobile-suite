import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Botao } from '../components/Botao';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { cores } from '../theme';
import { DEFEITOS_KIT, CodigoDefeito, ConferenciaItem } from '../types/protocol';
import { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ConferenciaEtiquetas'>;

export function ConferenciaEtiquetasScreen({ navigation, route }: Props): React.ReactElement {
  const { numeroNf, obra, etiquetas } = route.params;
  const [indice, setIndice] = useState(0);
  const [itens, setItens] = useState<ConferenciaItem[]>([]);
  const [marcandoDefeito, setMarcandoDefeito] = useState(false);
  const [defeitosSelecionados, setDefeitosSelecionados] = useState<Set<CodigoDefeito>>(new Set());

  const kit = etiquetas[indice];
  const acabou = indice >= etiquetas.length;

  function alternarDefeito(codigo: CodigoDefeito) {
    setDefeitosSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(codigo)) {
        novo.delete(codigo);
      } else {
        novo.add(codigo);
      }
      return novo;
    });
  }

  function confirmarOk() {
    avancar({ etiqueta: kit.etiqueta, status: 'ok', defeitos: [] });
  }

  function confirmarDefeito() {
    if (defeitosSelecionados.size === 0) {
      return;
    }
    avancar({ etiqueta: kit.etiqueta, status: 'defeito', defeitos: Array.from(defeitosSelecionados) });
  }

  function avancar(item: ConferenciaItem) {
    const novosItens = [...itens, item];
    setMarcandoDefeito(false);
    setDefeitosSelecionados(new Set());

    if (indice + 1 >= etiquetas.length) {
      navigation.replace('FotosFinais', { numeroNf, obra, itens: novosItens });
    } else {
      setItens(novosItens);
      setIndice(indice + 1);
    }
  }

  if (acabou || !kit) {
    return (
      <View style={estilos.container}>
        <Text style={estilos.progresso}>Conferência concluída.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={estilos.container} contentContainerStyle={estilos.conteudo}>
      <ConnectionBadge />

      <Text style={estilos.progresso}>
        Kit {indice + 1} de {etiquetas.length} — {obra}
      </Text>

      <View style={estilos.card}>
        <Text style={estilos.etiquetaGrande}>Etiqueta {kit.etiqueta}</Text>

        <View style={estilos.grid}>
          <Detalhe rotulo="Kit" valor={kit.kit} />
          <Detalhe rotulo="Cor" valor={kit.cor} />
          <Detalhe rotulo="Dimensões" valor={`${kit.altura ?? '-'} x ${kit.largura ?? '-'}`} />
          <Detalhe rotulo="Cômodo" valor={kit.comodo} />
          <Detalhe rotulo="Abertura" valor={kit.abertura} />
          <Detalhe rotulo="Bloco/Andar/Apto" valor={`${kit.bloco ?? '-'} / ${kit.andar ?? '-'} / ${kit.aptos ?? '-'}`} />
        </View>
      </View>

      {!marcandoDefeito ? (
        <View style={estilos.acoesPrincipais}>
          <Botao titulo="✓ OK" onPress={confirmarOk} estilo={estilos.botaoOk} />
          <Botao
            titulo="Registrar Defeito"
            variante="secundario"
            onPress={() => setMarcandoDefeito(true)}
          />
        </View>
      ) : (
        <View style={estilos.card}>
          <Text style={estilos.checklistTitulo}>Selecione o(s) defeito(s):</Text>
          {DEFEITOS_KIT.map(defeito => {
            const marcado = defeitosSelecionados.has(defeito.codigo);
            return (
              <Pressable
                key={defeito.codigo}
                style={estilos.itemChecklist}
                onPress={() => alternarDefeito(defeito.codigo)}
              >
                <View style={[estilos.checkbox, marcado && estilos.checkboxMarcado]}>
                  {marcado && <Text style={estilos.checkboxTexto}>✓</Text>}
                </View>
                <Text style={estilos.itemChecklistTexto}>{defeito.label}</Text>
              </Pressable>
            );
          })}

          <View style={{ height: 8 }} />
          <Botao
            titulo="Confirmar Defeito(s)"
            variante="perigo"
            onPress={confirmarDefeito}
            desabilitado={defeitosSelecionados.size === 0}
          />
          <View style={{ height: 8 }} />
          <Botao titulo="Cancelar" variante="secundario" onPress={() => setMarcandoDefeito(false)} />
        </View>
      )}
    </ScrollView>
  );
}

function Detalhe({ rotulo, valor }: { rotulo: string; valor?: string | null }): React.ReactElement {
  return (
    <View style={estilos.detalheItem}>
      <Text style={estilos.detalheRotulo}>{rotulo}</Text>
      <Text style={estilos.detalheValor}>{valor || '-'}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: 20, gap: 12 },
  progresso: { fontSize: 14, fontWeight: '700', color: cores.textoSuave, marginTop: 8 },
  card: {
    backgroundColor: cores.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  etiquetaGrande: { fontSize: 22, fontWeight: '800', color: cores.primaria, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  detalheItem: { width: '46%' },
  detalheRotulo: { fontSize: 11, color: cores.textoFraco, fontWeight: '600' },
  detalheValor: { fontSize: 14, color: cores.texto, marginTop: 2 },
  acoesPrincipais: { gap: 10 },
  botaoOk: { backgroundColor: cores.sucesso },
  checklistTitulo: { fontWeight: '700', color: cores.texto, marginBottom: 10 },
  itemChecklist: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: cores.bordaForte,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMarcado: { backgroundColor: cores.erro, borderColor: cores.erro },
  checkboxTexto: { color: '#fff', fontWeight: '800', fontSize: 14 },
  itemChecklistTexto: { fontSize: 15, color: cores.texto },
});
