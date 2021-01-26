package main

import (
	"log"
	"net/http"

	"github.com/gorilla/mux"
)

var config struct {
	Addr string
}

func main() {
	config.Addr = "localhost:12345"

	r := mux.NewRouter()
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("./static"))))
	r.Path("/").HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		http.ServeFile(w, req, "index.html")
	})

	http.Handle("/", r)

	log.Printf("Listening on http://%s", config.Addr)
	log.Fatal(http.ListenAndServe(config.Addr, nil))
}
