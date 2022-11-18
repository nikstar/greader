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
    f.id = insertNewFeedOrUpdate(f.url, feed.Title, items[len(items)-1].PublishedParsed)

	log.Printf("feed: id=%v url=%v", f.id, f.url)

	for _, item := range items {
		_ = insertNewFeedItemOrDoNothing(f.id, item)
	}
	return feed, nil
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
