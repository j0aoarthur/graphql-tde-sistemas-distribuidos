-- AlterTable
ALTER TABLE "Despacho" ADD COLUMN     "chegadaEm" TIMESTAMPTZ(3),
ADD COLUMN     "despachadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "distanciaInicialMetros" DOUBLE PRECISION,
ADD COLUMN     "etaOriginalSegundos" DOUBLE PRECISION,
ADD COLUMN     "previsaoGeradaEm" TIMESTAMPTZ(3),
ADD COLUMN     "saidaEm" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Viatura" ADD COLUMN     "direcaoGraus" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "ultimaPosicaoEm" TIMESTAMPTZ(3),
ADD COLUMN     "ultimoMovimentoEm" TIMESTAMPTZ(3),
ADD COLUMN     "ultimoSinalEm" TIMESTAMPTZ(3),
ADD COLUMN     "velocidadeMps" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "versaoPosicao" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TurnoViatura" (
    "id" UUID NOT NULL,
    "viaturaId" UUID NOT NULL,
    "inicioEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fimEm" TIMESTAMPTZ(3),
    "iniciadoPor" TEXT NOT NULL DEFAULT 'SCRIPT',

    CONSTRAINT "TurnoViatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patrulha" (
    "id" UUID NOT NULL,
    "viaturaId" UUID NOT NULL,
    "rota" JSONB,
    "progresso" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "versao" INTEGER NOT NULL DEFAULT 0,
    "duracaoSegundos" DOUBLE PRECISION,
    "inicioEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fimEm" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL DEFAULT 'ATIVA',

    CONSTRAINT "Patrulha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Patrulha_viaturaId_key" ON "Patrulha"("viaturaId");

-- AddForeignKey
ALTER TABLE "TurnoViatura" ADD CONSTRAINT "TurnoViatura_viaturaId_fkey" FOREIGN KEY ("viaturaId") REFERENCES "Viatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patrulha" ADD CONSTRAINT "Patrulha_viaturaId_fkey" FOREIGN KEY ("viaturaId") REFERENCES "Viatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "TurnoViatura_ativo" ON "TurnoViatura"("viaturaId") WHERE "fimEm" IS NULL;
