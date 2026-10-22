import { iniciarServidor } from './ws/server';

iniciarServidor().catch(erro => {
  console.error('Falha ao iniciar o backend do CanhotoLog Mobile:', erro);
  process.exit(1);
});
