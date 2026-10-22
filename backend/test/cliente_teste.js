/**
 * Cliente de teste manual (não faz parte do app nem do backend em produção)
 * — simula o protocolo do app para validar o servidor de ponta a ponta
 * neste sandbox, incluindo o envio binário de uma foto.
 */
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8788/ws');
let idc = 0;
const pendentes = new Map();

function enviar(t, p) {
  return new Promise(resolve => {
    const id = 'test-' + (idc++);
    pendentes.set(id, resolve);
    ws.send(JSON.stringify({ v: 1, id, t, p }));
  });
}

function enviarBinario(buffer) {
  ws.send(buffer);
}

ws.on('message', dado => {
  let env;
  try {
    env = JSON.parse(dado.toString('utf8'));
  } catch {
    console.log('[recebido não-JSON, tamanho]', dado.length);
    return;
  }
  console.log('<-', JSON.stringify(env));
  if (env.re && pendentes.has(env.re)) {
    pendentes.get(env.re)(env);
    pendentes.delete(env.re);
  } else if (!env.re && (env.t === 'photo_ack' || env.t === 'photo_err')) {
    if (global.onPhotoAck) global.onPhotoAck(env);
  }
});

ws.on('open', async () => {
  console.log('=== 1) login errado ===');
  console.log(await enviar('auth', { usuario: 'admin', senha: 'senhaErrada' }));

  console.log('=== 2) login certo ===');
  const auth = await enviar('auth', { usuario: 'admin', senha: 'Senha123!' });
  console.log(auth);

  console.log('=== 3) cadastro_new ===');
  const cadastro = await enviar('cadastro_new', {
    clientTempId: 'ct-1',
    numeroNf: 'NF-TESTE-001',
    numeroSerie: 'SER-001',
    dataCarregamento: new Date().toISOString(),
    nomeMotorista: 'João da Silva',
    cpfMotorista: '11122233344',
    placaVeiculo: 'ABC1234',
    obra: 'Obra Teste WS',
    uf: 'CE',
    observacoes: 'Teste automatizado',
  });
  console.log(cadastro);

  console.log('=== 3b) reenvio do mesmo cadastro (idempotência) ===');
  console.log(await enviar('cadastro_new', {
    clientTempId: 'ct-1',
    numeroNf: 'NF-TESTE-001',
    numeroSerie: 'SER-001',
    dataCarregamento: new Date().toISOString(),
    nomeMotorista: 'João da Silva',
    cpfMotorista: '11122233344',
    placaVeiculo: 'ABC1234',
    obra: 'Obra Teste WS',
    uf: 'CE',
    observacoes: 'Teste automatizado',
  }));

  console.log('=== 4) kit_buscar_por_nf (kitbase indisponível neste sandbox — espera erro amigável) ===');
  console.log(await enviar('kit_buscar_por_nf', { numeroNf: 'NF-TESTE-001' }));

  console.log('=== 5) conferencia_submit (direto, sem depender do kitbase) ===');
  const conferencia = await enviar('conferencia_submit', {
    clientTempId: 'conf-1',
    numeroNf: 'NF-TESTE-001',
    obra: 'Obra Teste WS',
    itens: [
      { etiqueta: 101, status: 'ok', defeitos: [] },
      { etiqueta: 102, status: 'defeito', defeitos: ['pintura_arranhada', 'dobradica_defeito'] },
    ],
    observacaoGeral: 'Tudo certo, exceto etiqueta 102.',
    fotos: [{ tempId: 'foto-1', nomeArquivo: 'foto1.jpg', mime: 'image/jpeg', tamanho: 9 }],
    criadoEmCliente: new Date().toISOString(),
  });
  console.log(conferencia);

  console.log('=== 6) photo_begin + frame binário ===');
  const beginResp = await enviar('photo_begin', {
    conferenciaClientTempId: 'conf-1',
    tempId: 'foto-1',
    mime: 'image/jpeg',
    tamanho: 9,
  });
  console.log(beginResp);

  const ackPromise = new Promise(resolve => { global.onPhotoAck = resolve; });
  enviarBinario(Buffer.from('fakejpeg'));
  console.log('ack binario:', await ackPromise);

  console.log('=== 7) reenvio do mesmo conferencia_submit (idempotência) ===');
  console.log(await enviar('conferencia_submit', {
    clientTempId: 'conf-1',
    numeroNf: 'NF-TESTE-001',
    obra: 'Obra Teste WS',
    itens: [{ etiqueta: 101, status: 'ok', defeitos: [] }],
    observacaoGeral: 'x',
    fotos: [{ tempId: 'foto-1', nomeArquivo: 'foto1.jpg', mime: 'image/jpeg', tamanho: 9 }],
    criadoEmCliente: new Date().toISOString(),
  }));

  console.log('=== 8) ping/pong ===');
  console.log(await enviar('ping', {}));

  console.log('OK - todos os testes rodaram sem travar.');
  ws.close();
  process.exit(0);
});

ws.on('error', e => {
  console.error('erro de conexão:', e.message);
  process.exit(1);
});
