package main

import (
	"html/template"
	"io/ioutil"
	"log"
	"net/http"
	"path"

	"github.com/gorilla/mux"
)

var config struct {
	Addr string
}

var boardTmpl *template.Template

func main() {
	config.Addr = "localhost:12345"

	var err error
	boardTmpl, err = template.ParseFiles("board.tmpl")
	if err != nil {
		log.Fatalf("invalid template: %s", err)
	}

	r := mux.NewRouter()
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("./static"))))
	r.HandleFunc("/{name}", renderBoard).Methods("GET")
	r.HandleFunc("/", renderBoard).Methods("GET")

	http.Handle("/", r)

	log.Printf("Listening on http://%s", config.Addr)
	log.Fatal(http.ListenAndServe(config.Addr, nil))
}

func renderBoard(w http.ResponseWriter, req *http.Request) {
	name := mux.Vars(req)["name"]
	if name == "" {
		name = "default"
	}

	// FIXME: restrict paths to only boards/
	data, err := ioutil.ReadFile(path.Join("boards", name+".yml"))
	if err != nil {
		log.Printf("opening board %q: %s", name, err)
		http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
		return
	}

	boardTmpl.Execute(w, map[string]interface{}{
		"Title":  name,
		"Config": string(data),
	})
}
