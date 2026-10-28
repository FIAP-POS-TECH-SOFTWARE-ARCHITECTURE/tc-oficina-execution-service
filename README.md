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

## Documentação da API

Swagger em `/execucao/docs` (JSON em `/execucao/docs-json`). Health em `/health` (liveness) e `/health/ready` (readiness com banco).

## Contratos

`contratos/` é uma cópia de `tc-oficina-os-service/contratos` (schemas JSON das mensagens, exemplos e tipos). O CI confere que as duas cópias estão sincronizadas.
