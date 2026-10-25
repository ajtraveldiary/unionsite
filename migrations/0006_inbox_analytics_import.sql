CREATE TABLE `analytics_raw` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`type` text NOT NULL,
	`path` text NOT NULL,
	`visitor` text NOT NULL,
	`source` text,
	`device` text,
	`lang` text,
	`country` text,
	`region` text,
	`detail` text,
	`value` integer
);
--> statement-breakpoint
CREATE INDEX `analytics_raw_at` ON `analytics_raw` (`at`);--> statement-breakpoint
CREATE TABLE `contact_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`district` text,
	`topic` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`assigned_to` integer,
	`note` text,
	`sender_hash` text,
	`done_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`district`) REFERENCES `districts`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `messages_status` ON `contact_messages` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_district` ON `contact_messages` (`district`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_sender` ON `contact_messages` (`sender_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `content_views_daily` (
	`date` text NOT NULL,
	`path` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`visitors` integer DEFAULT 0 NOT NULL,
	`reads` integer DEFAULT 0 NOT NULL,
	`opens` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`date`, `path`)
);
--> statement-breakpoint
CREATE INDEX `content_daily_path` ON `content_views_daily` (`path`,`date`);--> statement-breakpoint
CREATE TABLE `glossary` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ml` text NOT NULL,
	`en` text NOT NULL,
	`note` text,
	`updated_by` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `glossary_ml` ON `glossary` (`ml`);--> statement-breakpoint
CREATE TABLE `import_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`file_name` text,
	`counts` text,
	`log` text,
	`started_by` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `search_terms_daily` (
	`date` text NOT NULL,
	`term` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`zero` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`date`, `term`)
);
--> statement-breakpoint
CREATE TABLE `site_stats_daily` (
	`date` text PRIMARY KEY NOT NULL,
	`visitors` integer DEFAULT 0 NOT NULL,
	`pageviews` integer DEFAULT 0 NOT NULL,
	`devices` text,
	`sources` text,
	`langs` text,
	`regions` text,
	`not_found` text
);
