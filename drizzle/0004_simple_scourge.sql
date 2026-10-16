ALTER TABLE `meeting_history` MODIFY COLUMN `sectorId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `meetings` MODIFY COLUMN `sectorId` int NOT NULL;