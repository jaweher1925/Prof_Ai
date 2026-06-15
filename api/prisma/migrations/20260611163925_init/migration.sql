-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "hilt_gates" TEXT,
    "default_avatar_id" TEXT,
    "default_voice_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "modules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "order_index" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "modules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "module_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "script_content" TEXT,
    "slide_deck_content" TEXT,
    "visual_prompt" TEXT,
    "visual_asset_url" TEXT,
    "text_animation_type" TEXT NOT NULL DEFAULT 'none',
    "text_cues" TEXT,
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

-- CreateTable
CREATE TABLE "scripts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "module_id" TEXT,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "learning_objectives" TEXT NOT NULL DEFAULT '[]',
    "sections" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'review',
    "estimated_duration_minutes" REAL NOT NULL DEFAULT 4.0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "scripts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scripts_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "source_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "source_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
