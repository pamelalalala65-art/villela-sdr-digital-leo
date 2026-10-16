UPDATE `meetings` SET `status` = 'AGENDADA' WHERE `status` = 'REMARCADA';--> statement-breakpoint
ALTER TABLE `meetings` MODIFY COLUMN `status` enum('AGENDADA','REALIZADA','NO_SHOW','CANCELADA') NOT NULL DEFAULT 'AGENDADA';
