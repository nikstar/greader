package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v4"
	"github.com/jackc/pgx/v4/pgxpool"
	"github.com/mmcdole/gofeed"
)

const (
	stmntInsertNewFeedItemOrDoNothing = `
	INSERT INTO feed_items (feed_id, guid,  title, url, date) 
	SELECT $1, $2, $3, $4, $5
	WHERE NOT EXISTS (
		SELECT 1 FROM feed_items
		WHERE feed_id=$1 AND title=$3 AND url=$4 AND date=$5
	)
	ON CONFLICT DO NOTHING
	RETURNING (id);
	`
	stmntSelectOudated = `
	SELECT DISTINCT feeds.id, feeds.url 
	FROM feeds 
	JOIN subscriptions ON 
		subscriptions.feed_id = feeds.id 
	WHERE next_update_time < now() AND subscriptions.active;
	`
	stmntInsertNewFeedOrUpdate = `
	INSERT INTO feeds (url, title, last_update_time, next_update_time,             most_recent_item) 
	VALUES            ($1,  $2,    now(),            now() + interval '4 minutes', $3              ) 
	ON CONFLICT (url) DO 
		UPDATE SET 
			title = EXCLUDED.title, 
			last_update_time = EXCLUDED.last_update_time, 
			next_update_time = EXCLUDED.next_update_time, 
			most_recent_item = COALESCE(EXCLUDED.most_recent_item, feeds.most_recent_item)
	RETURNING (id);
	`
)

var db *pgxpool.Pool

// storeFeed serializes each feed's writes and stores one copy of an entry even
// when a publisher changes its GUID on every request. The feed upsert holds a
// row lock until commit, so the following item queries see the previous crawl's
// committed inserts, including when /crawl overlaps the scheduled crawler.
func storeFeed(feed string, title string, items []*gofeed.Item) (int64, error) {
	ctx := context.Background()
	tx, err := db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	// An empty feed has no latest post yet. Keep a known date if a publisher
	// temporarily returns no entries, and never invent an item or timestamp.
	var mostRecentItem *time.Time
	if len(items) > 0 {
		mostRecentItem = items[len(items)-1].PublishedParsed
	}
	var id int64
	err = tx.QueryRow(ctx, stmntInsertNewFeedOrUpdate, feed, title, mostRecentItem).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("store feed: %w", err)
	}

	inserted := 0
	for _, item := range items {
		var rowID int64
		err := tx.QueryRow(ctx, stmntInsertNewFeedItemOrDoNothing, id, item.GUID, item.Title, item.Link, item.PublishedParsed).Scan(&rowID)
		if err == pgx.ErrNoRows {
			continue
		}
		if err != nil {
			return 0, fmt.Errorf("store item for feed %d: %w", id, err)
		}
		inserted++
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	log.Printf("stored feed: id=%d new_items=%d", id, inserted)
	return id, nil
}

func selectOutdated() ([]*Feed, error) {
	var urls []*Feed
	rows, err := db.Query(context.Background(), stmntSelectOudated)
	if err != nil {
		log.Println("error: selectOutdated (select):", err)
		return nil, err
	}
	var (
		id  int64
		url string
	)
	for rows.Next() {
		err := rows.Scan(&id, &url)
		if err != nil {
			log.Println("error: selectOutdated (loop): ", err)
			break
		}
		urls = append(urls, &Feed{id, url})
	}
	return urls, nil
}
