-- Full-text index for search (plan, section 11), written by hand: Drizzle can't describe FTS5
-- virtual tables. The trigram tokenizer matches any part of a word, which suits Malayalam (no
-- stemmer needed) and GO numbers. The rowid is search_docs.id; the text is normalised first
-- (normalise() in src/lib/search.ts), so the index and the queries agree.
CREATE VIRTUAL TABLE `search_fts` USING fts5(title, kw, body, tokenize = 'trigram');
