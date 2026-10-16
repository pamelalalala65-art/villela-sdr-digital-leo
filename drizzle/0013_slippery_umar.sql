CREATE TABLE `google_calendar_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`googleAccountEmail` varchar(320) NOT NULL,
	`refreshTokenCiphertext` mediumtext NOT NULL,
	`accessTokenCiphertext` mediumtext,
	`accessTokenExpiresAt` timestamp,
	`scope` varchar(1000) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `google_calendar_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `google_calendar_connections_user_idx` UNIQUE(`userId`)
);
