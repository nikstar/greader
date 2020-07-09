FROM node:13.12.0-alpine

WORKDIR /usr/app

ADD . /usr/app 
RUN npm i
RUN npm run tsc

CMD [ "node", "--unhandled-rejections=strict", ".build/index.js" ]
