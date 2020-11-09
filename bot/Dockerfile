FROM node:13.12.0-alpine

WORKDIR /usr/app

COPY package.json package-lock.json ./
RUN npm i

COPY src/ tsconfig.json /usr/app/
RUN npm run tsc

CMD [ "node", "--unhandled-rejections=strict", ".build/index.js" ]
