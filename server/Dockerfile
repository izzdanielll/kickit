FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM build AS migration
ENV NODE_ENV=production
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node node_modules/ts-node/dist/bin.js prisma/seed.ts"]

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S kickit && adduser -S -G kickit kickit \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=production-dependencies --chown=kickit:kickit /app/package.json ./package.json
COPY --from=production-dependencies --chown=kickit:kickit /app/node_modules ./node_modules
COPY --from=build --chown=kickit:kickit /app/dist ./dist
COPY --from=build --chown=kickit:kickit /app/prisma ./prisma
USER kickit
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/api/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/src/main.js"]
