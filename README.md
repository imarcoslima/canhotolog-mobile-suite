# CanhotoLog Mobile

App para Android e iOS (React Native/TypeScript) + backend WebSocket (Node/TypeScript) que estende o CanhotoLog para o celular: cadastro de carregamento ("Novo Cadastro") e conferência de kits na entrega ("Registrar Entrega"), funcionando offline e sincronizando depois, integrado ao mesmo banco do CanhotoLog web, ao kitbase (SQL Server) e à Service Layer do SAP B1.

Este é um projeto grande, então antes de tudo: **o que está pronto, o que falta, e como ler este documento.**

## O que foi entregue

- `backend/` — servidor WebSocket em Node/TypeScript. **Testado de ponta a ponta neste ambiente**: login, cadastro de carregamento, conferência de entrega (itens + foto binária), idempotência de reenvio, tudo gravando de verdade no mesmo banco SQLite que o CanhotoLog web usa (confirmado lendo o banco depois pelo próprio PHP). O único pedaço que não pôde ser testado de verdade aqui foi a conexão com o kitbase e com o SAP B1 — mesma limitação de rede já enfrentada antes com a integração SAP B1 do sistema web (este sandbox não alcança `10.1.1.2` nem `b1.ativy.com`). O código trata a falha de conexão de forma amigável (confirmado no teste: retorna erro claro em vez de travar).
- `MobileApp/` — app React Native (TypeScript), com projetos **nativos reais** de Android e iOS gerados pelo `@react-native-community/cli` (não são pastas fictícias/aproximadas — é o esqueleto de verdade que o `react-native init` cria). Todo o código TypeScript passa em `tsc --noEmit` e `eslint` sem erros.
- Este README, com as decisões de arquitetura, as suposições assumidas que precisam ser confirmadas com o time da Adooren, e o passo a passo de build/publicação.

## O que NÃO foi feito aqui (e por quê)

Este ambiente é um sandbox em nuvem sem Xcode, sem Android Studio, sem emulador/simulador e sem conta de desenvolvedor Apple/Google — ou seja, **não é possível gerar o `.apk`/`.aab` ou o `.ipa` finais, nem publicar nas lojas, a partir daqui.** Isso foi combinado antes de começar: a entrega é o código-fonte completo, pronto para o time da Adooren compilar, assinar e publicar com as próprias contas. A seção "Build e publicação" abaixo tem o passo a passo disso.

Pelo mesmo motivo, o app nunca rodou de verdade num emulador/dispositivo — o que foi validado foi a **lógica** (tipos batendo entre app e servidor, compilação limpa, todas as telas escritas e navegação ligada) e o **backend rodando de verdade**. A recomendação forte é: assim que o time conseguir rodar o app num emulador Android (é o mais rápido de configurar), testar o fluxo de Login → Novo Cadastro → Registrar Entrega → foto, e me procurar de volta com qualquer erro — é bem provável que apareça algum ajuste fino de UI/comportamento numa primeira rodada real, o que é normal em qualquer app novo.

## Arquitetura, em uma imagem

```
┌────────────────────┐        WebSocket (wss://)        ┌────────────────────────┐
│  App Android/iOS   │ ───────────────────────────────► │  backend/ (Node)       │
│  (React Native)    │ ◄─────────────────────────────── │  ws://.../ws           │
│                    │                                  │                        │
│  SQLite local      │                                  │  ├─ banco CanhotoLog   │◄──► CanhotoLog web (PHP)
│  (fila offline +   │                                  │  │  (mesmo arquivo/    │     lê e grava os MESMOS dados
│   cache de kits)   │                                  │  │   SQL Server)       │
└────────────────────┘                                  │  ├─ kitbase (SQL Server)│◄──► kitbase (etiquetas)
                                                        │  └─ SAP B1 Service     │◄──► SAP B1 (notas fiscais)
                                                        │     Layer (HTTP)       │
                                                        └────────────────────────┘
```

O app **nunca** fala direto com o kitbase, com o SAP B1 ou com o banco do CanhotoLog — tudo passa pelo backend, que é quem tem as credenciais e a lógica de negócio. Isso é o mesmo princípio de segurança de qualquer app mobile (nunca embutir senha de banco de produção dentro do `.apk`).

### Por que WebSocket, e como ele funciona "offline"

WebSocket não é offline por natureza — a parte "funciona sem conexão" é toda responsabilidade do app: cada tela grava primeiro no SQLite local (`src/db/localDb.ts`) e só DEPOIS tenta sincronizar (`src/sync/syncManager.ts`). Se não houver conexão, o dado fica numa fila local (`outbox`) e é enviado assim que a internet voltar — o app detecta isso com `@react-native-community/netinfo` e reconecta o WebSocket sozinho (com backoff exponencial). A pessoa nunca fica esperando rede para conseguir salvar um cadastro ou uma conferência.

