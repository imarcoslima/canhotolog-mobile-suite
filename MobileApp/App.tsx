/**
 * CanhotoLog Mobile — ponto de entrada do app.
 * Inicia a conexão com o servidor (syncManager) uma única vez e monta os
 * contexts (autenticação, estado da conexão) por cima da navegação.
 */
import React, { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { ConnectionProvider } from './src/contexts/ConnectionContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { syncManager } from './src/sync/syncManager';
import { WS_URL } from './src/config';

export default function App(): React.ReactElement {
  const isDarkMode = useColorScheme() === 'dark';

  useEffect(() => {
    syncManager.iniciar(WS_URL);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ConnectionProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ConnectionProvider>
    </SafeAreaProvider>
  );
}
