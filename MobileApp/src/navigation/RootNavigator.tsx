import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { NovoCadastroScreen } from '../screens/NovoCadastroScreen';
import { RegistrarEntregaBuscaScreen } from '../screens/RegistrarEntregaBuscaScreen';
import { ConferenciaEtiquetasScreen } from '../screens/ConferenciaEtiquetasScreen';
import { FotosFinaisScreen } from '../screens/FotosFinaisScreen';
import { KitResumo, ConferenciaItem } from '../types/protocol';
import { cores } from '../theme';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  NovoCadastro: undefined;
  RegistrarEntregaBusca: undefined;
  ConferenciaEtiquetas: { numeroNf: string; obra: string; etiquetas: KitResumo[] };
  FotosFinais: { numeroNf: string; obra: string; itens: ConferenciaItem[] };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.ReactElement {
  const { usuario, carregando } = useAuth();

  if (carregando) {
    return <></>;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: cores.primaria },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        {!usuario ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'CanhotoLog' }} />
            <Stack.Screen
              name="NovoCadastro"
              component={NovoCadastroScreen}
              options={{ title: 'Novo Cadastro' }}
            />
            <Stack.Screen
              name="RegistrarEntregaBusca"
              component={RegistrarEntregaBuscaScreen}
              options={{ title: 'Registrar Entrega' }}
            />
            <Stack.Screen
              name="ConferenciaEtiquetas"
              component={ConferenciaEtiquetasScreen}
              options={{ title: 'Conferência de Kits' }}
            />
            <Stack.Screen
              name="FotosFinais"
              component={FotosFinaisScreen}
              options={{ title: 'Fotos e Observação' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
