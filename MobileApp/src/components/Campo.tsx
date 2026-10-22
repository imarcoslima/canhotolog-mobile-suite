import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { cores } from '../theme';

interface Props extends TextInputProps {
  rotulo: string;
  obrigatorio?: boolean;
  erro?: string;
}

export function Campo({ rotulo, obrigatorio, erro, style, ...resto }: Props): React.ReactElement {
  return (
    <View style={estilos.grupo}>
      <Text style={estilos.rotulo}>
        {rotulo} {obrigatorio && <Text style={{ color: cores.erro }}>*</Text>}
      </Text>
      <TextInput
        style={[estilos.input, erro && estilos.inputComErro, style]}
        placeholderTextColor={cores.textoFraco}
        {...resto}
      />
      {erro ? <Text style={estilos.textoErro}>{erro}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  grupo: { marginBottom: 16 },
  rotulo: { fontSize: 14, fontWeight: '600', color: cores.texto, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: cores.bordaForte,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: cores.texto,
    backgroundColor: cores.card,
  },
  inputComErro: { borderColor: cores.erro },
  textoErro: { color: cores.erro, fontSize: 12, marginTop: 4, fontWeight: '600' },
});