Fotos trafegam em **frames binários puros** (não em base64 dentro do JSON, que ficaria ~33% maior) — ver o protocolo comentado em `MobileApp/src/types/protocol.ts` (idêntico a `backend/src/ws/protocol.ts`). Antes de sair do aparelho, cada foto já é redimensionada para no máximo 1600px e comprimida a 70% de qualidade (ver `MobileApp/src/sync/fotoUtils.ts`) — isso sozinho já reduz bastante o consumo de banda em relação a mandar a foto original da câmera.

## Suposições assumidas (confirmar com o time da Adooren)

Como já aconteceu com a integração do SAP B1 e do kitbase no sistema web, várias decisões aqui foram tomadas com o melhor julgamento possível, mas **precisam ser confirmadas antes de ir para produção**:

1. **"Responsável pelo carregamento"**: a tabela `transportes` exige esse campo, mas ele não foi pedido explicitamente na lista de campos do app. Assumi que é sempre o nome do usuário logado que está cadastrando — mesmo critério já usado em "responsável pelo descarregamento" no Registrar Entrega do sistema web.
2. **Etiquetas da obra, na conferência de entrega**: carrego TODAS as etiquetas do kitbase cuja coluna `obra` bate com a obra da NF, **sem filtrar por status** (diferente do menu Descarga, que só considera etiquetas em status "elegíveis" para descarga). Faz sentido porque aqui a ideia é conferir fisicamente tudo que chegou, não mudar status de despacho — mas vale confirmar.
3. **Checklist de defeitos**: interpretei a frase do pedido original como uma lista de **6 itens específicos** (fechadura danificada, salto com avaria, pintura arranhada, batente quebrado, alisar quebrado, dobradiça com defeito) — e não incluí "kit com defeito" como um 7º item genérico separado, já que marcar qualquer defeito específico já implica que o kit não está OK. Se a intenção era ter também uma opção genérica "com defeito" sem detalhar qual, é uma mudança pequena em `DEFEITOS_KIT` (`MobileApp/src/types/protocol.ts`, espelhado no backend).
4. **Onde o cadastro de carregamento é gravado**: na mesma tabela `transportes` do CanhotoLog web (confirmado com você) — adicionei uma coluna nova `numero_serie` nela (migração automática, mesmo padrão das demais).
5. **Fotos e observação da conferência**: uma vez só, no final, para a NF/obra inteira (confirmado com você) — não por etiqueta individual.
6. **Múltiplos defeitos por etiqueta**: sim, seleção múltipla (confirmado com você).

## Suposições técnicas (menos sobre negócio, mais sobre a implementação)

- **Autenticação**: o backend usa a MESMA tabela `usuarios` do CanhotoLog web, e `bcryptjs` (Node) valida corretamente o hash `$2y$` que o `password_hash()` do PHP gera — testei isso diretamente (gerei um hash real com PHP e validei no Node) antes de confiar nisso, já que é fácil essa combinação dar errado silenciosamente.
- **Sessão**: o login emite um token opaco (guardado em memória no servidor, tabela `Map` — ver `backend/src/ws/session.ts`), válido por `SESSION_TTL_HORAS` (padrão 12h). O app guarda esse token localmente e reautentica sozinho em segundo plano quando a conexão cai e volta — nunca guarda a senha da pessoa no aparelho.
- **Idempotência**: tanto "Novo Cadastro" quanto "Registrar Entrega" podem ser reenviados com segurança (o app reenvia da fila se a confirmação se perder) — o servidor reconhece um reenvio e devolve o resultado já existente em vez de duplicar ou dar erro.
- **SQLite em modo WAL**: o backend liga `PRAGMA journal_mode = WAL` na conexão com o banco do CanhotoLog, para o processo PHP (servidor web) e este processo Node conseguirem ler/gravar ao mesmo tempo sem se atrapalharem.

## Configuração

### Backend

```
cd backend
cp .env.example .env   # edite os valores para o seu ambiente
npm install
npm run build
npm start               # ou: npm run dev (com reinício automático)
```

As variáveis em `.env` usam os MESMOS nomes já usados em `config.php` do CanhotoLog web (`DB_DRIVER`, `SQLSRV_*`, `KITBASE_*`, `SAP_B1_*`) — aponte `SQLITE_PATH` (ou `SQLSRV_*`) para o MESMO banco que o sistema web usa, para os dois lerem/gravarem os mesmos dados. Veja os comentários em `backend/.env.example` para cada variável.

