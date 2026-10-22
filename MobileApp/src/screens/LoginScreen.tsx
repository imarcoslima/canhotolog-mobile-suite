import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { Campo } from '../components/Campo';
import { Botao } from '../components/Botao';
import { ConnectionBadge } from '../components/ConnectionBadge';
import { cores } from '../theme';

export function LoginScreen(): React.ReactElement {
  const { login } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function handleLogin() {
    setErro('');
    if (!usuario.trim() || !senha) {
      setErro('Informe usuário e senha.');
      return;
    }
    setEnviando(true);
    const resultado = await login(usuario.trim(), senha);
    setEnviando(false);
    if (!resultado.ok) {
      setErro(resultado.msg ?? 'Não foi possível entrar.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={estilos.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled">
        <View style={estilos.badgeWrap}>
          <ConnectionBadge />
        </View>
        <View style={estilos.logoWrap}>
          <Text style={estilos.titulo}>CanhotoLog</Text>
          <Text style={estilos.subtitulo}>Entre com sua conta do sistema</Text>
        </View>

        <Campo
          rotulo="Usuário"
          value={usuario}
          onChangeText={setUsuario}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Campo
          rotulo="Senha"
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
          autoCapitalize="none"
        />

        {erro ? <Text style={estilos.erro}>{erro}</Text> : null}

        <Botao titulo="Entrar" onPress={handleLogin} carregando={enviando} />

        <Text style={estilos.rodape}>
          O primeiro acesso neste aparelho precisa de internet. Depois disso, o app continua
          funcionando normalmente sem conexão.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  badgeWrap: { position: 'absolute', top: 24, left: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  titulo: { fontSize: 28, fontWeight: '800', color: cores.primaria },
  subtitulo: { fontSize: 14, color: cores.textoSuave, marginTop: 4 },
  erro: { color: cores.erro, marginBottom: 12, fontWeight: '600', textAlign: 'center' },
  rodape: { color: cores.textoFraco, fontSize: 12, textAlign: 'center', marginTop: 20 },
});
