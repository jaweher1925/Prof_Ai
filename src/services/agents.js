/**
 * Agents service — all AI agent calls.
 * Every function here maps to a real Azure Function endpoint.
 */
import apiClient from '@/api/apiClient'

export const agentsService = {

  // ── Stage 1 → Script ──────────────────────────────────────────────────────

  /** Analyze source files and create Learning Journey module structure */
  runLibrarian: (projectId) =>
    apiClient.post('/librarianAgent', { project_id: projectId }),

  /** Generate scene-by-scene scripts for all modules */
  runScriptGenerator: (projectId, instructions) =>
    apiClient.post('/scriptGeneratorAgent', {
      project_id: projectId,
      special_instructions: instructions || undefined,
    }),

  // ── Stage 2 → Voice (Text to Audio) ──────────────────────────────────────

  /** Generate TTS audio for a single scene using Voice AI */
  runGenerateTTS: (sceneId, voiceId, overrideText, voiceSettings) =>
    apiClient.post('/generateTTS', {
      scene_id: sceneId,
      voice_id: voiceId || undefined,
      override_text: overrideText || undefined,
      voice_settings: voiceSettings || undefined,
    }),

  // ── Stage 3 → Visual (Generate Images) ───────────────────────────────────

  /** Generate Image AI background image for a single scene */
  runGenerateAsset: (sceneId) =>
    apiClient.post('/generateSceneAsset', { scene_id: sceneId }),

  // ── Storyboard ───────────────────────────────────────────────────────────────

  /** Generate storyboard (visual prompt + motion style + text cues + slide content) for a project or module */
  runStoryboard: (projectId, moduleId) =>
    apiClient.post('/storyboardAgent', {
      project_id: projectId || undefined,
      module_id: moduleId || undefined,
    }),

  // ── Stage 4 → Video (Voice to Video — expensive, last) ────────────────────

  /** Generate Video AI avatar video for a single scene */
  runHeyGenAvatar: (sceneId, avatarId, voiceId) =>
    apiClient.post('/generateHeyGenAvatar', {
      scene_id: sceneId,
      avatar_id: avatarId || undefined,
      voice_id: voiceId || undefined,
    }),

  /** Check Video AI video render status */
  pollHeyGen: (videoId, sceneId) =>
    apiClient.post('/pollHeyGenVideo', {
      video_id: videoId,
      scene_id: sceneId,
    }),

  // ── Bulk ──────────────────────────────────────────────────────────────────

  /** Trigger TTS + Visual generation for all scenes in a project/module */
  runProduceScenes: (projectId, moduleId, opts = {}) =>
    apiClient.post('/produceScenes', {
      project_id: projectId || undefined,
      module_id: moduleId || undefined,
      generate_audio: opts.audio !== false,
      generate_visual: opts.visual !== false,
    }),

  // ── Export ────────────────────────────────────────────────────────────────

  /** Export project as SCORM package */
  exportSCORM: (projectId) =>
    apiClient.post('/exportSCORM', { project_id: projectId }),
}
