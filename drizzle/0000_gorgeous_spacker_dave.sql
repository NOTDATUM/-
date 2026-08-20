CREATE TABLE `game_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`round` integer DEFAULT 0 NOT NULL,
	`started` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `holdings` (
	`team_id` integer NOT NULL,
	`ticker` text NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`team_id`, `ticker`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`team_id` integer PRIMARY KEY NOT NULL,
	`seed_money` integer DEFAULT 1000 NOT NULL,
	`cash` integer DEFAULT 1000 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`ticker` text NOT NULL,
	`action` text NOT NULL,
	`quantity` integer NOT NULL,
	`price` integer NOT NULL,
	`round` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
