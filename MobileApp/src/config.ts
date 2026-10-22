/**
 * Configuração do app. Ajuste WS_URL para o endereço real do backend antes
 * de gerar o build de produção (ver backend/README.md) — troque também o
 * esquema para "wss://" (WebSocket seguro/TLS) em produção; "ws://" simples
 * só serve para testar em rede local durante o desenvolvimento.
 */
export const WS_URL = __DEV__
  ? 'ws://10.0.2.2:8787/ws' // 10.0.2.2 = localhost da máquina host, visto de dentro do emulador Android
  : 'wss://10.1.1.10/ws';
