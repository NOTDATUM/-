CREATE TABLE `admin_audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor` text DEFAULT 'staff' NOT NULL,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`details` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `trades` ADD `canceled_at` text;