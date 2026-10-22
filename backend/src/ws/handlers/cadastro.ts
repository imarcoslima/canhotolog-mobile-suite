/**
 * Novo Cadastro (carregamento) feito pelo app — grava na MESMA tabela
 * "transportes" do CanhotoLog web (o Painel, editar.php etc. enxergam esse
 * registro normalmente, como se tivesse sido feito por lá).
 *
 * Suposição assumida aqui (documentar/confirmar com a Adooren): o campo
 * "responsavel_carregamento" (obrigatório na tabela, não pedido explicitamente
 * pelo app) é preenchido com o nome do usuário logado que está cadastrando —
 * mesmo critério já usado em "responsavel_descarregamento" no Registrar
 * Entrega web (entrega.php): "o responsável é sempre quem está logado".
 */
import { getCanhotoDb } from '../../db/canhotolog';
import { Sessao } from '../session';
import { CadastroNewRequest, CadastroOk, CadastroErr } from '../protocol';

export async function tratarCadastroNew(
  payload: CadastroNewRequest,
  sessao: Sessao,
): Promise<{ tipo: 'cadastro_ok'; corpo: CadastroOk } | { tipo: 'cadastro_err'; corpo: CadastroErr }> {
  const erro = validar(payload);
  if (erro) {
    return { tipo: 'cadastro_err', corpo: { clientTempId: payload.clientTempId, msg: erro } };
  }

  const db = await getCanhotoDb();

  // Idempotência: se a confirmação de um envio anterior se perdeu (conexão
  // caiu bem na hora da resposta), o app reenvia o mesmo item da fila. Como
  // "numero_nf" é UNIQUE na tabela, um reenvio bateria nisso e pareceria um
  // erro de "NF duplicada" — em vez disso, tratamos como sucesso e devolvemos
  // o registro que já existe (é o retrato exato do que aconteceria se o INSERT
  // rodasse de novo com o mesmo número).
  const jaExiste = await db.get<{ id: number }>('SELECT id FROM transportes WHERE numero_nf = ?', [
    payload.numeroNf,
  ]);

  const dataCarregamento = payload.dataCarregamento.slice(0, 10); // guarda só a data (Y-m-d), como o resto do sistema

  if (jaExiste) {
    return {
      tipo: 'cadastro_ok',
      corpo: { clientTempId: payload.clientTempId, id: jaExiste.id },
    };
  }

  const resultado = await db.run(
    `INSERT INTO transportes (
       numero_nf, data_carregamento, responsavel_carregamento, placa_veiculo,
       nome_motorista, cpf_motorista, obra, uf, observacoes, status, criado_por, numero_serie
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?)`,
    [
      payload.numeroNf,
      dataCarregamento,
      sessao.nome,
      payload.placaVeiculo,
      payload.nomeMotorista,
      payload.cpfMotorista,
      payload.obra,
      payload.uf,
      payload.observacoes,
      sessao.usuarioId,
      payload.numeroSerie,
    ],
  );

  return {
    tipo: 'cadastro_ok',
    corpo: { clientTempId: payload.clientTempId, id: resultado.lastInsertRowid },
  };
}

function validar(payload: CadastroNewRequest): string | null {
  if (!payload.numeroNf?.trim()) return 'Informe o número da NF.';
  if (!payload.nomeMotorista?.trim()) return 'Informe o nome do motorista.';
  if (!/^\d{11}$/.test(payload.cpfMotorista ?? '')) return 'CPF do motorista inválido.';
  if (!payload.placaVeiculo?.trim()) return 'Informe a placa do veículo.';
  if (!payload.obra?.trim()) return 'Informe a obra.';
  if (!payload.uf?.trim()) return 'Informe a UF.';
  return null;
}
