CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title_ml` text NOT NULL,
	`title_en` text,
	`venue_ml` text NOT NULL,
	`venue_en` text,
	`description_ml` text,
	`description_en` text,
	`en_source` text,
	`start_at` text NOT NULL,
	`end_at` text,
	`district` text,
	`map_url` text,
	`registration_url` text,
	`report_post_id` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`sample` integer DEFAULT false NOT NULL,
	`created_by` integer,
	`updated_by` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`district`) REFERENCES `districts`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`report_post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug` ON `events` (`slug`);--> statement-breakpoint
CREATE INDEX `events_start` ON `events` (`status`,`start_at`);--> statement-breakpoint
CREATE INDEX `events_district` ON `events` (`status`,`district`,`start_at`);--> statement-breakpoint
ALTER TABLE `magazine_issues` ADD `status` text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE `magazine_issues` ADD `toc` text;--> statement-breakpoint
ALTER TABLE `magazine_issues` ADD `created_by` integer;--> statement-breakpoint
ALTER TABLE `magazine_issues` ADD `updated_by` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `created_by` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `updated_by` integer;--> statement-breakpoint
CREATE INDEX `orders_go` ON `orders` (`go_number`);