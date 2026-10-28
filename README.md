# Execution Service

Microsserviço de execução da oficina mecânica: mantém as filas de **diagnóstico** e de **reparo** atendidas pelos mecânicos.

- NestJS 11 + Prisma 6 em Clean Architecture, com banco **PostgreSQL próprio** (`ordens_execucao`, `itens_execucao`, `historico_execucao`, `fluxos_cancelados`, `outbox_mensagens`, `mensagens_processadas`).
- Recebe os comandos do orquestrador da OS (`SolicitarDiagnostico`, `IniciarReparo`, `CancelarExecucao`) pela fila SQS `oficina-<env>-execucao-comandos` e publica seus eventos (`origem: execution`) no tópico SNS `oficina-<env>-eventos` por meio de um outbox transacional.
- Consulta o catálogo de serviços e insumos do os-service pela rota interna `/internal/catalogo/*` (timeout de 3 s, cache de 60 s).

## Como rodar localmente

Pré-requisitos: Node 22+ e Docker.

```bash
npm ci
docker compose -f dev/docker-compose.yml up -d --wait postgres ministack
npm run mensageria:local            # cria filas e tópico no MiniStack; conferir as envs impressas com o .env
cp -n .env.example .env
npx prisma migrate deploy
npm run start:dev
```

Conferência:

```bash
curl -s localhost:3001/health/ready
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/execucao/docs
```

## Testes

```bash
npm test                  # unitários + BDD
npm run test:cov          # com cobertura (mínimo de 80% nas 4 métricas)
npm run test:integracao   # Postgres e MiniStack reais via Testcontainers (exige Docker)
```

Qualidade local: `npm run sonar:up` e, depois de `npm run test:cov`, `npm run sonar:scan`.

O `npm test` inclui o BDD em português (`test/bdd/features/fila-reparo.feature`), que sobe a aplicação inteira contra um Postgres real (Testcontainers) e cobre fila, diagnóstico, reparo, concorrência entre mecânicos e as recusas 403/422.

### Evidência de cobertura

`npm run test:cov` (281 testes):

```
Statements   : 98.28% ( 861/876 )
Branches     : 88.83% ( 390/439 )
Functions    : 95.93% ( 165/172 )
Lines        : 98.64% ( 727/737 )
```

O quality gate do SonarQube (cobertura mínima de 80%, branches incluídas) roda no job `Qualidade (SonarQube)` do CI.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `PORT` | Porta HTTP (3000 no cluster) |
| `DATABASE_URL` | Conexão com o PostgreSQL do serviço |
| `JWT_SECRET` | Validação dos tokens emitidos pelo os-service e pela Lambda de autenticação |
| `INTERNAL_API_KEY` | Chave das rotas internas do os-service |
| `OS_SERVICE_URL` | URL base do os-service (catálogo) |
| `SNS_EVENTOS_ARN` | Tópico de eventos |
| `SQS_EXECUCAO_COMANDOS_URL` | Fila de comandos do execution |
| `AWS_REGION` | Região AWS |
| `WORKERS_HABILITADOS` | `false` desliga consumidor e relay do outbox (testes) |
| `NEW_RELIC_*` | Observabilidade |
| `AWS_ENDPOINT_URL` | Só local/testes, para apontar ao MiniStack |

## Fluxo do mecânico

Todas as rotas exigem token de `MECANICO` ou `ADMINISTRADOR`. Só o mecânico que pegou a ordem (ou um administrador) age nela; ordem cancelada pelo fluxo da OS recusa qualquer ação com `422`.

1. `GET /execucao/fila?etapa=DIAGNOSTICO`: ordens pendentes, em ordem de chegada.
2. `POST /execucao/fila/DIAGNOSTICO/proxima`: reserva a próxima ordem para o mecânico do token (`404` com a fila vazia) e publica `DiagnosticoIniciado`.
3. `GET /execucao/catalogo/servicos` e `GET /execucao/catalogo/insumos`: catálogo ativo do OS.
4. `POST /execucao/ordens/{id}/diagnostico` com os itens do catálogo (publica `DiagnosticoConcluido`), ou `POST /execucao/ordens/{id}/diagnostico/rejeitar` com o motivo quando não há reparo possível (publica `DiagnosticoRejeitado`).
5. Depois do pagamento, `POST /execucao/fila/REPARO/proxima` (publica `ReparoIniciado`).
6. Opcional: `POST /execucao/ordens/{id}/reparo/itens/{itemId}/iniciar` e `.../concluir` para registrar o tempo real de cada serviço.
7. `POST /execucao/ordens/{id}/reparo/concluir` (conclui também os serviços ainda pendentes e publica `ReparoConcluido`) ou `POST /execucao/ordens/{id}/reparo/inviavel` com o motivo (publica `ReparoInviavel`).

`GET /execucao/ordens/{id}` devolve a ordem com itens e histórico de status.

## Comunicação síncrona (REST) e assíncrona

O execution-service conversa com o os-service de duas formas. **Assíncrona** (SNS/SQS) para tudo que faz parte da Saga: recebe `SolicitarDiagnostico`, `IniciarReparo` e `CancelarExecucao` e publica `ExecucaoEnfileirada`, `DiagnosticoIniciado/Concluido/Rejeitado`, `ReparoIniciado/Concluido/Inviavel` e `ExecucaoCancelada` pelo outbox transacional. **Síncrona** (REST, `GET /internal/catalogo/servicos|insumos` com `x-internal-api-key`) em um único ponto: ao registrar o diagnóstico, o mecânico precisa saber na hora se cada serviço/insumo existe e está ativo no catálogo, que pertence ao OS. É uma consulta de leitura, com timeout de 3 s, cache de 60 s e revalidação antes de recusar; se o OS estiver fora do ar, a API responde 503 e nada é gravado. Nenhum banco de outro serviço é acessado.

## Concorrência na fila

A próxima ordem é escolhida com `SELECT … FOR UPDATE SKIP LOCKED` na mesma transação que a atribui ao mecânico: dois mecânicos nunca recebem a mesma ordem, e nenhum espera o lock do outro. O teste de integração com Postgres real prova os dois lados (linha travada é pulada sem bloquear; 10 mecânicos simultâneos em 5 ordens recebem 5 ordens distintas).

## Reparo inviável

`POST /execucao/ordens/{id}/reparo/inviavel` publica `ReparoInviavel`. O orquestrador da OS reage com a compensação completa: estorna o pagamento, cancela o orçamento, estorna a reserva de estoque e cancela a OS.

## Documentação da API

Swagger em `/execucao/docs` (JSON em `/execucao/docs-json`). Health em `/health` (liveness) e `/health/ready` (readiness com banco).

## Contratos

`contratos/` é uma cópia de `tc-oficina-os-service/contratos` (schemas JSON das mensagens, exemplos e tipos). O CI confere que as duas cópias estão sincronizadas.
