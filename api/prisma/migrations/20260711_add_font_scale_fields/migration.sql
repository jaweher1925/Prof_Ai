-- Add user-adjustable font-size scale fields for title, subtitle, content
ALTER TABLE slide_compositions ADD COLUMN title_font_scale REAL NOT NULL DEFAULT 1;
ALTER TABLE slide_compositions ADD COLUMN subtitle_font_scale REAL NOT NULL DEFAULT 1;
ALTER TABLE slide_compositions ADD COLUMN content_font_scale REAL NOT NULL DEFAULT 1;
