CREATE TABLE `lawyer_google_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lawyerId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`lawyer_google_invite_status` enum('PENDING','USED','EXPIRED','ERROR') NOT NULL DEFAULT 'PENDING',
	`expiresAt` timestamp NOT NULL,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`usedAt` timestamp,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lawyer_google_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `lawyer_google_invites_token_idx` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE INDEX `lawyer_google_invites_lawyer_idx` ON `lawyer_google_invites` (`lawyerId`);--> statement-breakpoint
CREATE INDEX `lawyer_google_invites_status_idx` ON `lawyer_google_invites` (`lawyer_google_invite_status`);