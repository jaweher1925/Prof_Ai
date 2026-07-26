-- #40: Per-part slides in Visual Design.
--
-- Before this migration, SlideComposition had `scene_id @unique`, meaning
-- only ONE composition could ever exist per Scene. A scene whose
-- welcome/intro narrates across multiple independent segments (hook,
-- content, content, recap) already had 4 separate SceneSegment rows — and
-- Script Generation / Voice already treated + displayed those as 4 separate
-- narrated parts — but Visual Design could only ever show/edit ONE slide for
-- the whole scene (always the first segment's), because the composition
-- table had no way to have more than one row per scene.
--
-- This migration re-keys SlideComposition to be 1:1 with SceneSegment
-- instead of with Scene, so every narrated part gets its own independently
-- editable slide, matching Script Generation and Voice exactly.

-- Per-segment generated-slide preview (mirrors Scene.visualAssetUrl, scoped
-- to one segment) — plain nullable column, no rebuild needed.
ALTER TABLE "scene_segments" ADD COLUMN "visual_asset_url" TEXT;

-- RedefineTables: slide_compositions becomes segment-scoped.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_slide_compositions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scene_id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL DEFAULT 'modern',
    "layout" TEXT NOT NULL DEFAULT 'bullets',
    "cadre_style" TEXT NOT NULL DEFAULT 'none',
    "title" TEXT NOT NULL DEFAULT 'Untitled Slide',
    "subtitle" TEXT NOT NULL DEFAULT '',
    "content_blocks" TEXT NOT NULL DEFAULT '[]',
    "title_x" REAL NOT NULL DEFAULT 0,
    "title_y" REAL NOT NULL DEFAULT 0,
    "subtitle_x" REAL NOT NULL DEFAULT 0,
    "subtitle_y" REAL NOT NULL DEFAULT 0,
    "content_x" REAL NOT NULL DEFAULT 0,
    "content_y" REAL NOT NULL DEFAULT 0,
    "title_font_scale" REAL NOT NULL DEFAULT 1,
    "subtitle_font_scale" REAL NOT NULL DEFAULT 1,
    "content_font_scale" REAL NOT NULL DEFAULT 1,
    "avatar_x" REAL NOT NULL DEFAULT 75,
    "avatar_y" REAL NOT NULL DEFAULT 50,
    "avatar_width" REAL NOT NULL DEFAULT 20,
    "title_start_time" REAL NOT NULL DEFAULT 0,
    "title_duration" REAL NOT NULL DEFAULT 2,
    "subtitle_start_time" REAL NOT NULL DEFAULT 1,
    "subtitle_duration" REAL NOT NULL DEFAULT 2.5,
    "content_block_timings" TEXT NOT NULL DEFAULT '[]',
    "image_url" TEXT,
    "image_x" REAL NOT NULL DEFAULT 10,
    "image_y" REAL NOT NULL DEFAULT 70,
    "image_width" REAL NOT NULL DEFAULT 25,
    "image_height" REAL NOT NULL DEFAULT 25,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "content_edited" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "slide_compositions_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "slide_compositions_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "scene_segments" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill: every EXISTING composition was written against the scene's
-- primary (first, orderIndex 0) segment only — that's exactly what the old
-- syncCompositionToSegment always targeted — so that's the correct
-- segment_id for each pre-existing row. A scene with zero segments (should
-- not normally happen) has no valid segment to attach to, so its old
-- composition row is dropped rather than left with a null segment_id; it
-- will simply reseed the next time that segment is opened in Visual Design.
INSERT INTO "new_slide_compositions" (
  "id", "scene_id", "segment_id", "template_id", "layout", "cadre_style", "title", "subtitle",
  "content_blocks", "title_x", "title_y", "subtitle_x", "subtitle_y", "content_x", "content_y",
  "title_font_scale", "subtitle_font_scale", "content_font_scale", "avatar_x", "avatar_y", "avatar_width",
  "title_start_time", "title_duration", "subtitle_start_time", "subtitle_duration", "content_block_timings",
  "image_url", "image_x", "image_y", "image_width", "image_height", "status", "content_edited",
  "created_at", "updated_at"
)
SELECT
  sc."id", sc."scene_id",
  (SELECT ss."id" FROM "scene_segments" ss WHERE ss."scene_id" = sc."scene_id" ORDER BY ss."order_index" ASC LIMIT 1) AS "segment_id",
  sc."template_id", sc."layout", sc."cadre_style", sc."title", sc."subtitle",
  sc."content_blocks", sc."title_x", sc."title_y", sc."subtitle_x", sc."subtitle_y", sc."content_x", sc."content_y",
  sc."title_font_scale", sc."subtitle_font_scale", sc."content_font_scale", sc."avatar_x", sc."avatar_y", sc."avatar_width",
  sc."title_start_time", sc."title_duration", sc."subtitle_start_time", sc."subtitle_duration", sc."content_block_timings",
  sc."image_url", sc."image_x", sc."image_y", sc."image_width", sc."image_height", sc."status", sc."content_edited",
  sc."created_at", sc."updated_at"
FROM "slide_compositions" sc
WHERE EXISTS (SELECT 1 FROM "scene_segments" ss WHERE ss."scene_id" = sc."scene_id");

DROP TABLE "slide_compositions";
ALTER TABLE "new_slide_compositions" RENAME TO "slide_compositions";
CREATE UNIQUE INDEX "slide_compositions_segment_id_key" ON "slide_compositions"("segment_id");
CREATE INDEX "slide_compositions_scene_id_idx" ON "slide_compositions"("scene_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
