CREATE TABLE "Sessao" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "adminId" UUID NOT NULL REFERENCES "Admin"("id") ON DELETE CASCADE,
 "tokenHash" TEXT NOT NULL UNIQUE, "anteriorHash" TEXT, "rotacionadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiraEm" TIMESTAMP(3) NOT NULL, "revogadoEm" TIMESTAMP(3)
);
CREATE INDEX "Sessao_adminId_idx" ON "Sessao"("adminId");
