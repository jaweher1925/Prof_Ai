# Phase 3: Voice Generation - Getting Started

**Status**: Ready for Implementation  
**Depends On**: Phase 2 (Script Generation) - COMPLETE ✅  
**Estimated Duration**: 2-3 sprints  

---

## Overview

Phase 3 is the second HITL checkpoint. Once all scripts are locked and frozen in Phase 2, users proceed to voice generation:

1. **TTS Generation**: Convert locked script text to audio (via ElevenLabs or similar)
2. **Voice Approval**: Listen to generated audio
3. **Voice Editing** (Optional): Adjust pronunciation, pacing, tone
4. **Voice Locking**: Freeze audio before visual generation

---

## Prerequisites for Phase 3

### What Must Be Complete Before Starting Phase 3

✅ **Phase 2 Complete:**
- All scripts generated (6 scenes per module)
- All scripts reviewed and edited
- All scripts APPROVED
- All scripts LOCKED

✅ **Database Ready:**
- Script records with `approvalStatus === 'locked'`
- All script scenes populated with `script_content` (voice script)
- Module references intact

✅ **API Ready:**
- `/api/scripts/{id}` returns script with locked status
- `/api/projects/{projectId}/scripts` returns all scripts

✅ **Frontend Ready:**
- ProjectWorkspace shows Phase 3 (Voice) stage
- VoicePanel component created

---

## Phase 3 Architecture

### Data Model (New Fields)

```sql
-- Add to scripts table:
voice_status      VARCHAR(50) DEFAULT 'pending'    -- pending|generating|ready|approved|locked
voice_url         VARCHAR(255) NULL                -- S3/Azure URL to full module audio
voice_locked      BOOLEAN DEFAULT FALSE
voice_locked_at   TIMESTAMP NULL
voice_locked_by   VARCHAR(255) NULL

-- Add new table: scene_voices
CREATE TABLE scene_voices (
  id                VARCHAR(36) PRIMARY KEY,
  scene_id          VARCHAR(36) NOT NULL,
  script_id         VARCHAR(36) NOT NULL,
  segment_index     INT NOT NULL,                  -- Which segment in the scene
  tts_audio_url     VARCHAR(255) NOT NULL,         -- Individual segment audio
  tts_provider      VARCHAR(50) DEFAULT 'elevenlabs',
  tts_model         VARCHAR(50) DEFAULT 'eleven_multilingual_v2',
  voice_settings    JSON,                          -- {voiceId, stability, similarity_boost, style}
  duration_seconds  FLOAT,
  status            VARCHAR(50) DEFAULT 'pending', -- pending|generated|approved|locked
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP ON UPDATE,
  
  FOREIGN KEY (scene_id) REFERENCES scenes(id),
  FOREIGN KEY (script_id) REFERENCES scripts(id)
);
```

### API Endpoints to Create

#### Get Script Voice Status
```
GET /api/scripts/{id}?include=voice
```

Response:
```json
{
  "id": "script-uuid",
  "approvalStatus": "locked",
  "voiceStatus": "pending|generating|ready|approved|locked",
  "voiceUrl": "https://storage.azure.com/voice-module-uuid.mp3",
  "voiceLocked": false,
  "voiceLockedAt": null,
  "voiceLockedBy": null,
  "scenes": [
    {
      "id": "scene-uuid",
      "scriptContent": "Narration text...",
      "sceneVoice": {
        "id": "voice-uuid",
        "ttsAudioUrl": "https://storage.azure.com/voice-segment-uuid.mp3",
        "status": "pending|generated|approved|locked"
      }
    }
  ]
}
```

#### Generate Voice (TTS)
```
POST /api/scripts/{id}/generate-voice
Body: {
  "voiceId": "eleven_labs_voice_id",
  "voiceSettings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.0
  }
}
```

Response:
```json
{
  "id": "script-uuid",
  "voiceStatus": "generating",
  "message": "Voice generation started. Check back in 30 seconds."
}
```

#### Get Voice Generation Status
```
GET /api/scripts/{id}/voice-status
```

Response:
```json
{
  "scriptId": "script-uuid",
  "voiceStatus": "generating|ready|error",
  "progress": 75,  // percentage
  "voiceUrl": "https://storage.azure.com/voice-module-uuid.mp3",
  "error": null
}
```

