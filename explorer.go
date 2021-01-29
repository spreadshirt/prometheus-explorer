package main

import (
	"encoding/json"
	"html/template"
	"io/ioutil"
	"log"
	"net/http"
	"path"
	"regexp"
	"sync"

	"github.com/gorilla/handlers"
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
	r.HandleFunc("/names", handleNameAutocomplete).Methods("GET")
	r.HandleFunc("/{name}", renderBoard).Methods("GET")
	r.HandleFunc("/", renderBoard).Methods("GET")

	log.Printf("Listening on http://%s", config.Addr)
	log.Fatal(http.ListenAndServe(config.Addr, handlers.CompressHandler(r)))
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

	shortcutsData, err := ioutil.ReadFile(path.Join("boards", "shortcuts.yml"))
	if err != nil {
		log.Printf("opening shortcuts %q: %s", name, err)
		shortcutsData = []byte{}
	}

	boardTmpl.Execute(w, map[string]interface{}{
		"Title":     name,
		"Config":    string(data),
		"Shortcuts": string(shortcutsData),
	})
}

var namesCacheMu sync.Mutex
var namesCache = map[string][]string{}

func handleNameAutocomplete(w http.ResponseWriter, req *http.Request) {
	source := req.URL.Query().Get("source")
	match := req.URL.Query().Get("match")

	matchRE, err := regexp.Compile(match)
	if err != nil {
		log.Printf("decoding names: %s", err)
		return
	}

	namesCacheMu.Lock()
	cachedNames, cached := namesCache[source]
	namesCacheMu.Unlock()

	enc := json.NewEncoder(w)

	if !cached {
		resp, err := http.Get("http://" + source + "/api/v1/label/__name__/values")
		if err != nil {
			log.Printf("getting names: %s", err)
			return
		}
		defer resp.Body.Close()

		dec := json.NewDecoder(resp.Body)
		var namesResp namesResponse
		err = dec.Decode(&namesResp)
		if err != nil {
			log.Printf("decoding names: %s", err)
			return
		}

		namesCacheMu.Lock()
		namesCache[source] = namesResp.Data
		namesCacheMu.Unlock()

		cachedNames = namesResp.Data
	}

	names := make([]string, 0, len(cachedNames))
	for _, name := range cachedNames {
		if matchRE.MatchString(name) {
			names = append(names, name)
		}
	}
	err = enc.Encode(namesResponse{
		Status: "success",
		Data:   names,
	})
	if err != nil {
		log.Printf("encoding names: %s", err)
	}
}

type namesResponse struct {
	Status string   `json:"status"`
	Data   []string `json:"data"`
}
