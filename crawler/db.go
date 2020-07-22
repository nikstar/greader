package main

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v4/pgxpool"
	"github.com/mmcdole/gofeed"
)

const (
	stmntInsertNewFeedItemOrDoNothing = `
	INSERT INTO feed_items (feed_id, guid,  title, url, date) 
	VALUES                 ($1,      $2,    $3,    $4,  $5) 
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
			most_recent_item = EXCLUDED.most_recent_item
	RETURNING (id);
	`
)

// Feed represents a feed
type Feed struct {
	id  int64
	url string
}

var db *pgxpool.Pool

func insertNewFeedOrUpdate(feed string, title string, date *time.Time) int64 {
	var id int64
	err := db.QueryRow(context.Background(), stmntInsertNewFeedOrUpdate, feed, title, date).Scan(&id)
	if err != nil {
		log.Println("error: insertNewFeedOrUpdate:", feed, title, err)
	}
	return id
}

func insertNewFeedItemOrDoNothing(feedID int64, item *gofeed.Item) bool {
	var rowID int64
	err := db.QueryRow(context.Background(), stmntInsertNewFeedItemOrDoNothing, feedID, item.GUID, item.Title, item.Link, item.PublishedParsed).Scan(&rowID)
	if err != nil {
		return false
	}
	log.Printf("added new item: feed=%v id=%v item=%v", feedID, rowID, item.Link)
	return rowID != 0
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
