DROP TABLE `lawyers`;--> statement-breakpoint
ALTER TABLE `meetings` RENAME COLUMN `lawyerId` TO `lawyer_email`;--> statement-breakpoint
DROP INDEX `meetings_lawyer_idx` ON `meetings`;--> statement-breakpoint
ALTER TABLE `meetings` MODIFY COLUMN `lawyer_email` varchar(320);