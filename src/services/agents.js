/**
 * Agents service — all AI agent calls.
 * Every function here maps to a real Azure Function endpoint.
 */
import apiClient from '@/api/apiClient'

export const agentsService = {

  // Stage 1: Script

  /** Analyze source files and create Learning Journey module structure */
  runLibrarian: (projectId) =>
    apiClient.post('/librarianAgent', { project_id: projectId }),

  /** Generate scene-by-scene scripts for all modules */
  runScriptGenerator: (projectId, instructions) =>
    apiClient.post('/scriptGeneratorAgent', {
      project_id: projectId,
      special_instructions: instructions || undefined,
    }),

  // Stage 2: Voice (Text to Audio)

  /** Generate TTS audio for a single scene using Voice AI.
   *  Pass segmentId to regenerate just one segment of a multi-segment scene
   *  instead of every segment on the scene. Ignored for segment-less scenes. */
  runGenerateTTS: (sceneId, voiceId, overrideText, voiceSettings, segmentId) =>
    apiClient.post('/generateTTS', {
      scene_id: sceneId,
      voice_id: voiceId || undefined,
      override_text: overrideText || undefined,
      voice_settings: voiceSettings || undefined,
      segment_id: segmentId || undefined,
    }),

  /** Edit one scene segment's narration text / slide title / elements.
   *  Clears that segment's stale tts_audio_url server-side so the UI knows
   *  to prompt a voice regenerate before the next render. */
  updateSceneSegment: (segmentId, fields) =>
    apiClient.patch(`/sceneSegments/${segmentId}`, fields),

  /** Generate a short TTS sample without changing any scene */
  runPreviewTTS: (voiceId, text, voiceSettings) =>
    apiClient.post('/previewTTS', {
      voice_id: voiceId || undefined,
      text,
      voice_settings: voiceSettings || undefined,
    }),

  // Stage 3: Visual (Generate Images)

  /** Generate Image AI background image for a single scene */
  runGenerateAsset: (sceneId) =>
    apiClient.post('/generateSceneAsset', { scene_id: sceneId }),

  // Storyboard

  /** Generate storyboard data for a project or module */
  runStoryboard: (projectId, moduleId) =>
    apiClient.post('/storyboardAgent', {
      project_id: projectId || undefined,
      module_id: moduleId || undefined,
    }),

  // Stage 4: Video (Voice to Video)

  /** Generate Video AI avatar video for a single scene.
   *  Pass useAvatar=false to render voice-only (no HeyGen call, no avatar). */
  runHeyGenAvatar: (sceneId, avatarId, voiceId, useAvatar = true) =>
    apiClient.post('/generateHeyGenAvatar', {
      scene_id: sceneId,
      avatar_id: avatarId || undefined,
      voice_id: voiceId || undefined,
      use_avatar: useAvatar,
    }),

  /** Check Video AI video render status */
  pollHeyGen: (videoId, sceneId) =>
    apiClient.post('/pollHeyGenVideo', {
      video_id: videoId,
      scene_id: sceneId,
    }),

  /** Concatenate every scene video in a module into one full module video */
  runMergeModuleVideo: (moduleId) =>
    apiClient.post('/mergeModuleVideo', { module_id: moduleId }),

  // Bulk

  /** Trigger TTS + Visual generation for all scenes in a project/module */
  runProduceScenes: (projectId, moduleId, opts = {}) =>
    apiClient.post('/produceScenes', {
      project_id: projectId || undefined,
      module_id: moduleId || undefined,
      generate_audio: opts.audio !== false,
      generate_visual: opts.visual !== false,
    }),

  // Export

  /** Export project as SCORM package */
  exportSCORM: (projectId) =>
    apiClient.post('/exportSCORM', { project_id: projectId }),
}
