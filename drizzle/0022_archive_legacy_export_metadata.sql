CREATE TABLE `legacy_import_metadata` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceType` varchar(40) NOT NULL,
	`sourceId` int NOT NULL,
	`payload` mediumtext NOT NULL,
	`importedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `legacy_import_metadata_id` PRIMARY KEY(`id`),
	CONSTRAINT `legacy_import_metadata_source_idx` UNIQUE(`sourceType`,`sourceId`)
);
--> statement-breakpoint
ALTER TABLE `api_integrations` MODIFY COLUMN `secretHash` varchar(64);