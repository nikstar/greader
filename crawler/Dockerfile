FROM golang:1.14.4-alpine

WORKDIR /usr/app

COPY go.mod go.sum *.go ./
RUN go mod download && go build -o crawler

CMD [ "/usr/app/crawler" ]

EXPOSE 9090
