DELETE FROM feed_items
WHERE id in(
	WITH t AS (
			SELECT
				id,
				feed_id,
				date,
				row_number() OVER (PARTITION BY feed_id ORDER BY date DESC) AS rn 
			FROM feed_items
	)
	SELECT
		id FROM t
	WHERE
		rn > 20
	ORDER BY
		feed_id, rn
);

