CREATE TABLE "Viatura" (
  "id" UUID NOT NULL,
  "placa" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DISPONIVEL',
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "capacidade" INTEGER NOT NULL DEFAULT 1,
  "versao" INTEGER NOT NULL DEFAULT 0,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Viatura_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Viatura_position_check" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);
CREATE UNIQUE INDEX "Viatura_placa_key" ON "Viatura"("placa");
CREATE INDEX "Viatura_status_idx" ON "Viatura"("status");
CREATE TABLE "Despacho" (
  "id" UUID NOT NULL,
  "ocorrenciaId" UUID NOT NULL,
  "viaturaId" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMADO',
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "destinoLat" DOUBLE PRECISION,
  "destinoLon" DOUBLE PRECISION,
  "rota" JSONB,
  "distanciaMetros" DOUBLE PRECISION,
  "duracaoSegundos" DOUBLE PRECISION,
  "progresso" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "simulacaoPausada" BOOLEAN NOT NULL DEFAULT false,
  "rotaErro" TEXT,
  "concluidoEm" TIMESTAMP(3),
  CONSTRAINT "Despacho_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Despacho_progresso_check" CHECK ("progresso" BETWEEN 0 AND 1)
);
CREATE UNIQUE INDEX "Despacho_ocorrenciaId_key" ON "Despacho"("ocorrenciaId");
CREATE INDEX "Despacho_viaturaId_status_idx" ON "Despacho"("viaturaId","status");
ALTER TABLE "Despacho" ADD CONSTRAINT "Despacho_viaturaId_fkey" FOREIGN KEY ("viaturaId") REFERENCES "Viatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX uq_viatura_despacho_ativo ON "Despacho"("viaturaId") WHERE status IN ('CONFIRMADO','EM_DESLOCAMENTO','NO_LOCAL','EM_ATENDIMENTO');
CREATE TABLE "Outbox" (
  "id" UUID NOT NULL,
  "tipo" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publicadoEm" TIMESTAMP(3),
  CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);
