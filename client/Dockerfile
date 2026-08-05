FROM node:22-alpine AS build
WORKDIR /app
ARG KICKIT_API_URL=http://server:3001
ENV KICKIT_API_URL=$KICKIT_API_URL
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S kickit && adduser -S -G kickit kickit
COPY --from=build --chown=kickit:kickit /app/.next/standalone ./
COPY --from=build --chown=kickit:kickit /app/.next/static ./.next/static
COPY --from=build --chown=kickit:kickit /app/public ./public
USER kickit
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
