CREATE TABLE `sectors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` enum('PROJURIS_2','CONCILIE') NOT NULL,
	`name` varchar(120) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sectors_id` PRIMARY KEY(`id`),
	CONSTRAINT `sectors_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `user_sectors` (
	`userId` int NOT NULL,
	`sectorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_sectors_userId_sectorId_pk` PRIMARY KEY(`userId`,`sectorId`)
);
--> statement-breakpoint
ALTER TABLE `meeting_history` ADD `sectorId` int;--> statement-breakpoint
ALTER TABLE `meetings` ADD `sectorId` int;--> statement-breakpoint
CREATE INDEX `user_sectors_sector_idx` ON `user_sectors` (`sectorId`);--> statement-breakpoint
INSERT INTO `sectors` (`code`, `name`, `active`) VALUES ('PROJURIS_2', 'PROJURIS 2.0', true), ('CONCILIE', 'CONCILIE', true) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `active` = true;--> statement-breakpoint
INSERT IGNORE INTO `user_sectors` (`userId`, `sectorId`) SELECT `id`, (SELECT `id` FROM `sectors` WHERE `code` = 'PROJURIS_2') FROM `users`;--> statement-breakpoint
UPDATE `meetings` SET `sectorId` = (SELECT `id` FROM `sectors` WHERE `code` = 'PROJURIS_2') WHERE `sectorId` IS NULL;--> statement-breakpoint
UPDATE `meeting_history` SET `sectorId` = (SELECT `id` FROM `sectors` WHERE `code` = 'PROJURIS_2') WHERE `sectorId` IS NULL;
