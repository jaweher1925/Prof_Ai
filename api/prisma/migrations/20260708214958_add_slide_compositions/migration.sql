-- CreateTable
CREATE TABLE "slide_compositions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scene_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL DEFAULT 'modern',
    "title" TEXT NOT NULL DEFAULT 'Untitled Slide',
    "main_point" TEXT NOT NULL DEFAULT '',
    "key_points" TEXT NOT NULL DEFAULT '[]',
    "avatar_x" REAL NOT NULL DEFAULT 75,
    "avatar_y" REAL NOT NULL DEFAULT 50,
    "avatar_width" REAL NOT NULL DEFAULT 20,
    "image_url" TEXT,
    "image_x" REAL NOT NULL DEFAULT 10,
    "image_y" REAL NOT NULL DEFAULT 70,
    "image_width" REAL NOT NULL DEFAULT 25,
    "image_height" REAL NOT NULL DEFAULT 25,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "slide_compositions_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "slide_compositions_scene_id_key" ON "slide_compositions"("scene_id");
