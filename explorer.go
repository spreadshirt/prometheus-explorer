package main

import (
	"encoding/json"
	"flag"
	"html/template"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path"
	"regexp"
	"sort"
	"strings"
	"sync"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
)

var config struct {
	Addr string

	CertFile string
	KeyFile  string
}

var boardTmpl *template.Template

func main() {
	flag.StringVar(&config.Addr, "addr", "localhost:12345", "The address to listen on.")
	flag.StringVar(&config.CertFile, "cert-file", "", "The HTTPS certificate to use")
	flag.StringVar(&config.KeyFile, "key-file", "", "The HTTPS certificate key to use")
	flag.Parse()

	var err error
	boardTmpl, err = template.ParseFiles("board.tmpl")
	if err != nil {
		log.Fatalf("invalid template: %s", err)
	}

	r := mux.NewRouter()
	r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("./static"))))
	r.HandleFunc("/names", handleNameAutocomplete).Methods("GET")
	r.HandleFunc("/{name}", renderBoard).Methods("GET")
	r.HandleFunc("/{name}", saveBoard).Methods("POST")
	r.HandleFunc("/", renderBoard).Methods("GET")

	if config.CertFile == "" || config.KeyFile == "" {
		log.Printf("Listening on http://%s", config.Addr)
		log.Fatal(http.ListenAndServe(config.Addr, handlers.CompressHandler(r)))
	} else {
		log.Printf("Listening on https://%s", config.Addr)
		log.Fatal(http.ListenAndServeTLS(config.Addr, config.CertFile, config.KeyFile, handlers.CompressHandler(r)))

	}
}

func renderBoard(w http.ResponseWriter, req *http.Request) {
	if req.URL.Query().Get("board") != "" {
		http.Redirect(w, req, "/"+req.URL.Query().Get("board"), http.StatusSeeOther)
		return
	}

	name := mux.Vars(req)["name"]
	if name == "" {
		name = "default"
	}

	isNew := false

	boardFiles, err := os.ReadDir("boards")
	if err != nil {
		log.Printf("listing boards: %s", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	boards := make([]string, 0, len(boardFiles))
	for _, boardFile := range boardFiles {
		if boardFile.IsDir() {
			continue
		}

		board := boardFile.Name()
		if board == "default.yml" || board == "shortcuts.yml" {
			continue
		}

		if strings.HasSuffix(board, ".yml") {
			boards = append(boards, board[:len(board)-4])
		}
	}
	sort.Strings(boards)
	boards = append(boards, "default", "shortcuts")

	// FIXME: restrict paths to only boards/
	data, err := ioutil.ReadFile(path.Join("boards", name+".yml"))
	if err != nil {
		log.Printf("opening board %q: %s", name, err)

		isNew = true
		data, err = ioutil.ReadFile(path.Join("boards", "default.yml"))
		if err != nil {
			log.Printf("opening board %q: %s", name, err)
			http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
			return
		}
	}

	shortcutsData, err := ioutil.ReadFile(path.Join("boards", "shortcuts.yml"))
	if err != nil {
		log.Printf("opening shortcuts %q: %s", name, err)
		shortcutsData = []byte{}
	}

	boardTmpl.Execute(w, map[string]interface{}{
		"Boards":    boards,
		"Title":     name,
		"IsNew":     isNew,
		"Config":    string(data),
		"Shortcuts": string(shortcutsData),
	})
}

func saveBoard(w http.ResponseWriter, req *http.Request) {
	boardName := mux.Vars(req)["name"]

	boardConfig := req.FormValue("config")

	if strings.TrimSpace(boardConfig) == "" {
		http.Error(w, "empty board config", http.StatusBadRequest)
		return
	}

	err := ioutil.WriteFile(path.Join("boards", boardName+".yml"), []byte(strings.ReplaceAll(boardConfig, "\r\n", "\n")), 0644)
	if err != nil {
		log.Printf("could not save board: %s", err)
		http.Error(w, "error saving board", http.StatusInternalServerError)
		return
	}

	redirect := req.URL.Path
	if boardName == "default" {
		redirect = "/"
	}
	http.Redirect(w, req, redirect, http.StatusSeeOther)
}

var namesCacheMu sync.Mutex
var namesCache = map[string][]string{}

func handleNameAutocomplete(w http.ResponseWriter, req *http.Request) {
	source := req.URL.Query().Get("source")
	match := req.URL.Query().Get("match")

	matchRE, err := regexp.Compile(match)
	if err != nil {
		log.Printf("compiling match: %s", err)
		return
	}

	namesCacheMu.Lock()
	cachedNames, cached := namesCache[source]
	namesCacheMu.Unlock()

	enc := json.NewEncoder(w)

	if !cached {
		resp, err := http.Get(source + "/api/v1/label/__name__/values")
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
