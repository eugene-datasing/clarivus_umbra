# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: Production runtime (Debian slim — PyMuPDF has no Alpine wheels)
FROM node:20-slim AS runner
WORKDIR /app

# Install Python3 + PyMuPDF for PDF redaction, LibreOffice headless for DOCX/XLSX→PDF conversion
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip libreoffice-nogui fonts-noto-core && \
    pip3 install --break-system-packages PyMuPDF && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy standalone build (includes bundled node_modules)
COPY --from=builder /app/.next/standalone ./
# Copy static assets and public files (not included in standalone)
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Copy Prisma schema + migrations (needed for prisma migrate deploy)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
# Copy generated Prisma client (v7 outputs to lib/generated/prisma)
COPY --from=builder /app/lib/generated/prisma ./lib/generated/prisma
# Copy Prisma CLI + engine for migrations
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
# Copy Python scripts for PDF redaction/verification
COPY --from=builder /app/lib/pipeline/redact_pdf_pymupdf.py ./lib/pipeline/redact_pdf_pymupdf.py
COPY --from=builder /app/lib/pipeline/verify_redaction_pymupdf.py ./lib/pipeline/verify_redaction_pymupdf.py

EXPOSE 3000

CMD ["node", "server.js"]
