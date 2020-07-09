FROM golang:1.14.4-alpine

WORKDIR /usr/app

ADD . /usr/app
RUN go install

CMD [ "crawler" ]
EXPOSE 9090