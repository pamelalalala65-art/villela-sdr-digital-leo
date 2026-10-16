ALTER TABLE `meetings` ADD `closed_contract` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `meetings` ADD `closed_contract_value` varchar(60);--> statement-breakpoint
ALTER TABLE `meetings` ADD `contract_installments` int;--> statement-breakpoint
ALTER TABLE `meetings` ADD `contract_lawyer` varchar(160);