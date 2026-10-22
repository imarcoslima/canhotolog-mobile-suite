import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useConexao, rotuloConexao } from '../contexts/ConnectionContext';
import { cores } from '../theme';

export function ConnectionBadge(): React.ReactElement {
  const estado = useConexao();
  const online = estado === 'online';

  return (
    <View style={[estilos.base, online ? estilos.online : estilos.offline]}>
      <View style={[estilos.ponto, { backgroundColor: online ? cores.sucesso : cores.alerta }]} />
      <Text style={[estilos.texto, { color: online ? cores.sucesso : cores.alerta }]}>
        {rotuloConexao(estado)}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 6,
  },
  online: { backgroundColor: cores.sucessoFundo },
  offline: { backgroundColor: cores.alertaFundo },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  texto: { fontSize: 12, fontWeight: '600' },
});
