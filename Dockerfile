FROM node:20-bookworm-slim

RUN apt-get update && \
    apt-get install -y python3 make g++ build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && \
    cd node_modules/better-sqlite3 && \
    npx --yes prebuild-install -r napi || npm run build-release

COPY . .

RUN mkdir -p /app/data/uploads

EXPOSE ${PORT:-4321}

CMD ["node", "server/index.js"]
