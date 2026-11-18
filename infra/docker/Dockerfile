FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
RUN npm install --no-audit --no-fund
# Prisma requires environment values during generation, but no network/database connection.
ENV OCC_DATABASE_URL=postgresql://demo:demo@localhost:5432/ocorrencias_db
ENV VIATURAS_DATABASE_URL=postgresql://demo:demo@localhost:5432/viaturas_db
RUN npm run db:generate && npm run build
# Generated Prisma clients live next to source and are required at runtime.
RUN cp -R apps/ocorrencias-service/src/generated/client apps/ocorrencias-service/dist/generated/ && \
    cp -R apps/viaturas-service/src/generated/client apps/viaturas-service/dist/generated/
FROM node:22-bookworm-slim
ARG SERVICE=gateway
ENV SERVICE=${SERVICE} NODE_ENV=production
WORKDIR /app
COPY --from=builder /app ./
# Runtime includes OpenSSL for Prisma on Debian and shell for the dynamic entrypoint.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
CMD ["sh","-c","exec node apps/${SERVICE}/dist/main.js"]
