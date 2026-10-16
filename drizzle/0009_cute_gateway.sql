CREATE TABLE `bonus_competencies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`sectorId` int NOT NULL,
	`bonus_competency_status` enum('ABERTA','FECHADA') NOT NULL DEFAULT 'ABERTA',
	`closedAt` timestamp,
	`snapshot` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bonus_competencies_id` PRIMARY KEY(`id`),
	CONSTRAINT `bonus_competencies_monthKey_unique` UNIQUE(`monthKey`)
);
--> statement-breakpoint
ALTER TABLE `meetings` ADD `pgfnDebtOver2m` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `meetings` ADD `pgfnDebtAmount` varchar(40);--> statement-breakpoint
CREATE INDEX `bonus_competencies_status_idx` ON `bonus_competencies` (`bonus_competency_status`);