**Onde hospedar**: o backend precisa alcançar, ao mesmo tempo, o banco do CanhotoLog, o kitbase (`10.1.1.2`, um IP privado — então precisa estar na mesma rede/VPN) e o SAP B1 (`b1.ativy.com`). Na prática, o mais simples é rodar este backend no MESMO servidor onde o CanhotoLog web já está hospedado, já que aquele servidor já tem acesso a tudo isso.

**Processo em produção**: `node dist/index.js` sozinho não reinicia se cair. Recomendo `pm2` (`npm i -g pm2 && pm2 start dist/index.js --name canhotolog-mobile`) ou um serviço systemd — o time de infraestrutura da Adooren provavelmente já tem um padrão para isso.

**HTTPS/WSS obrigatório em produção**: tanto Android quanto iOS **bloqueiam tráfego não criptografado por padrão** desde versões já antigas dos dois sistemas. Ou seja, `ws://` (sem criptografia) só funciona em desenvolvimento local (emulador); em produção o backend PRECISA estar atrás de HTTPS/WSS de verdade (um certificado válido — Let's Encrypt resolve isso de graça), normalmente com um nginx na frente fazendo o "TLS termination" e repassando para o Node por trás. Sem isso, o app simplesmente não vai conseguir conectar a partir de um celular real.

### App mobile

```
cd MobileApp
npm install
```

Antes de rodar:

1. Edite `src/config.ts` e troque `WS_URL` de produção pelo endereço real do backend (com `wss://`).
2. **Renomeie o app** antes de publicar: o projeto foi gerado com o nome interno "MobileApp" (bundle id `org.reactjs.native.example.MobileApp` / `com.mobileapp`) — isso precisa virar algo como `com.adooren.canhotolog` antes de ir para as lojas. A forma mais simples é a ferramenta `react-native-rename` (`npx react-native-rename "CanhotoLog" -b com.adooren.canhotolog`), ou renomear manualmente em `android/app/build.gradle` (applicationId), `ios/MobileApp.xcodeproj` (Bundle Identifier, via Xcode) e `app.json`.
3. **Ícone e splash screen**: o projeto ainda usa os padrões do React Native — precisa de artes finais da Adooren antes de publicar (isso normalmente é feito com `react-native-bootsplash` ou similar, ou diretamente nos projetos nativos).

Rodar em desenvolvimento (precisa de Android Studio + SDK, ou Xcode + CocoaPods, instalados na máquina de quem for compilar):

```
npx react-native run-android      # ou
npx react-native run-ios
```

No emulador Android, `WS_URL` já está configurado para `ws://10.0.2.2:8787/ws` (o `10.0.2.2` é como o emulador enxerga o `localhost` da máquina host) — funciona direto contra o backend rodando local. **Num dispositivo físico Android real**, `ws://` (sem TLS) vai ser bloqueado pela Network Security Config padrão do Android a menos que você rode o backend com HTTPS/WSS mesmo em teste, ou libere cleartext explicitamente para o seu IP de desenvolvimento em `android/app/src/main/res/xml/network_security_config.xml` (não incluído aqui) — outra opção mais simples para testar rápido num celular físico é expor o backend local via um túnel HTTPS (ex.: `ngrok http 8787`) e apontar `WS_URL` pra URL `wss://` que ele gerar.

## Build e publicação (feito pelo time da Adooren, com as próprias contas)

**Android**: `cd android && ./gradlew bundleRelease` gera um `.aab` assinado (configure antes o keystore de assinatura em `android/app/build.gradle` / `android/gradle.properties` — a documentação oficial do React Native tem o passo a passo de "Generating a signing key" e "Setting up gradle variables"). O `.aab` é enviado no Google Play Console.

**iOS**: abra `ios/MobileApp.xcworkspace` no Xcode (depois de rodar `cd ios && pod install`), configure o time de desenvolvedor Apple e o Bundle Identifier, e use "Product > Archive" para gerar o build e enviar para o App Store Connect via Xcode Organizer ou Transporter.

Nenhuma dessas contas (Apple Developer, Google Play Console) foi criada ou usada aqui — são credenciais próprias da Adooren.

## Segurança — recomendações que seguem valendo

- O backend usa, por padrão, a mesma conta `sa` do SQL Server que já era usada no menu Descarga — a recomendação já feita antes segue de pé: trocar por um login dedicado com permissão mínima, e trocar a senha, já que ela circulou em texto simples no chat.
- O token de sessão fica em memória no processo Node — se o backend reiniciar, todo mundo precisa logar de novo (não é um bug, é uma limitação simples aceitável para o tamanho desse sistema; se crescer muito, trocar por Redis é o próximo passo natural).
- Nunca habilite `SAP_B1_VERIFICAR_SSL=0` ou rode o backend sem HTTPS/WSS em produção — ambos enfraquecem a segurança da conexão.
