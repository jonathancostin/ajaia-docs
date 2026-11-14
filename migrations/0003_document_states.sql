CREATE TABLE `document_states` (
	`document_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`state` blob NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
