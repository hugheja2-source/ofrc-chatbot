FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.node.json ./
COPY src ./src
COPY public ./public

ARG VITE_API_URL
ARG VITE_MODE=production
ENV VITE_API_URL=${VITE_API_URL}

RUN if [ "${VITE_MODE}" = "staging" ]; then npm run build:staging; else npm run build; fi

FROM caddy:2-alpine AS runtime

WORKDIR /srv
COPY --from=build /app/dist /srv
COPY Caddyfile.frontend /etc/caddy/Caddyfile

EXPOSE 80
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
