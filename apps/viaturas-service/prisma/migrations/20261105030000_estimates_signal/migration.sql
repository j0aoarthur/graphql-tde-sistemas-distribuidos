-- AlterTable
ALTER TABLE "Despacho" ADD COLUMN     "etaAtualSegundos" DOUBLE PRECISION,
ADD COLUMN     "fatorSimulacaoAplicado" DOUBLE PRECISION,
ADD COLUMN     "origemDados" TEXT NOT NULL DEFAULT 'SIMULACAO',
ADD COLUMN     "previsaoAtualizadaEm" TIMESTAMPTZ(3),
ADD COLUMN     "previsaoChegadaEm" TIMESTAMPTZ(3),
ADD COLUMN     "versaoPrevisao" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Viatura" ADD COLUMN     "estadoSinal" TEXT NOT NULL DEFAULT 'DESCONHECIDO';

