import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { Botao } from '../components/Botao';
import { cores } from '../theme';
import { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props): React.ReactElement {
  const { usuario, logout } = useAuth();

  return (
    <View style={estilos.container}>
      <View style={estilos.topo}>
        <ConnectionBadge />
        <Text style={estilos.saudacao}>Olá, {usuario?.nome}</Text>
        <Text style={estilos.perfil}>
          {usuario?.perfil === 'transporte' ? 'Controle de Transporte' : 'Registro de Entrega'}
        </Text>
      </View>

      <View style={estilos.menu}>
        {usuario?.perfil === 'transporte' && (
          <Botao titulo="Novo Cadastro" onPress={() => navigation.navigate('NovoCadastro')} />
        )}
        <Botao
          titulo="Registrar Entrega"
          variante="secundario"
          onPress={() => navigation.navigate('RegistrarEntregaBusca')}
          estilo={estilos.espacamento}
        />
      </View>

      <Botao titulo="Sair" variante="perigo" onPress={logout} estilo={estilos.sair} />
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo, padding: 24 },
  topo: { marginTop: 24, marginBottom: 40 },
  saudacao: { fontSize: 22, fontWeight: '700', color: cores.texto, marginTop: 16 },
  perfil: { fontSize: 14, color: cores.textoSuave, marginTop: 2 },
  menu: { gap: 12 },
  espacamento: { marginTop: 4 },
  sair: { marginTop: 'auto' },
});
