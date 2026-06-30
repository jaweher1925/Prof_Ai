/**
 * Quick diagnostic script to test HeyGen HyperFrames v3 API
 * Run with: node test-hyperframes.js
 */

const API_KEY = 'sk_V2_hgu_kP0rBaDTTZm_XmpmEx2nXkNE8uax0KNASRcNfgEV4zEu';
const BASE_URL = 'https://api.heygen.com/v3/hyperframes';

// Minimal test HTML composition
const testHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; width: 1280px; height: 720px; background: linear-gradient(135deg, #0F172A, #1E293B); display: flex; align-items: center; justify-content: center; font-family: Arial, sans-serif; }
  h1 { color: white; font-size: 64px; animation: fadeIn 1s ease-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
</style>
</head>
<body>
  <h1>HyperFrames Test</h1>
</body>
</html>`;

async function testHyperFrames() {
  console.log('🧪 Testing HeyGen HyperFrames v3 API...\n');

  try {
    // Step 1: Submit render
    console.log('📤 Submitting render...');
    
    // Try using data URL approach
    const htmlBase64 = Buffer.from(testHTML).toString('base64');
    const dataUrl = `data:text/html;base64,${htmlBase64}`;
    
    const payload = {
      project: {
        type: 'url',
        url: dataUrl,
      },
      fps: 30,
      quality: 'standard',
      format: 'mp4',
      resolution: '1080p',
      aspect_ratio: '16:9',
    };

    console.log('Request payload:', JSON.stringify(payload, null, 2).slice(0, 500) + '...\n');

    const submitRes = await fetch(`${BASE_URL}/renders`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log(`Response status: ${submitRes.status} ${submitRes.statusText}`);
    
    const responseText = await submitRes.text();
    console.log(`Response body (first 500 chars): ${responseText.slice(0, 500)}\n`);

    let submitData;
    try {
      submitData = JSON.parse(responseText);
    } catch (e) {
      console.error('❌ Failed to parse response as JSON');
      console.error('This usually means:');
      console.error('  1. Invalid API key');
      console.error('  2. Wrong endpoint URL');
      console.error('  3. API format changed');
      console.error('\nFull response:', responseText.slice(0, 1000));
      return;
    }

    if (!submitRes.ok) {
      console.error('❌ API returned error:', submitData);
      return;
    }

    const renderId = submitData.data?.render_id;
    if (!renderId) {
      console.error('❌ No render_id in response:', submitData);
      return;
    }

    console.log(`✅ Render submitted: ${renderId}\n`);

    // Step 2: Poll for completion
    console.log('⏳ Polling for completion...');
    let attempts = 0;
    const maxAttempts = 60; // 60 * 4s = 4 minutes max

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 4000));
      attempts++;

      const statusRes = await fetch(`${BASE_URL}/renders/${renderId}`, {
        headers: { 'x-api-key': API_KEY },
      });

      const statusData = await statusRes.json();
      const status = statusData.data?.status;

      console.log(`[${attempts}] Status: ${status}`);

      if (status === 'completed') {
        console.log('\n✅ Render complete!');
        console.log('Video URL:', statusData.data.video_url);
        console.log('Thumbnail:', statusData.data.thumbnail_url);
        console.log('Duration:', statusData.data.duration, 'seconds');
        return;
      }

      if (status === 'failed') {
        console.error('\n❌ Render failed:', statusData.data.failure_message || statusData.data.error);
        return;
      }
    }

    console.error('\n❌ Timeout: render did not complete in 4 minutes');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

testHyperFrames();
