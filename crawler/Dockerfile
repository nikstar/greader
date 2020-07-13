FROM golang:1.14.4-alpine

WORKDIR /usr/app

COPY *.go go.mod go.sum /usr/app/
RUN go build -o crawler

CMD [ "/usr/app/crawler" ]
EXPOSE 9090