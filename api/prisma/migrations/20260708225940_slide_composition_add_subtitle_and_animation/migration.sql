-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_slide_compositions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scene_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL DEFAULT 'modern',
    "title" TEXT NOT NULL DEFAULT 'Untitled Slide',
    "subtitle" TEXT NOT NULL DEFAULT '',
    "content_blocks" TEXT NOT NULL DEFAULT '[]',
    "avatar_x" REAL NOT NULL DEFAULT 75,
    "avatar_y" REAL NOT NULL DEFAULT 50,
    "avatar_width" REAL NOT NULL DEFAULT 20,
    "image_url" TEXT,
    "image_x" REAL NOT NULL DEFAULT 10,
    "image_y" REAL NOT NULL DEFAULT 70,
    "image_width" REAL NOT NULL DEFAULT 25,
    "image_height" REAL NOT NULL DEFAULT 25,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "content_edited" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "slide_compositions_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_slide_compositions" ("avatar_width", "avatar_x", "avatar_y", "content_blocks", "content_edited", "created_at", "id", "image_height", "image_url", "image_width", "image_x", "image_y", "scene_id", "status", "template_id", "title", "updated_at") SELECT "avatar_width", "avatar_x", "avatar_y", "content_blocks", "content_edited", "created_at", "id", "image_height", "image_url", "image_width", "image_x", "image_y", "scene_id", "status", "template_id", "title", "updated_at" FROM "slide_compositions";
DROP TABLE "slide_compositions";
ALTER TABLE "new_slide_compositions" RENAME TO "slide_compositions";
CREATE UNIQUE INDEX "slide_compositions_scene_id_key" ON "slide_compositions"("scene_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
