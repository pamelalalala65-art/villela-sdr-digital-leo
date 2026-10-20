ALTER TABLE `sectors` MODIFY COLUMN `code` enum('PROJURIS_2','CONCILIE','TRAFEGO_PAGO') NOT NULL;--> statement-breakpoint
ALTER TABLE `meetings` ADD `lead_channel` varchar(80);--> statement-breakpoint
ALTER TABLE `meetings` ADD `lead_channel_other` varchar(160);--> statement-breakpoint
ALTER TABLE `meetings` ADD `ad_platform` varchar(80);--> statement-breakpoint
ALTER TABLE `meetings` ADD `campaign_name` varchar(180);--> statement-breakpoint
ALTER TABLE `meetings` ADD `campaign_id` varchar(120);--> statement-breakpoint
ALTER TABLE `meetings` ADD `ad_set_name` varchar(180);--> statement-breakpoint
ALTER TABLE `meetings` ADD `ad_set_id` varchar(120);--> statement-breakpoint
ALTER TABLE `meetings` ADD `ad_name` varchar(180);--> statement-breakpoint
ALTER TABLE `meetings` ADD `ad_id` varchar(120);--> statement-breakpoint
ALTER TABLE `meetings` ADD `contact_origin` varchar(100);--> statement-breakpoint
ALTER TABLE `meetings` ADD `contact_origin_other` varchar(160);--> statement-breakpoint
ALTER TABLE `meetings` ADD `utm_source` varchar(180);--> statement-breakpoint
ALTER TABLE `meetings` ADD `utm_medium` varchar(180);--> statement-breakpoint
ALTER TABLE `meetings` ADD `utm_campaign` varchar(180);--> statement-breakpoint
ALTER TABLE `meetings` ADD `utm_content` varchar(180);--> statement-breakpoint
ALTER TABLE `meetings` ADD `utm_term` varchar(180);--> statement-breakpoint
ALTER TABLE `meetings` ADD `lead_entry_date` varchar(10);--> statement-breakpoint
ALTER TABLE `meetings` ADD `qualification_status` varchar(30) DEFAULT 'NAO_AVALIADO';--> statement-breakpoint
ALTER TABLE `meetings` ADD `disqualification_reason` varchar(120);--> statement-breakpoint
ALTER TABLE `meetings` ADD `disqualification_other` varchar(180);--> statement-breakpoint
INSERT INTO `sectors` (`code`, `name`, `active`) VALUES ('TRAFEGO_PAGO', 'TRÁFEGO PAGO', 1) ON DUPLICATE KEY UPDATE `name` = 'TRÁFEGO PAGO', `active` = 1;
