# 🎨 Setup Image Generation for Educational Content

You're now using **Replicate AI** to generate real, educational images (not just gradients).

## What Changed

✅ **Old**: White/blank backgrounds  
✅ **New**: Real AI-generated educational images related to your course content

The system now:
1. Reads your script content
2. Extracts key concepts
3. Generates educational illustrations that help students understand
4. Works with custom prompts too

---

## Setup (Required - Takes 5 minutes)

### Step 1: Get Free Replicate API Key

1. Go to: https://replicate.com/
2. Click **"Sign Up"**
3. Create account (free tier available)
4. Go to: https://replicate.com/account/api-tokens
5. Click **"Create API token"**
6. Copy the token (starts with `r8_...`)

### Step 2: Add API Key to .env

Edit `api/.env`:

```bash
# Add this line
REPLICATE_API_KEY=r8_your_token_here
```

Save the file.

### Step 3: Restart Backend

In Terminal 1 (backend):
1. Stop current: Press Ctrl+C
2. Restart: `npm start`

---

## How It Works

### Auto-Generate (Recommended)

1. Go to Visual Designer
2. Scene has script text (required)
3. Click "✨ Generate with AI"
4. Wait 10-20 seconds
5. **Real educational image appears** ✅

**Example**:
- Script: "Today we learn about photosynthesis"
- Image: Shows plant cells, chloroplasts, sunlight → glucose diagram
- Result: Students see visual explanation of the concept

### Custom Prompt

1. Click "✎ Custom prompt"
2. Type what you want:
   - "A diagram of the carbon cycle"
   - "A flowchart showing machine learning process"
   - "A molecule structure of water"
3. Click "Generate with AI"
4. Custom image generated

---

## Cost

### Free Tier
- **Replicate**: Free $50/month credit (plenty for testing)
- **Generate images**: ~$0.01 per image
- **1,000 images**: ~$10

### How Long Images Take
- First time: 10-20 seconds (model loading)
- After that: 5-10 seconds each

---

## Troubleshooting

### ❌ "Image generation services unavailable"
**Cause**: No REPLICATE_API_KEY in .env  
**Fix**: 
1. Add key to `api/.env`
2. Restart backend: `npm start`

### ❌ "No image in Replicate response"
**Cause**: Replicate API rate limited or overloaded  
**Fix**: Wait 1-2 minutes and try again

### ❌ Image takes very long (>30 sec)
**Cause**: Normal - Stable Diffusion 3 is slower  
**Fix**: Be patient, it will complete

### ❌ Image doesn't relate to my content
**Cause**: Prompt too vague  
**Fix**: Use custom prompt with specific details

---

## Free Tier Limits

- **50 images/month** free ($50 credit)
- **Per image**: ~$0.01-$0.05
- **Speed**: 5-20 seconds depending on model load

---

## API Details

The system uses:
- **Model**: Stable Diffusion 3 Medium (best quality)
- **Size**: 1024x1024 (generates educational illustrations)
- **Provider**: Replicate (free tier available)

---

## Setup Complete When

✅ `REPLICATE_API_KEY` added to `api/.env`  
✅ Backend restarted (`npm start`)  
✅ Go to Visual Designer  
✅ Click "Generate with AI"  
✅ **Real educational image generates** 🎉

---

## Example Prompts

### Auto (from script)
Script: "Photosynthesis is the process plants use to convert sunlight into glucose"
→ Image: Plant cell diagram with chloroplasts and energy conversion

### Custom Prompts
- ✅ "Diagram showing DNA replication process"
- ✅ "Flowchart of the water cycle"
- ✅ "Illustration of a neuron synapse"
- ✅ "Chart showing economic supply and demand"
- ✅ "Timeline of world history events"

### What Works Best
- ✅ **Specific**: "neural network architecture" vs "AI"
- ✅ **Educational**: "diagram", "flowchart", "illustration"
- ✅ **Clear**: "cell structure" vs "biology stuff"

### What Doesn't Work
- ❌ Abstract art or decorative images
- ❌ Photorealistic people/faces
- ❌ Copyrighted characters
- ❌ Very complex 3D renders

---

## Next Steps

1. ✅ Sign up at https://replicate.com/
2. ✅ Get API token
3. ✅ Add to `api/.env` as `REPLICATE_API_KEY`
4. ✅ Restart backend
5. ✅ Test in Visual Designer
6. 🚀 Generate educational images!

---

**Status**: ✅ Ready to generate real educational images  
**Just need**: Replicate API key (free!)  
**Time to setup**: 5 minutes
