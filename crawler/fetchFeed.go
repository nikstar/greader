package main

import (
	"log"
	urllib "net/url"
	"sort"

	"github.com/mmcdole/gofeed"
)

// fetchFeed is the main work function that fetches a single feed and writes any new info to the database
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
	if len(items) == 0 {
		return feed, nil // todo error
	}
	f.id, err = storeFeed(f.url, feed.Title, items)
	return feed, err
}

// normalizeItem fixes up common issues with feed items
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

// recentItems returns 10 most recent items from a feed
func recentItems(feed *gofeed.Feed) []*gofeed.Item {
	sort.Sort(feed)
	i := len(feed.Items) - 10
	if i < 0 {
		i = 0
	}
	return feed.Items[i:]
}
