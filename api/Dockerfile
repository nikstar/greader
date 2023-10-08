FROM node:20.7.0-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm i

COPY app.js ./

CMD [ "node", "--unhandled-rejections=strict", "--inspect=0.0.0.0", "app.js" ]
