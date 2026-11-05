-- DropForeignKey
ALTER TABLE "Sessao" DROP CONSTRAINT "Sessao_adminId_fkey";

-- AlterTable
ALTER TABLE "Ocorrencia" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "complemento" TEXT,
ADD COLUMN     "descricao" TEXT NOT NULL DEFAULT 'Não registrado (legado)',
ADD COLUMN     "enderecoFormatado" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "localConfirmado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "origemLocalizacao" TEXT NOT NULL DEFAULT 'PIN',
ADD COLUMN     "precisaoLocalizacao" TEXT NOT NULL DEFAULT 'APROXIMADA',
ADD COLUMN     "referencia" TEXT;

-- AlterTable
ALTER TABLE "Sessao" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "EventoOcorrencia" (
    "id" UUID NOT NULL,
    "ocorrenciaId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "ocorridoEm" TIMESTAMPTZ(3) NOT NULL,
    "registradoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origemServico" TEXT NOT NULL,
    "eventIdOrigem" TEXT NOT NULL,
    "adminId" UUID,
    "centralId" UUID,
    "descricao" TEXT NOT NULL DEFAULT 'Não registrado (legado)',
    "metadados" JSONB,

    CONSTRAINT "EventoOcorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventoOcorrencia_eventIdOrigem_key" ON "EventoOcorrencia"("eventIdOrigem");

-- CreateIndex
CREATE INDEX "EventoOcorrencia_ocorrenciaId_ocorridoEm_id_idx" ON "EventoOcorrencia"("ocorrenciaId", "ocorridoEm", "id");

-- AddForeignKey
ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoOcorrencia" ADD CONSTRAINT "EventoOcorrencia_ocorrenciaId_fkey" FOREIGN KEY ("ocorrenciaId") REFERENCES "Ocorrencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Ocorrencia" ALTER COLUMN "descricao" DROP DEFAULT, ALTER COLUMN "origemLocalizacao" DROP DEFAULT, ALTER COLUMN "precisaoLocalizacao" DROP DEFAULT;
