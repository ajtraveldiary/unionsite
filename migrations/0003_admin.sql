CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer,
	`district` text,
	`summary` text,
	`diff` text,
	`at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_at` ON `audit_log` (`at`);--> statement-breakpoint
CREATE INDEX `audit_district` ON `audit_log` (`district`,`at`);--> statement-breakpoint
CREATE INDEX `audit_item` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE TABLE `edit_locks` (
	`entity` text NOT NULL,
	`entity_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	PRIMARY KEY(`entity`, `entity_id`)
);
--> statement-breakpoint
CREATE TABLE `post_drafts` (
	`post_id` integer PRIMARY KEY NOT NULL,
	`doc` text NOT NULL,
	`updated_by` integer,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer NOT NULL,
	`doc` text NOT NULL,
	`note` text NOT NULL,
	`user_id` integer,
	`at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `revisions_item` ON `revisions` (`entity`,`entity_id`,`at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`role` text NOT NULL,
	`district` text,
	`active` integer DEFAULT true NOT NULL,
	`last_login_at` text,
	`invited_by` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`district`) REFERENCES `districts`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `media` ADD `sha256` text;--> statement-breakpoint
ALTER TABLE `media` ADD `uploaded_by` integer;--> statement-breakpoint
CREATE INDEX `media_sha` ON `media` (`sha256`);--> statement-breakpoint
CREATE INDEX `media_kind` ON `media` (`kind`,`id`);--> statement-breakpoint
ALTER TABLE `post_translations` ADD `reviewed_by` integer;--> statement-breakpoint
ALTER TABLE `post_translations` ADD `text_hash` text;--> statement-breakpoint
ALTER TABLE `post_translations` ADD `based_on` text;--> statement-breakpoint
CREATE INDEX `post_translations_source` ON `post_translations` (`lang`,`source`);--> statement-breakpoint
ALTER TABLE `posts` ADD `event_slug` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `home_requested_by` integer;--> statement-breakpoint
ALTER TABLE `posts` ADD `home_requested_at` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `created_by` integer;--> statement-breakpoint
ALTER TABLE `posts` ADD `updated_by` integer;--> statement-breakpoint
CREATE INDEX `posts_updated` ON `posts` (`updated_at`);--> statement-breakpoint
CREATE INDEX `posts_district_updated` ON `posts` (`district`,`updated_at`);