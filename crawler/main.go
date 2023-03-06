package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	urllib "net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v4/pgxpool"
)

const (
	// numWorkers is the number of concurrent workers
	numWorkers = 32
)

// sets up crawler and server
func main() {

	done := make(chan bool)

	// init database
	var err error
	db, err = pgxpool.Connect(context.Background(), "")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		fmt.Fprintf(os.Stderr, "Printing environment variables and exiting...\n")
		for _, e := range os.Environ() {
			fmt.Fprintln(os.Stderr, e)
		}
		os.Exit(1)
	}
	defer db.Close()

	// handle interrupt
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	go func() {
		for sig := range c {
			if sig == os.Interrupt || sig == syscall.SIGTERM {
				log.Printf("Recieved signal: %v. Exiting...", sig)
				done <- true
				db.Close()
				os.Exit(0)
			}
		}
	}()

	// crawl
	go crawler(done)

	// server
	http.HandleFunc("/crawl", handleCrawl)
	http.ListenAndServe(":9090", nil)
}

// crawler crawls outdated feeds at regular intervals
//
// It sets up numWorkers workers to crawl feeds concurrently. Then periodically calls findOutdatedFeeds to find outdated feeds and send them to workers.
func crawler(done <-chan bool) {
	ticker := time.NewTicker(30 * time.Second)
	outdatedFeeds := make(chan *Feed)
	out := make(chan string)
	for w := 0; w < numWorkers; w++ {
		go worker(outdatedFeeds, out)
	}
	for {
		select {
		case <-ticker.C:
			log.Println("tick")
			findOutdatedFeeds(outdatedFeeds)
		case url := <-out:
			log.Println("crawled", url)
		case <-done:
			return
		}
	}
}

// findOutdatedFeeds crawls all outdated feeds and reports updated feeds to provided channel
func findOutdatedFeeds(in chan<- *Feed) {
	feeds, err := selectOutdated()
	if err != nil {
		log.Println("failed to select outdated:", err)
		return
	}
	go func() {
		for _, feed := range feeds {
			in <- feed
		}
	}()
}

// worker crawls a feed it recieves from in chan and reports back to out chan for logging
func worker(in <-chan *Feed, out chan<- string) {
	for f := range in {
		fetchFeed(f)
		out <- f.url
	}
}

// handleCrawl handles the /crawl endpoint
//
// Example: GET /crawl?url=https://example.com/feed.xml
//
// If crawl is successful, the response will be: code 200, body feed id
// If crawl is unsuccessful, the response will be: code 400, body error message
func handleCrawl(w http.ResponseWriter, r *http.Request) {
	log.Printf("GET %v?%v", r.URL.Path, r.URL.RawQuery)
	urls, ok := r.URL.Query()["url"]
	if !ok || len(urls[0]) < 1 {
		log.Println("Parameter 'url' is missing")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte("Parameter `url' is missing"))
		return
	}
	rawurl := urls[0]
	url, err := urllib.Parse(rawurl)
	if err != nil {
		log.Println("URL malformed")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte("Bad URL"))
		return
	}
	if url.Scheme == "" {
		url.Scheme = "https"
	}
	var feed = &Feed{url: url.String()}
	_, err = fetchFeed(feed)
	if err != nil {
		log.Printf("error: fetch failed: url=%v %v\n", feed.url, err)
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte("Fetch feed failed with error: " + err.Error()))
		return
	}
	w.Header().Add("Content-Type", "plain/text")
	log.Printf("OK %v->%v", feed.url, feed.id)
	fmt.Fprintf(w, "%v\n", feed.id)
}
