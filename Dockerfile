FROM golang:1.15.8-alpine

WORKDIR /go/src/app

CMD /go/src/app/prometheus-explorer -addr 0.0.0.0:12345

COPY . .

RUN go build .
