CREATE TABLE `album_items` (
	`album_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`caption_ml` text,
	`caption_en` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`album_id`, `media_id`),
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `album_items_media` ON `album_items` (`media_id`);--> statement-breakpoint
CREATE TABLE `albums` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title_ml` text NOT NULL,
	`title_en` text,
	`district` text,
	`event_date` text,
	`cover_media_id` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` integer,
	`updated_by` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`district`) REFERENCES `districts`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `albums_slug` ON `albums` (`slug`);--> statement-breakpoint
CREATE INDEX `albums_district` ON `albums` (`status`,`district`,`event_date`);--> statement-breakpoint
CREATE TABLE `area_committees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`district` text NOT NULL,
	`name_ml` text NOT NULL,
	`name_en` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`district`) REFERENCES `districts`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `area_committees_district` ON `area_committees` (`district`,`sort_order`);--> statement-breakpoint
CREATE TABLE `conferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` integer NOT NULL,
	`year` integer,
	`start_date` text,
	`end_date` text,
	`place_ml` text,
	`place_en` text,
	`report_ml` text,
	`album_id` integer,
	`event_slug` text,
	`status` text DEFAULT 'published' NOT NULL,
	`updated_by` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conferences_number` ON `conferences` (`number`);--> statement-breakpoint
CREATE TABLE `district_extras` (
	`district` text PRIMARY KEY NOT NULL,
	`cover_media_id` integer,
	`updated_by` integer,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`district`) REFERENCES `districts`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`kind` text NOT NULL,
	`year` integer,
	`title_ml` text NOT NULL,
	`title_en` text,
	`summary_ml` text,
	`pdf_media_id` integer,
	`page_count` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` integer,
	`updated_by` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`pdf_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_slug` ON `documents` (`slug`);--> statement-breakpoint
CREATE INDEX `documents_pdf` ON `documents` (`pdf_media_id`);--> statement-breakpoint
CREATE TABLE `offices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`district` text,
	`area_committee_id` integer,
	`address_ml` text NOT NULL,
	`address_en` text,
	`phone` text,
	`email` text,
	`lat_e6` integer,
	`lng_e6` integer,
	`map_url` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`district`) REFERENCES `districts`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`area_committee_id`) REFERENCES `area_committees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `offices_district` ON `offices` (`district`,`sort_order`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`template` text DEFAULT 'default' NOT NULL,
	`district` text,
	`title_ml` text NOT NULL,
	`title_en` text,
	`summary_ml` text,
	`summary_en` text,
	`body_ml` text,
	`body_en` text,
	`en_source` text,
	`en_based_on` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` integer,
	`updated_by` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`district`) REFERENCES `districts`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_path` ON `pages` (`path`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_ml` text NOT NULL,
	`name_en` text DEFAULT '' NOT NULL,
	`photo_media_id` integer,
	`department` text,
	`office` text,
	`phone` text,
	`created_by` integer,
	`updated_by` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`photo_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`body` text NOT NULL,
	`district` text,
	`area_committee_id` integer,
	`role` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`term` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by` integer,
	`updated_by` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`district`) REFERENCES `districts`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`area_committee_id`) REFERENCES `area_committees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `positions_committee` ON `positions` (`body`,`district`,`area_committee_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `positions_person` ON `positions` (`person_id`);--> statement-breakpoint
CREATE TABLE `videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`youtube_id` text NOT NULL,
	`title_ml` text NOT NULL,
	`title_en` text,
	`published_at` text NOT NULL,
	`district` text,
	`hidden` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'link' NOT NULL,
	`created_by` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`district`) REFERENCES `districts`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `videos_youtube` ON `videos` (`youtube_id`);--> statement-breakpoint
CREATE INDEX `videos_date` ON `videos` (`hidden`,`published_at`);--> statement-breakpoint
CREATE INDEX `orders_pdf` ON `orders` (`pdf_media_id`);--> statement-breakpoint
CREATE INDEX `posts_cover` ON `posts` (`cover_media_id`);