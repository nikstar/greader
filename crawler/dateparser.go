package main

import (
	"fmt"
	"strings"
	"time"
)

// DateFormats taken from github.com/mjibson/goread
var dateFormats = []string{}

// Named zone cannot be consistently loaded, so handle separately
var dateFormatsWithNamedZone = []string{}

// ParseDate parses a given date string using a large
// list of commonly found feed date formats.
func ParseDate(ds string) (t time.Time, err error) {
	d := strings.TrimSpace(ds)
	if d == "" {
		return t, fmt.Errorf("Date string is empty")
	}
	for _, f := range dateFormats {
		if t, err = time.Parse(f, d); err == nil {
			return
		}
	}
	for _, f := range dateFormatsWithNamedZone {
		t, err = time.Parse(f, d)
		if err != nil {
			continue
		}

		// This is a format match! Now try to load the timezone name
		loc, err := time.LoadLocation(t.Location().String())
		if err != nil {
			// We couldn't load the TZ name. Just use UTC instead...
			return t, nil
		}

		if t, err = time.ParseInLocation(f, ds, loc); err == nil {
			return t, nil
		}
		// This should not be reachable
	}

	err = fmt.Errorf("Failed to parse date: %s", ds)
	return
}
