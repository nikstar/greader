package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v4/pgxpool"
	"github.com/mmcdole/gofeed"
)

// Run only against the disposable database created by test-crawler.sh.
func TestFeedDeduplication(t *testing.T) {
	if os.Getenv("TEST_CRAWLER_DATABASE") != "1" {
		t.Skip("requires isolated Postgres")
	}
	var err error
	db, err = pgxpool.Connect(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	countItems := func(t *testing.T, id int64, want int) {
		t.Helper()
		var got int
		if err := db.QueryRow(context.Background(), "SELECT count(*) FROM feed_items WHERE feed_id=$1", id).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Fatalf("got %d items, want %d", got, want)
		}
	}
	date := time.Date(2026, 10, 22, 12, 0, 0, 0, time.UTC)
	item := func(guid string) *gofeed.Item {
		return &gofeed.Item{GUID: guid, Title: "An episode", Link: "https://example.invalid/episode", PublishedParsed: &date}
	}
	store := func(t *testing.T, url string, items ...*gofeed.Item) int64 {
		t.Helper()
		id, err := storeFeed(url, "Test feed", items)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}

	for name, body := range map[string]string{
		"Atom": `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><id>urn:empty</id><title>Empty feed</title><updated>2026-11-14T00:00:00Z</updated><author><name>Test</name></author></feed>`,
		"RSS":  `<?xml version="1.0"?><rss version="2.0"><channel><title>Empty feed</title><link>https://example.invalid/</link><description>No posts yet</description></channel></rss>`,
	} {
		t.Run("empty "+name+" stores metadata and refreshes the poll schedule", func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/xml")
				fmt.Fprint(w, body)
			}))
			defer server.Close()
			f := &Feed{url: server.URL}
			if _, err := fetchFeed(f); err != nil {
				t.Fatal(err)
			}
			if f.id <= 0 {
				t.Fatalf("empty feed returned invalid id %d", f.id)
			}
			id := f.id
			if _, err := db.Exec(context.Background(), "UPDATE feeds SET next_update_time=now()-interval '1 minute' WHERE id=$1", id); err != nil {
				t.Fatal(err)
			}
			if _, err := fetchFeed(f); err != nil {
				t.Fatal(err)
			}
			var title string
			var noPosts, scheduled bool
			if err := db.QueryRow(context.Background(), "SELECT title,most_recent_item IS NULL,next_update_time>now() FROM feeds WHERE id=$1", f.id).Scan(&title, &noPosts, &scheduled); err != nil {
				t.Fatal(err)
			}
			if f.id != id || title != "Empty feed" || !noPosts || !scheduled {
				t.Fatalf("unexpected empty feed: id=%d title=%q noPosts=%v scheduled=%v", f.id, title, noPosts, scheduled)
			}
			countItems(t, f.id, 0)
		})
	}

	t.Run("an empty response preserves existing items and the latest post date", func(t *testing.T) {
		const url = "https://example.invalid/temporarily-empty"
		id := store(t, url, item("existing"))
		if got := store(t, url); got != id {
			t.Fatalf("empty crawl changed feed id from %d to %d", id, got)
		}
		countItems(t, id, 1)
		var latest time.Time
		if err := db.QueryRow(context.Background(), "SELECT most_recent_item FROM feeds WHERE id=$1", id).Scan(&latest); err != nil {
			t.Fatal(err)
		}
		if !latest.Equal(date) {
			t.Fatalf("empty crawl changed latest post date to %v", latest)
		}
	})

	t.Run("changing GUID in Point-Free style error RSS", func(t *testing.T) {
		var requests int32
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/xml")
			fmt.Fprintf(w, `<?xml version="1.0"?><rss version="2.0"><channel>
<title>Point-Free</title><link>https://example.invalid/</link><description>Test</description>
<item><title>Invalid Feed URL</title><link>https://example.invalid/</link>
<guid>%d</guid><pubDate>Mon, 01 Jan 4001 00:00:00 +0000</pubDate>
<description>This feed URL has been turned off.</description></item></channel></rss>`, atomic.AddInt32(&requests, 1))
		}))
		defer server.Close()
		f := &Feed{url: server.URL}
		for i := 0; i < 3; i++ {
			if _, err := fetchFeed(f); err != nil {
				t.Fatal(err)
			}
		}
		countItems(t, f.id, 1)
	})

	t.Run("parallel crawls of the same feed", func(t *testing.T) {
		const url = "https://example.invalid/concurrent"
		var wg sync.WaitGroup
		for i := 0; i < 20; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				if _, err := storeFeed(url, "Test feed", []*gofeed.Item{item(fmt.Sprint(i))}); err != nil {
					t.Error(err)
				}
			}(i)
		}
		wg.Wait()
		id := store(t, url, item("another-guid"))
		countItems(t, id, 1)
	})

	t.Run("normal distinct items and existing GUIDs", func(t *testing.T) {
		const url = "https://example.invalid/normal"
		id := store(t, url, item("first"), item("duplicate"))
		changedTitle := item("new-title")
		changedTitle.Title = "Another episode"
		changedURL := item("new-url")
		changedURL.Link = "https://example.invalid/another-episode"
		changedDate := item("new-date")
		later := date.Add(time.Hour)
		changedDate.PublishedParsed = &later
		store(t, url, changedTitle, changedURL, changedDate)
		countItems(t, id, 4)
		// The original GUID still deduplicates corrections to an existing post.
		original := item("first")
		original.Title = "A correction"
		store(t, url, original)
		countItems(t, id, 4)
		otherID := store(t, "https://example.invalid/another-feed", item("first"))
		countItems(t, otherID, 1)
	})

	t.Run("matches preexisting rows with different GUIDs", func(t *testing.T) {
		const url = "https://example.invalid/legacy"
		id := store(t, url, item("legacy"))
		// Simulate multiple copies inserted by the previous crawler version.
		_, err := db.Exec(context.Background(), `INSERT INTO feed_items(feed_id,guid,title,url,date)
			SELECT feed_id,'legacy-duplicate',title,url,date FROM feed_items WHERE feed_id=$1`, id)
		if err != nil {
			t.Fatal(err)
		}
		store(t, url, item("new-guid"))
		countItems(t, id, 2)
	})

	t.Run("database errors roll back the entire crawl", func(t *testing.T) {
		const url = "https://example.invalid/rollback"
		id := store(t, url, item("existing"))
		bad := item("invalid")
		bad.PublishedParsed = nil
		good := item("valid-new")
		good.Title = "New episode"
		// A valid final date lets the upsert run. A later bad item must also
		// roll back the valid new item inserted earlier in this crawl.
		if _, err := storeFeed(url, "Changed title", []*gofeed.Item{good, bad, item("existing")}); err == nil {
			t.Fatal("expected database error")
		}
		countItems(t, id, 1)
		var title string
		if err := db.QueryRow(context.Background(), "SELECT title FROM feeds WHERE id=$1", id).Scan(&title); err != nil {
			t.Fatal(err)
		}
		if title != "Test feed" {
			t.Fatalf("failed crawl changed feed metadata to %q", title)
		}
	})
}
