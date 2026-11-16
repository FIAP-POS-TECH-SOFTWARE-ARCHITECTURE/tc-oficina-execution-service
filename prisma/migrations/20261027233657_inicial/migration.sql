-- CreateEnum
CREATE TYPE "EtapaExecucao" AS ENUM ('DIAGNOSTICO', 'REPARO');

-- CreateEnum
CREATE TYPE "StatusOrdemExecucao" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'REJEITADA', 'INVIAVEL', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoItemExecucao" AS ENUM ('SERVICO', 'INSUMO');

-- CreateEnum
CREATE TYPE "StatusItemExecucao" AS ENUM ('PENDENTE', 'EM_EXECUCAO', 'CONCLUIDO');

-- CreateEnum
CREATE TYPE "StatusOutbox" AS ENUM ('PENDENTE', 'ENVIADA', 'FALHA');

-- CreateTable
CREATE TABLE "ordens_execucao" (
    "id" UUID NOT NULL,
    "os_id" UUID NOT NULL,
    "fluxo_id" UUID NOT NULL,
    "numero_os" TEXT NOT NULL,
    "etapa" "EtapaExecucao" NOT NULL,
    "status" "StatusOrdemExecucao" NOT NULL DEFAULT 'PENDENTE',
    "mecanico_id" UUID,
    "cliente" JSONB,
    "veiculo" JSONB,
    "observacoes_atendimento" TEXT,
    "diagnostico" TEXT,
    "motivo" TEXT,
    "iniciada_em" TIMESTAMP(3),
    "finalizada_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordens_execucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_execucao" (
    "id" UUID NOT NULL,
    "ordem_execucao_id" UUID NOT NULL,
    "tipo" "TipoItemExecucao" NOT NULL,
    "referencia_id" UUID NOT NULL,
    "item_os_id" UUID,
    "nome" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "tempo_estimado_min" INTEGER,
    "status" "StatusItemExecucao",
    "iniciado_em" TIMESTAMP(3),
    "concluido_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itens_execucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_execucao" (
    "id" UUID NOT NULL,
    "ordem_execucao_id" UUID NOT NULL,
    "status_anterior" "StatusOrdemExecucao",
    "status_novo" "StatusOrdemExecucao" NOT NULL,
    "usuario_id" UUID,
    "observacao" TEXT,
    "message_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_execucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fluxos_cancelados" (
    "fluxo_id" UUID NOT NULL,
    "os_id" UUID NOT NULL,
    "motivo" TEXT NOT NULL,
    "cancelado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fluxos_cancelados_pkey" PRIMARY KEY ("fluxo_id")
);

-- CreateTable
CREATE TABLE "outbox_mensagens" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "fluxo_id" UUID,
    "tipo" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "corpo" JSONB NOT NULL,
    "status" "StatusOutbox" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ultimo_erro" TEXT,
    "proxima_tentativa_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviada_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_processadas" (
    "message_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "processada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_processadas_pkey" PRIMARY KEY ("message_id")
);

-- CreateIndex
CREATE INDEX "ordens_execucao_etapa_status_created_at_idx" ON "ordens_execucao"("etapa", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ordens_execucao_os_id_etapa_key" ON "ordens_execucao"("os_id", "etapa");

-- CreateIndex
CREATE INDEX "itens_execucao_ordem_execucao_id_idx" ON "itens_execucao"("ordem_execucao_id");

-- CreateIndex
CREATE INDEX "historico_execucao_ordem_execucao_id_idx" ON "historico_execucao"("ordem_execucao_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_mensagens_message_id_key" ON "outbox_mensagens"("message_id");

-- CreateIndex
CREATE INDEX "outbox_mensagens_status_proxima_tentativa_em_idx" ON "outbox_mensagens"("status", "proxima_tentativa_em");

-- CreateIndex
CREATE INDEX "outbox_mensagens_fluxo_id_idx" ON "outbox_mensagens"("fluxo_id");

-- AddForeignKey
ALTER TABLE "itens_execucao" ADD CONSTRAINT "itens_execucao_ordem_execucao_id_fkey" FOREIGN KEY ("ordem_execucao_id") REFERENCES "ordens_execucao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_execucao" ADD CONSTRAINT "historico_execucao_ordem_execucao_id_fkey" FOREIGN KEY ("ordem_execucao_id") REFERENCES "ordens_execucao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
