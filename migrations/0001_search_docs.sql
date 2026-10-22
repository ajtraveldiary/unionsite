CREATE TABLE `search_docs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`ref` integer NOT NULL,
	`ml` text NOT NULL,
	`en` text,
	`sub` text,
	`url` text NOT NULL,
	`kw` text,
	`important` integer DEFAULT false NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_docs_item` ON `search_docs` (`kind`,`ref`);