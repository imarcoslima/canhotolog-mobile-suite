import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { cores } from '../theme';

interface Props {
  titulo: string;
  onPress: () => void;
  variante?: 'primario' | 'secundario' | 'perigo';
  carregando?: boolean;
  desabilitado?: boolean;
  estilo?: ViewStyle;
}

export function Botao({
  titulo,
  onPress,
  variante = 'primario',
  carregando = false,
  desabilitado = false,
  estilo,
}: Props): React.ReactElement {
  const inativo = desabilitado || carregando;

  return (
    <Pressable
      onPress={inativo ? undefined : onPress}
      style={[
        estilos.base,
        variante === 'primario' && estilos.primario,
        variante === 'secundario' && estilos.secundario,
        variante === 'perigo' && estilos.perigo,
        inativo && estilos.inativo,
        estilo,
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={variante === 'secundario' ? cores.texto : '#fff'} />
      ) : (
        <Text
          style={[
            estilos.texto,
            variante === 'secundario' && { color: cores.texto },
          ]}
        >
          {titulo}
        </Text>
      )}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primario: { backgroundColor: cores.primaria },
  secundario: { backgroundColor: cores.card, borderWidth: 1, borderColor: cores.bordaForte },
  perigo: { backgroundColor: cores.erro },
  inativo: { opacity: 0.5 },
  texto: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
