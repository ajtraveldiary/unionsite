CREATE TABLE `districts` (
	`slug` text PRIMARY KEY NOT NULL,
	`name_ml` text NOT NULL,
	`name_en` text NOT NULL,
	`hq_ml` text NOT NULL,
	`hq_en` text NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `magazine_issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`cover_media_id` integer,
	`pdf_media_id` integer,
	`page_count` integer,
	`legacy_url` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pdf_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issues_month` ON `magazine_issues` (`year`,`month`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`r2_key` text,
	`source_url` text,
	`srcset` text,
	`bytes` integer,
	`width` integer,
	`height` integer,
	`alt_ml` text,
	`alt_en` text,
	`focal_x` integer,
	`focal_y` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_subjects` (
	`slug` text PRIMARY KEY NOT NULL,
	`order_group` text NOT NULL,
	`name_ml` text NOT NULL,
	`name_en` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`go_number` text DEFAULT '' NOT NULL,
	`go_date` text NOT NULL,
	`date_is_upload` integer DEFAULT false NOT NULL,
	`department` text,
	`order_group` text NOT NULL,
	`subject` text NOT NULL,
	`title_ml` text NOT NULL,
	`title_en` text NOT NULL,
	`summary_ml` text,
	`summary_en` text,
	`is_important` integer DEFAULT false NOT NULL,
	`pdf_media_id` integer,
	`page_count` integer,
	`pdf_text` text,
	`status` text DEFAULT 'published' NOT NULL,
	`legacy_url` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`subject`) REFERENCES `order_subjects`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pdf_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `orders_date` ON `orders` (`status`,`go_date`);--> statement-breakpoint
CREATE INDEX `orders_subject` ON `orders` (`status`,`subject`,`go_date`);--> statement-breakpoint
CREATE INDEX `orders_group` ON `orders` (`status`,`order_group`,`go_date`);--> statement-breakpoint
CREATE TABLE `post_translations` (
	`post_id` integer NOT NULL,
	`lang` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body` text,
	`source` text DEFAULT 'human' NOT NULL,
	`reviewed_at` text,
	PRIMARY KEY(`post_id`, `lang`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`topic` text NOT NULL,
	`district` text,
	`status` text DEFAULT 'published' NOT NULL,
	`published_at` text NOT NULL,
	`cover_media_id` integer,
	`featured_on_home` integer DEFAULT false NOT NULL,
	`legacy_url` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`topic`) REFERENCES `topics`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`district`) REFERENCES `districts`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `posts_published` ON `posts` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `posts_topic` ON `posts` (`status`,`topic`,`published_at`);--> statement-breakpoint
CREATE INDEX `posts_district` ON `posts` (`status`,`district`,`published_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug` ON `posts` (`slug`,`published_at`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`slug` text PRIMARY KEY NOT NULL,
	`name_ml` text NOT NULL,
	`name_en` text NOT NULL
);
