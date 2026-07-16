-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_scripts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "module_id" TEXT,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "learning_objectives" TEXT NOT NULL DEFAULT '[]',
    "sections" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'review',
    "estimated_duration_minutes" REAL NOT NULL DEFAULT 4.0,
    "approval_status" TEXT NOT NULL DEFAULT 'draft',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" DATETIME,
    "locked_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "scripts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scripts_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_scripts" ("created_at", "estimated_duration_minutes", "id", "learning_objectives", "module_id", "project_id", "sections", "status", "title", "updated_at", "version") SELECT "created_at", "estimated_duration_minutes", "id", "learning_objectives", "module_id", "project_id", "sections", "status", "title", "updated_at", "version" FROM "scripts";
DROP TABLE "scripts";
ALTER TABLE "new_scripts" RENAME TO "scripts";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
