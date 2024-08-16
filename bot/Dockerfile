ARG BASE_IMAGE=node:20.7.0-alpine

FROM ${BASE_IMAGE} AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run tsc

FROM ${BASE_IMAGE}

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY --from=builder /app/.build ./.build

CMD [ "node", "--unhandled-rejections=strict", "--inspect=0.0.0.0", ".build/index.js" ]

