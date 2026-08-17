-- AlterTable
-- Persists each SceneSegment's own individually-rendered avatar clip.
-- Previously a per-segment render (Final Video's per-segment tiles, Visual
-- Designer's per-row preview) never saved anywhere — this column is what
-- heygenFinalize.ts's stitchSceneFromSegments() writes to on completion,
-- then reads back from every sibling segment to know when the whole scene
-- is ready to be stitched into Scene.avatar_video_url automatically.
ALTER TABLE "scene_segments" ADD COLUMN "avatar_video_url" TEXT;
