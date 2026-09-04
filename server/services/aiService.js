const { GoogleGenerativeAI } = require("@google/generative-ai");

const API_KEY = process.env.AI_API_KEY || process.env.GEMINI_API_KEY;
if (!API_KEY) console.error("ERROR: AI_API_KEY or GEMINI_API_KEY is missing.");

const genAI = new GoogleGenerativeAI(API_KEY);

const API_VERSION = "v1";
// The @google/generative-ai SDK does not expose a ListModels call, so discovery
// talks to the same REST API the SDK itself calls, using the same API key/version.
const MODELS_ENDPOINT = `https://generativelanguage.googleapis.com/${API_VERSION}/models`;
const PREFERRED_MODEL = "gemini-3.6-flash";

const cleanJson = (text) => text.replace(/```json/gi, "").replace(/```/g, "").trim();

const RETRYABLE_STATUS_CODES = [429, 503];

const isRetryableError = (error) => {
  const status = error?.status || error?.response?.status;
  if (RETRYABLE_STATUS_CODES.includes(status)) return true;
  const message = error?.message || "";
  return /\b(429|503)\b/.test(message) || /service unavailable|too many requests|overloaded|high demand/i.test(message);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const generateContentWithRetry = async (model, content, { maxRetries = 3, baseDelayMs = 2000 } = {}) => {
  let attempt = 0;
  while (true) {
    try {
      return await model.generateContent(content);
    } catch (error) {
      if (attempt >= maxRetries || !isRetryableError(error)) {
        throw error;
      }
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      console.warn(
        `Gemini request failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}. Retrying in ${delayMs}ms...`
      );
      await sleep(delayMs);
      attempt += 1;
    }
  }
};

// ---------------------------------------------------------------------------
// Model discovery / selection
// ---------------------------------------------------------------------------

// 1x1 transparent PNG used only to verify a model accepts multimodal (text + image) input.
const VERIFICATION_IMAGE = {
  mimeType: "image/png",
  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
};

const EXCLUDED_NAME_PATTERN = /embedding|aqa|imagen|tts/i;

let candidateModelsPromise = null; // cached ranked list of models available to this API key
let workingModel = null; // cached, verified model currently in use
let excludedModels = new Set(); // models confirmed incompatible (not just temporarily overloaded)

const fetchModelList = async () => {
  const response = await fetch(`${MODELS_ENDPOINT}?key=${API_KEY}`);
  if (!response.ok) {
    throw new Error(`Gemini model list request failed with HTTP ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data.models) ? data.models : [];
};

// Ranks models that actually support generateContent, preferring PREFERRED_MODEL,
// then other Flash models, then any other compatible Gemini model.
const rankCandidates = (models) => {
  const usable = models
    .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
    .map((m) => (m.name || "").replace(/^models\//, ""))
    .filter((name) => name.startsWith("gemini") && !EXCLUDED_NAME_PATTERN.test(name));

  const unique = [...new Set(usable)];

  const preferred = unique.filter((name) => name === PREFERRED_MODEL);
  const otherFlash = unique.filter((name) => name !== PREFERRED_MODEL && /flash/i.test(name)).sort();
  const rest = unique.filter((name) => name !== PREFERRED_MODEL && !/flash/i.test(name)).sort();

  return [...preferred, ...otherFlash, ...rest];
};

const discoverCandidateModels = async () => {
  if (!candidateModelsPromise) {
    candidateModelsPromise = (async () => {
      console.log("Checking available Gemini models...");
      const models = await fetchModelList();
      const ranked = rankCandidates(models);
      if (ranked.length === 0) {
        throw new Error("No compatible Gemini Flash model is currently available for this API key.");
      }
      return ranked;
    })().catch((error) => {
      candidateModelsPromise = null; // don't cache a failed discovery; allow retry on next call
      throw error;
    });
  }
  return candidateModelsPromise;
};

// Confirms a candidate model actually accepts a real text + image generateContent call.
const verifyModelIsUsable = async (modelName) => {
  try {
    const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: API_VERSION });
    await model.generateContent([{ text: "Reply with the single word OK." }, { inlineData: VERIFICATION_IMAGE }]);
    return { ok: true };
  } catch (error) {
    return { ok: false, retryable: isRetryableError(error), message: error.message };
  }
};

// Returns a cached, verified model name, discovering/verifying candidates as needed.
const selectWorkingModel = async ({ forceRediscover = false } = {}) => {
  if (workingModel && !forceRediscover) return workingModel;

  const candidates = await discoverCandidateModels();

  for (const name of candidates) {
    if (excludedModels.has(name)) continue;

    const result = await verifyModelIsUsable(name);
    if (result.ok) {
      workingModel = name;
      console.log(`Selected Gemini model: ${name}`);
      return name;
    }

    console.warn(`Model ${name} unavailable, trying next compatible model...`);
    if (!result.retryable) {
      excludedModels.add(name); // genuinely incompatible (e.g. not found) - never retry it
    }
  }

  throw new Error("No compatible Gemini Flash model is currently available for this API key.");
};

// Kick off discovery at startup so a model is already selected before the first request.
selectWorkingModel().catch((error) => {
  console.error("Gemini model discovery failed at startup:", error.message);
});

// ---------------------------------------------------------------------------
// Caption generation
// ---------------------------------------------------------------------------

const MAX_MODEL_FALLBACKS = 3;

const generateCaption = async ({ topic = "", platform, tone, imageData = "", mimeType = "", previousCaption = "" }) => {
  const prompt = `
You are an expert social media content creator for a modern Gen-Z audience.

Create ONE fresh social media caption using the user's context and the uploaded image when provided.

User description/context:
${topic || "No written description provided. Infer useful context from the image."}

Platform: ${platform}
Tone: ${tone}

${previousCaption ? `Previous caption (do not copy or closely repeat it):\n${previousCaption}` : ""}

Requirements:
- Analyze visible details in the image when an image is provided.
- Combine image details with the user's written description when both are provided.
- If the description is empty, rely primarily on the image.
- Make the caption natural and platform-appropriate.
- For regeneration, make it meaningfully different from the previous caption.
- Generate exactly 5 relevant hashtags, each starting with #.
- Return 3-6 concise image labels and a one-sentence image description.
- Do not invent important facts unsupported by the image or description.
- Return ONLY valid JSON.

JSON format:
{
  "labels": ["label1", "label2", "label3"],
  "imageDescription": "Short description of what is visible in the image.",
  "caption": "The generated caption",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"]
}
`;

  const content = [{ text: prompt }];
  if (imageData && mimeType) {
    content.push({ inlineData: { mimeType, data: imageData } });
  }

  let attemptsLeft = MAX_MODEL_FALLBACKS;
  let currentModelName = await selectWorkingModel();

  while (true) {
    try {
      const model = genAI.getGenerativeModel(
        {
          model: currentModelName,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: previousCaption ? 1 : 0.8,
          },
        },
        { apiVersion: API_VERSION }
      );

      const result = await generateContentWithRetry(model, content);
      const parsed = JSON.parse(cleanJson(result.response.text()));

      if (!parsed.caption || !Array.isArray(parsed.hashtags)) {
        throw new Error("AI returned an invalid caption response.");
      }

      return {
        labels: Array.isArray(parsed.labels) ? parsed.labels.slice(0, 6) : [],
        imageDescription: parsed.imageDescription || "",
        caption: parsed.caption,
        hashtags: parsed.hashtags.slice(0, 5),
      };
    } catch (error) {
      if (!isRetryableError(error) || attemptsLeft <= 0) {
        console.error("AI caption generation failed:", error.message);
        throw error;
      }

      console.warn(`Model ${currentModelName} unavailable, trying next compatible model...`);
      // Not permanently excluded: a 429/503 is transient, so this model can be
      // re-verified and reused again once demand drops.
      workingModel = null;
      attemptsLeft -= 1;

      try {
        currentModelName = await selectWorkingModel({ forceRediscover: true });
      } catch (selectionError) {
        console.error("AI caption generation failed:", selectionError.message);
        throw selectionError;
      }
    }
  }
};

module.exports = { generateCaption };
