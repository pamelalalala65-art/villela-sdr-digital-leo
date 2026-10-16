ALTER TABLE `meetings` ADD `closer` text;--> statement-breakpoint
ALTER TABLE `meetings` ADD `client_status` enum('QUENTE','MÉDIA','FRIA');