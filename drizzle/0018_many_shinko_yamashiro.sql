CREATE TABLE `gmail_sender_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`googleAccountEmail` varchar(320) NOT NULL,
	`refreshTokenCiphertext` mediumtext NOT NULL,
	`accessTokenCiphertext` mediumtext,
	`accessTokenExpiresAt` timestamp,
	`scope` varchar(1000) NOT NULL,
	`gmail_sender_status` enum('CONNECTED','ERROR') NOT NULL DEFAULT 'CONNECTED',
	`lastError` text,
	`connectedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gmail_sender_connections_id` PRIMARY KEY(`id`)
);
