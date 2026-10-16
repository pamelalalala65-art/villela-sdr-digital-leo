CREATE TABLE `meeting_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`meetingId` int NOT NULL,
	`userId` int NOT NULL,
	`action` varchar(120) NOT NULL,
	`oldValue` text,
	`newValue` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `meeting_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyName` varchar(180) NOT NULL,
	`cnpj` varchar(24) NOT NULL,
	`contactName` varchar(140) NOT NULL,
	`phone` varchar(40) NOT NULL,
	`email` varchar(320),
	`sdrId` int NOT NULL,
	`responsibleId` int NOT NULL,
	`service` varchar(160) NOT NULL,
	`date` varchar(10) NOT NULL,
	`time` time NOT NULL,
	`status` enum('AGENDADA','REALIZADA','NO_SHOW','CANCELADA','REMARCADA') NOT NULL DEFAULT 'AGENDADA',
	`notes` text,
	`result` text,
	`nextStep` text,
	`nextContactDate` varchar(10),
	`noShowReason` text,
	`wasContacted` boolean,
	`wantsReschedule` boolean,
	`cancelReason` text,
	`rescheduledDate` varchar(10),
	`rescheduledTime` time,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `meetings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','sdr','gestao','admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `active` boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `meeting_history_meeting_idx` ON `meeting_history` (`meetingId`);--> statement-breakpoint
CREATE INDEX `meeting_history_user_idx` ON `meeting_history` (`userId`);--> statement-breakpoint
CREATE INDEX `meetings_date_idx` ON `meetings` (`date`);--> statement-breakpoint
CREATE INDEX `meetings_date_status_idx` ON `meetings` (`date`,`status`);--> statement-breakpoint
CREATE INDEX `meetings_sdr_idx` ON `meetings` (`sdrId`);--> statement-breakpoint
CREATE INDEX `meetings_responsible_idx` ON `meetings` (`responsibleId`);--> statement-breakpoint
CREATE INDEX `meetings_status_idx` ON `meetings` (`status`);--> statement-breakpoint
CREATE INDEX `meetings_company_idx` ON `meetings` (`companyName`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX `users_active_idx` ON `users` (`active`);