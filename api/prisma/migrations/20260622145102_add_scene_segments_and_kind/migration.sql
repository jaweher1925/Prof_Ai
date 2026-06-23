-- CreateTable
CREATE TABLE "scene_segments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scene_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "segment_type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "slide_title" TEXT,
    "elements" TEXT NOT NULL DEFAULT '[]',
    "image_prompt" TEXT,
    "animation" TEXT,
    "tts_audio_url" TEXT,
    "duration_seconds" REAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "scene_segments_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_scenes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "module_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "scene_kind" TEXT NOT NULL DEFAULT 'content',
    "script_content" TEXT,
    "slide_deck_content" TEXT,
    "visual_prompt" TEXT,
    "visual_asset_url" TEXT,
    "text_animation_type" TEXT NOT NULL DEFAULT 'none',
    "text_cues" TEXT,
    "quiz_data" TEXT,
    "presenter_position" TEXT NOT NULL DEFAULT 'bottom-right',
    "avatar_position_x" REAL,
    "avatar_position_y" REAL,
    "tts_audio_url" TEXT,
    "avatar_video_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "duration_seconds" REAL,
    "approved_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "scenes_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_scenes" ("approved_at", "avatar_position_x", "avatar_position_y", "avatar_video_url", "created_at", "duration_seconds", "id", "module_id", "order_index", "presenter_position", "script_content", "slide_deck_content", "status", "text_animation_type", "text_cues", "tts_audio_url", "updated_at", "visual_asset_url", "visual_prompt") SELECT "approved_at", "avatar_position_x", "avatar_position_y", "avatar_video_url", "created_at", "duration_seconds", "id", "module_id", "order_index", "presenter_position", "script_content", "slide_deck_content", "status", "text_animation_type", "text_cues", "tts_audio_url", "updated_at", "visual_asset_url", "visual_prompt" FROM "scenes";
DROP TABLE "scenes";
ALTER TABLE "new_scenes" RENAME TO "scenes";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
