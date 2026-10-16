CREATE TABLE `lawyer_google_calendar_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lawyerId` int NOT NULL,
	`googleAccountEmail` varchar(320) NOT NULL,
	`refreshTokenCiphertext` mediumtext NOT NULL,
	`accessTokenCiphertext` mediumtext,
	`accessTokenExpiresAt` timestamp,
	`scope` varchar(1000) NOT NULL,
	`lawyer_connection_status` enum('NOT_CONNECTED','PENDING','CONNECTED','ERROR') NOT NULL DEFAULT 'CONNECTED',
	`lastError` text,
	`lastConnectedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lawyer_google_calendar_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `lawyer_google_calendar_connections_lawyer_idx` UNIQUE(`lawyerId`)
);
--> statement-breakpoint
CREATE TABLE `lawyers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`email` varchar(320) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lawyers_id` PRIMARY KEY(`id`),
	CONSTRAINT `lawyers_email_idx` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `meetings` ADD `lawyer_id` int;--> statement-breakpoint
ALTER TABLE `meetings` ADD `calendar_owner` enum('SDR','LAWYER') DEFAULT 'SDR' NOT NULL;--> statement-breakpoint
CREATE INDEX `lawyers_active_idx` ON `lawyers` (`active`);