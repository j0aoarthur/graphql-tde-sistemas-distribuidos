-- Executar após db:push, inclusive em bases já existentes.
-- Efeito único: no máximo um despacho ativo por viatura, independentemente de status.
CREATE UNIQUE INDEX IF NOT EXISTS uq_viatura_despacho_ativo
ON "Despacho" ("viaturaId")
WHERE status IN ('CONFIRMADO','EM_DESLOCAMENTO','NO_LOCAL','EM_ATENDIMENTO');