#### Approve Voice
```
PATCH /api/scripts/{id}/voice
Body: { "voiceStatus": "approved" }
```

#### Lock Voice
```
PATCH /api/scripts/{id}/voice
Body: { "voiceStatus": "locked" }
```

---

## Frontend Implementation (VoicePanel.jsx)

### Component Structure

```jsx
export default function VoicePanel({ project, onUpdate, onContinue }) {
  // State: voiceSettings, generatingScripts, etc.
  // Query: Get scripts with voice status
  // Mutations: Generate voice, approve, lock
  
  return (
    <div>
      {/* Phase 3 Header */}
      {/* Voice Settings */}
      {/* Script List with Voice Status */}
      {/* Generate Voice Button */}
      {/* Voice Approval Workflow */}
      {/* Lock Voice Button */}
      {/* All Locked Banner + Continue Button */}
    </div>
  )
}
```

### State Management

```javascript
const [voiceSettings, setVoiceSettings] = useState({
  voiceId: 'default-voice-id',
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0
})

const [generatingVoice, setGeneratingVoice] = useState(false)
const [voiceError, setVoiceError] = useState(null)

const generateVoiceMutation = useMutation({
  mutationFn: (scriptId) => voiceService.generate(scriptId, voiceSettings),
  onSuccess: () => { /* refetch scripts */ }
})

const approveMutation = useMutation({
  mutationFn: (scriptId) => voiceService.approve(scriptId),
  onSuccess: () => { /* refetch */ }
})

const lockMutation = useMutation({
  mutationFn: (scriptId) => voiceService.lock(scriptId),
  onSuccess: () => { /* refetch */ }
})
```

### UI Workflow

```
Phase 3: Voice Generation
├─ Voice Settings
│  └─ Select voice (ElevenLabs dropdown)
│  └─ Adjust settings (stability, similarity, style sliders)
│
├─ Script List
│  ├─ Script 1 (Module 1)
│  │  ├─ Status: Pending generation
│  │  ├─ [Generate Voice] button
│  │  └─ (or) Audio player + [Approve] + [Lock] buttons
│  │
│  ├─ Script 2 (Module 2)
│  │  └─ ...
│  │
│  └─ Script 3 (Module 3)
│     └─ ...
│
├─ All Locked Banner (when all voice locked)
│  └─ [Continue to Visual Design →]
│
└─ Completion indicator
```

---

## Audio Integration

### Audio Player Component

```jsx
<audio controls className="w-full">
  <source src={sceneVoice.ttsAudioUrl} type="audio/mpeg" />
  Your browser does not support the audio element.
</audio>
```

### Features
- Play/pause controls
- Current time display
- Progress bar
- Volume control
- Download option (optional)

---

## Voice Generation Service (elevenlabs.ts or similar)

### Generate TTS for Scene

```typescript
export async function generateTTS(
  text: string,
  voiceId: string,
  settings: VoiceSettings
): Promise<{ audioUrl: string; durationSeconds: number }> {
  // Call ElevenLabs API
  // Upload audio to Azure Storage
  // Return URL and duration
}
```

### Batch TTS Generation

```typescript
export async function generateScriptVoice(
  script: Script,
  voiceId: string,
  settings: VoiceSettings
): Promise<{ voiceUrl: string; sceneAudios: SceneVoice[] }> {
  // Get all scenes from script
  // Generate TTS for each scene/segment
  // Merge audio clips into one module audio
  // Return module voice URL and scene voice URLs
}
```

---

## Backend Implementation (voiceGeneration.ts)

### Generate Voice Function

