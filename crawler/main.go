package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	urllib "net/url"
	"os"
	"os/signal"
	"sort"
	"syscall"
	"time"

	"github.com/jackc/pgx/v4/pgxpool"
	"github.com/mmcdole/gofeed"
)

const (
	numWorkers = 32
)

func recentItems(feed *gofeed.Feed) []*gofeed.Item {
	sort.Sort(feed)
	i := len(feed.Items) - 10
	if i < 0 {
		i = 0
	}
	return feed.Items[i:]
}

func normalizeItem(feed string, item *gofeed.Item) {

	// verify urls
	feedURL, err := urllib.Parse(feed)
	if err != nil {
		log.Printf("not a vaild feed url: %v", err)
		return
	}
	url, err := urllib.Parse(item.Link)
	if err != nil {
		log.Printf("not a vaild url: %v", err)
		return
	}
	if url.Host == "" {
		url.Scheme = feedURL.Scheme
		url.User = feedURL.User
		url.Host = feedURL.Host
	}
	item.Link = url.String()

	// verify dates
	if item.PublishedParsed == nil && item.Published == "" {
		item.Published = item.Updated
		item.PublishedParsed = item.UpdatedParsed
	}

	// verify date was parsed
	if item.PublishedParsed == nil {
		t, err := ParseDate(item.Published)
		if err != nil {
			log.Printf("error: custom parse failed: %v", err)
		}
		item.PublishedParsed = &t
	}
}

func fetchFeed(f *Feed) (*gofeed.Feed, error) {
	fp := gofeed.NewParser()
	feed, err := fp.ParseURL(f.url)
	if err != nil {
		return feed, err
	}
	for _, item := range feed.Items {
		normalizeItem(f.url, item)
	}
	items := recentItems(feed)
	f.id = insertNewFeedOrUpdate(f.url, feed.Title, items[len(items)-1].PublishedParsed)
	log.Printf("feed: id=%v url=%v", f.id, f.url)

	for _, item := range items {
		_ = insertNewFeedItemOrDoNothing(f.id, item)
	}
	return feed, nil
}

func worker(in <-chan *Feed, out chan<- string) {
	for f := range in {
		fetchFeed(f)
		out <- f.url
	}
}

func crawl(in chan<- *Feed) {
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

func crawler(done <-chan bool) {
	ticker := time.NewTicker(30 * time.Second)
	in := make(chan *Feed)
	out := make(chan string)
	for w := 0; w < numWorkers; w++ {
		go worker(in, out)
	}
	for {
		select {
		case <-ticker.C:
			log.Println("tick")
			crawl(in)
		case url := <-out:
			log.Println("crawled", url)
		case <-done:
			return
		}
	}
}

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

func main() {

	done := make(chan bool)

	// init database
	var err error
	db, err = pgxpool.Connect(context.Background(), "")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	// handle interrupt
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	go func() {
		for sig := range c {
			if sig == os.Interrupt || sig == syscall.SIGTERM {
				log.Printf("closing")
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
