CREATE TABLE `lawyers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`email` varchar(320) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lawyers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `meetings` ADD `lawyerId` int;--> statement-breakpoint
ALTER TABLE `meetings` ADD `google_calendar_event_id` varchar(512);--> statement-breakpoint
ALTER TABLE `meetings` ADD `google_meet_link` varchar(1000);--> statement-breakpoint
ALTER TABLE `meetings` ADD `google_calendar_status` enum('NOT_CONNECTED','PENDING','SYNCED','ERROR') DEFAULT 'NOT_CONNECTED' NOT NULL;--> statement-breakpoint
ALTER TABLE `meetings` ADD `google_sync_error` text;--> statement-breakpoint
ALTER TABLE `meetings` ADD `google_invite_sent` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `meetings` ADD `google_invite_sent_at` timestamp;--> statement-breakpoint
ALTER TABLE `meetings` ADD `google_calendar_synced_at` timestamp;--> statement-breakpoint
ALTER TABLE `meetings` ADD `google_meet_created_at` timestamp;--> statement-breakpoint
ALTER TABLE `meetings` ADD `google_calendar_event_url` varchar(1000);--> statement-breakpoint
ALTER TABLE `meetings` ADD `google_calendar_event_html_link` varchar(1000);--> statement-breakpoint
CREATE INDEX `lawyers_email_idx` ON `lawyers` (`email`);--> statement-breakpoint
CREATE INDEX `lawyers_active_idx` ON `lawyers` (`active`);--> statement-breakpoint
CREATE INDEX `meetings_lawyer_idx` ON `meetings` (`lawyerId`);