```typescript
app.http('generateScriptVoice', {
  methods: ['POST'],
  route: 'scripts/{id}/generate-voice',
  handler: async (req: HttpRequest, ctx: InvocationContext) => {
    const { id } = req.params
    const { voiceId, voiceSettings } = await req.json()
    
    // 1. Get script (must be locked)
    const script = await prisma.script.findUnique({ where: { id } })
    if (!script.locked) {
      return { status: 400, jsonBody: { error: 'Script must be locked first' } }
    }
    
    // 2. Generate TTS for each scene
    const scenes = await prisma.scene.findMany({
      where: { scenes: { module_id: script.module_id } }
    })
    
    for (const scene of scenes) {
      const audio = await generateTTS(scene.script_content, voiceId, voiceSettings)
      await prisma.sceneVoice.create({
        data: {
          scene_id: scene.id,
          script_id: script.id,
          tts_audio_url: audio.audioUrl,
          duration_seconds: audio.durationSeconds
        }
      })
    }
    
    // 3. Merge scene audios into module audio
    const moduleAudio = await mergeAudios(sceneAudios)
    
    // 4. Update script
    const updated = await prisma.script.update({
      where: { id },
      data: {
        voice_url: moduleAudio.url,
        voice_status: 'ready'
      }
    })
    
    return { status: 200, jsonBody: updated }
  }
})
```

---

## Testing Checklist for Phase 3

- [ ] Generate voice for single script
- [ ] View generated audio
- [ ] Listen to audio in player
- [ ] Approve voice
- [ ] Lock voice
- [ ] Multiple scripts: generate all
- [ ] Multiple scripts: approve individually
- [ ] Multiple scripts: lock individually
- [ ] All locked banner appears
- [ ] Continue to Visual Design works
- [ ] Error handling works
- [ ] Voice settings saved/applied

---

## Integration Points

### With Phase 2
- Consumes locked scripts from Phase 2
- Uses `script.sections` to extract voice text
- Only processes scripts with `approvalStatus === 'locked'`

### With Phase 4 (Visual Design)
- Passes voice URLs to visual designer
- Voice duration used for timing calculations
- Voice locked state enables visual design

### With Project Model
- Updates project status as voices complete
- Tracks voice generation progress

---

## Success Criteria for Phase 3

✅ **When Phase 3 is Complete:**
1. All scripts have generated voice audio
2. User can listen to each scene's audio
3. Voice can be approved
4. Voice can be locked (frozen)
5. Cannot proceed to Phase 4 until all voices locked
6. Green banner shows when all voices locked
7. "Continue to Visual Design" button navigates to Phase 4
8. All builds pass
9. No type errors
10. Ready for Phase 4

---

## Common Pitfalls to Avoid

1. **Generating voice before script locked** → Add validation
2. **Generating voice for all modules at once** → Implement queuing/batching
3. **Not tracking TTS provider/model** → Store in DB for reproducibility
4. **No error handling during TTS** → Handle API failures gracefully
5. **Audio merging failures** → Test with various scene counts
6. **No progress indicator** → Show user generation is happening
7. **Lost voice settings** → Persist in database

---

## Phase 3 Roadmap

### Week 1
- [ ] Design database schema
- [ ] Create voiceService.js API client
- [ ] Stub VoicePanel component
- [ ] Implement voice settings UI

### Week 2
- [ ] Implement TTS generation backend
- [ ] Create audio storage integration
- [ ] Build voice approval UI
- [ ] Add audio player component

### Week 3
- [ ] Voice locking mechanism
- [ ] Multi-script workflows
- [ ] Error handling & retry logic
- [ ] Testing & polish

### Week 4
- [ ] Integration testing with Phase 2/4
- [ ] Performance optimization
- [ ] Documentation
- [ ] Production deployment

---

## Resources

### External APIs
- **ElevenLabs**: [Documentation](https://elevenlabs.io/docs)
- **Azure Speech Services**: [Documentation](https://learn.microsoft.com/en-us/azure/cognitive-services/speech-service/)

### Similar Implementations
- Synthesia (video with voice generation)
- Descript (audio processing)
- Heygen (avatar with voice integration)

---

## Next Phase (Phase 4)

Once Phase 3 is complete with all voices locked:
- Visual Design Layer 1 (Slides)
- Edit slide content, layouts, images
- Place avatar placeholders
- No rendering yet, just design

---

## Contact & Questions

For Phase 3 implementation questions:
1. Check Phase 2 completion report for patterns
2. Reference ScriptsPanel.jsx for UI structure
3. Review API validation patterns in scripts.ts
4. Check database schema in prisma/schema.prisma

---

**Created**: July 8, 2026  
**Status**: Ready for implementation  
**Next Phase**: Phase 3 Voice Generation
