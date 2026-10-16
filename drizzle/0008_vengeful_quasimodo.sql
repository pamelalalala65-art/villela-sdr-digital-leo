CREATE TABLE `api_integration_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`integrationId` int NOT NULL,
	`method` varchar(10) NOT NULL,
	`endpoint` varchar(255) NOT NULL,
	`statusCode` int NOT NULL,
	`ip` varchar(80),
	`userAgent` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `api_integration_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `api_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`keyPrefix` varchar(24) NOT NULL,
	`secretHash` varchar(64) NOT NULL,
	`api_sector_code` enum('CONCILIE') NOT NULL DEFAULT 'CONCILIE',
	`permissions` text NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	`lastUsedAt` timestamp,
	CONSTRAINT `api_integrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_integrations_keyPrefix_unique` UNIQUE(`keyPrefix`),
	CONSTRAINT `api_integrations_secretHash_unique` UNIQUE(`secretHash`)
);
--> statement-breakpoint
CREATE INDEX `api_logs_integration_idx` ON `api_integration_logs` (`integrationId`);--> statement-breakpoint
CREATE INDEX `api_logs_created_idx` ON `api_integration_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `api_integrations_active_idx` ON `api_integrations` (`active`);