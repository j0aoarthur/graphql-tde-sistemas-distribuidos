-- Keep the initial wall-clock forecast immutable, including through factor changes and pauses.
-- Historical rows remain NULL: their original forecast cannot be recovered reliably.
ALTER TABLE "Despacho" ADD COLUMN "previsaoChegadaInicialEm" TIMESTAMPTZ(3);
