CREATE TABLE "Central" (
  "id" UUID NOT NULL,
  "codigo" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Central_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Central_codigo_key" ON "Central"("codigo");
CREATE TABLE "Admin" (
  "id" UUID NOT NULL,
  "centralId" UUID NOT NULL,
  "nome" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "senhaHash" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "papel" TEXT NOT NULL DEFAULT 'ADMIN',
  CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_centralId_fkey" FOREIGN KEY ("centralId") REFERENCES "Central"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "Ocorrencia" (
  "id" UUID NOT NULL,
  "centralId" UUID NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "prioridade" INTEGER NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEBIDA',
  "viaturaId" UUID,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Ocorrencia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Ocorrencia_prioridade_check" CHECK ("prioridade" BETWEEN 1 AND 5),
  CONSTRAINT "Ocorrencia_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
  CONSTRAINT "Ocorrencia_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180)
);
CREATE UNIQUE INDEX "Ocorrencia_centralId_clientRequestId_key" ON "Ocorrencia"("centralId","clientRequestId");
CREATE INDEX "Ocorrencia_status_criadoEm_idx" ON "Ocorrencia"("status","criadoEm");
ALTER TABLE "Ocorrencia" ADD CONSTRAINT "Ocorrencia_centralId_fkey" FOREIGN KEY ("centralId") REFERENCES "Central"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "Outbox" (
  "id" UUID NOT NULL,
  "tipo" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publicadoEm" TIMESTAMP(3),
  "lockedUntil" TIMESTAMP(3),
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Outbox_publicadoEm_lockedUntil_idx" ON "Outbox"("publicadoEm","lockedUntil");
