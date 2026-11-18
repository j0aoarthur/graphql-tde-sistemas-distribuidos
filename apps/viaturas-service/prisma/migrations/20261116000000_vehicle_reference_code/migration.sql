-- Numero de referencia operacional (VTR-001, VTR-002...) gerado pelo banco.
-- A placa deixa de ser o identificador exibido ao operador e passa a ser apenas um dado do veiculo.
ALTER TABLE "Viatura" ADD COLUMN "codigo" INTEGER;

-- Backfill deterministico das viaturas existentes (ordem alfabetica da placa).
UPDATE "Viatura" v SET "codigo" = o.n
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY placa) AS n FROM "Viatura") o
WHERE v.id = o.id;

CREATE SEQUENCE "Viatura_codigo_seq" OWNED BY "Viatura"."codigo";
SELECT setval('"Viatura_codigo_seq"', COALESCE((SELECT MAX("codigo") FROM "Viatura"), 0) + 1, false);
ALTER TABLE "Viatura" ALTER COLUMN "codigo" SET DEFAULT nextval('"Viatura_codigo_seq"');
ALTER TABLE "Viatura" ALTER COLUMN "codigo" SET NOT NULL;

CREATE UNIQUE INDEX "Viatura_codigo_key" ON "Viatura"("codigo");
