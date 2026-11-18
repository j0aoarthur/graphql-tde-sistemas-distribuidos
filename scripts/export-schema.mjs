// Exporta o schema GraphQL federado (SDL) a partir do gateway em execução (introspecção só fora de produção).
// Uso: GRAPHQL_URL=http://localhost:4000/graphql npm run schema:export   → docs/schema.graphql
import { writeFileSync } from 'node:fs';
import { buildClientSchema, getIntrospectionQuery, printSchema } from 'graphql';
const API = process.env.GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: getIntrospectionQuery() }) });
const body = await res.json().catch(() => null);
if (!body?.data?.__schema) throw new Error(`Introspecção indisponível em ${API} (gateway fora do ar, em produção ou outra aplicação na porta?)`);
const sdl = `# Schema GraphQL do SDV (gerado por scripts/export-schema.mjs a partir do gateway). Não editar à mão.\n${printSchema(buildClientSchema(body.data))}`;
writeFileSync('docs/schema.graphql', sdl);
console.log(`docs/schema.graphql atualizado (${sdl.split('\n').length} linhas) de ${API}`);
