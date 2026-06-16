/**
 * POST /api/exportSCORM
 *
 * Exports the project as a SCORM 1.2 package (.zip)
 * for uploading to any LMS (Moodle, Canvas, etc.)
 *
 */
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { prisma } from '../../lib/db'
import { getUser } from '../../lib/auth'

async function exportSCORMHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUser(request)
  if (!user) return { status: 401, jsonBody: { error: 'Unauthenticated' } }

  try {
    const body = (await request.json()) as { project_id?: string }
    if (!body.project_id) {
      return { status: 400, jsonBody: { error: 'project_id is required' } }
    }

    const project = await prisma.project.findUnique({
      where: { id: body.project_id },
      include: {
        modules: {
          include: { scenes: { orderBy: { orderIndex: 'asc' } } },
          orderBy: { orderIndex: 'asc' },
        },
      },
    })

    if (!project) return { status: 404, jsonBody: { error: 'Project not found' } }

    // Build SCORM manifest (imsmanifest.xml)
    const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="secondself-${project.id}" version="1.1"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org-${project.id}">
    <organization identifier="org-${project.id}" structure="hierarchical">
      <title>${project.title}</title>
      ${project.modules.map((mod, mi) => `
      <item identifier="module-${mod.id}" identifierref="resource-${mod.id}">
        <title>${mod.title}</title>
        ${mod.scenes.map((scene, si) => `
        <item identifier="scene-${scene.id}">
          <title>Scene ${si + 1}</title>
        </item>`).join('')}
      </item>`).join('')}
    </organization>
  </organizations>
  <resources>
    ${project.modules.map(mod => `
    <resource identifier="resource-${mod.id}" type="webcontent" adlcp:scormtype="sco" href="module-${mod.id}.html">
      <file href="module-${mod.id}.html"/>
    </resource>`).join('')}
  </resources>
</manifest>`

    // Build a simple HTML player for each module
    const moduleFiles: Record<string, string> = {}

    for (const mod of project.modules) {
      const scenesHtml = mod.scenes.map((scene, i) => `
  <div class="scene" id="scene-${i}" style="display:${i === 0 ? 'block' : 'none'}">
    <div class="scene-content">
      ${scene.visualAssetUrl ? `<img src="${scene.visualAssetUrl}" class="bg-image" alt="Scene visual"/>` : ''}
      ${scene.avatarVideoUrl && !scene.avatarVideoUrl.startsWith('heygen:')
        ? `<video src="${scene.avatarVideoUrl}" controls class="avatar-video"></video>`
        : scene.ttsAudioUrl
        ? `<audio src="${scene.ttsAudioUrl}" controls></audio>`
        : ''}
      <div class="script-text">
        <p>${scene.scriptContent?.replace(/\n/g, '</p><p>') || ''}</p>
      </div>
    </div>
    <div class="nav">
      ${i > 0 ? `<button onclick="goTo(${i-1})">Previous</button>` : ''}
      ${i < mod.scenes.length - 1
        ? `<button onclick="goTo(${i+1})">Next</button>`
        : `<button onclick="complete()">Complete Module</button>`}
    </div>
  </div>`).join('')

      moduleFiles[`module-${mod.id}.html`] = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${mod.title}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #1e293b; color: #fff; margin: 0; padding: 20px; }
    .scene { max-width: 900px; margin: 0 auto; }
    .bg-image { width: 100%; border-radius: 8px; margin-bottom: 16px; }
    .avatar-video { width: 100%; border-radius: 8px; }
    .script-text { background: rgba(255,255,255,0.05); padding: 20px; border-radius: 8px; margin: 16px 0; line-height: 1.8; }
    .nav { display: flex; gap: 12px; margin-top: 20px; }
    button { background: #4f46e5; color: white; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    button:hover { background: #4338ca; }
    h1 { color: #818cf8; margin-bottom: 24px; }
  </style>
</head>
<body>
  <h1>${mod.title}</h1>
  ${scenesHtml}
  <script>
    var API = null;
    function findAPI(win) {
      if (win.API) return win.API;
      if (win.parent && win.parent !== win) return findAPI(win.parent);
      return null;
    }
    window.onload = function() {
      API = findAPI(window);
      if (API) {
        API.LMSInitialize('');
        API.LMSSetValue('cmi.core.lesson_status', 'incomplete');
      }
    };
    function goTo(i) {
      document.querySelectorAll('.scene').forEach(function(s) { s.style.display = 'none'; });
      document.getElementById('scene-' + i).style.display = 'block';
    }
    function complete() {
      if (API) {
        API.LMSSetValue('cmi.core.lesson_status', 'completed');
        API.LMSSetValue('cmi.core.score.raw', '100');
        API.LMSFinish('');
      }
      alert('Module completed!');
    }
  </script>
</body>
</html>`
    }

    // For now return the manifest and file list
    // In production you'd zip these and return the zip
    return {
      status: 200,
      jsonBody: {
        success: true,
        project_title: project.title,
        modules_count: project.modules.length,
        files: Object.keys(moduleFiles),
        manifest_preview: manifest.slice(0, 500),
        message: 'SCORM package structure generated. Zip functionality requires Azure Blob Storage for download.',
      },
    }
  } catch (error: any) {
    context.error('exportSCORM error:', error)
    return { status: 500, jsonBody: { error: error.message } }
  }
}

app.http('exportSCORM', {
  methods: ['POST'],
  route: 'exportSCORM',
  authLevel: 'anonymous',
  handler: exportSCORMHandler,
})
