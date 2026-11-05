-- AlterTable
ALTER TABLE "EventoOcorrencia" ALTER COLUMN "descricao" DROP DEFAULT;

-- CreateTable
CREATE TABLE "SessaoToken" (
    "tokenHash" TEXT NOT NULL,
    "sessaoId" UUID NOT NULL,
    "usadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessaoToken_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "EventoSessao" (
    "id" UUID NOT NULL,
    "sessaoId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "ocorridoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoSessao_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SessaoToken" ADD CONSTRAINT "SessaoToken_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "Sessao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoSessao" ADD CONSTRAINT "EventoSessao_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "Sessao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

