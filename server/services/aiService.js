const { GoogleGenerativeAI } = require("@google/generative-ai");

const API_KEY = process.env.AI_API_KEY || process.env.GEMINI_API_KEY;
if (!API_KEY) console.error("ERROR: AI_API_KEY or GEMINI_API_KEY is missing.");

const genAI = new GoogleGenerativeAI(API_KEY);

const cleanJson = (text) => text.replace(/```json/gi, "").replace(/```/g, "").trim();

const RETRYABLE_STATUS_CODES = [429, 503];

const isRetryableError = (error) => {
  const status = error?.status || error?.response?.status;
  if (RETRYABLE_STATUS_CODES.includes(status)) return true;
  const message = error?.message || "";
  if (/\b(429|503)\b/.test(message) || /service unavailable|too many requests|overloaded|high demand/i.test(message)) {
    return true;
  }
  // When Gemini's servers are overloaded, they sometimes drop the connection
  // instead of sending a clean 503, which Node reports as "fetch failed".
  // Treat that the same as a temporary 503 so it gets retried too.
  return /fetch failed/i.test(message);
};

const buildBusyMessage = (error) => {
  const status = error?.status || error?.response?.status;
  const message = error?.message || "";
  const isRateLimit = status === 429 || /\b429\b/.test(message) || /too many requests/i.test(message);
  return isRateLimit
    ? "Gemini API rate limit reached. Please wait a moment and try again."
    : "Gemini service is temporarily unavailable. Please try again in a moment.";
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 5 total attempts against the configured model only, with fixed backoff delays between them.
const RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];

const generateContentWithRetry = async (model, content) => {
  let attempt = 0;
  while (true) {
    try {
      return await model.generateContent(content);
    } catch (error) {
      if (!isRetryableError(error) || attempt >= RETRY_DELAYS_MS.length) {
        if (isRetryableError(error)) {
          throw new Error(buildBusyMessage(error));
        }
        throw error;
      }
      const delayMs = RETRY_DELAYS_MS[attempt];
      console.warn(
        `Gemini request failed (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}): ${error.message}. Retrying in ${delayMs}ms...`
      );
      await sleep(delayMs);
      attempt += 1;
    }
  }
};

const generateCaption = async ({ topic = "", platform, tone, imageData = "", mimeType = "", previousCaption = "" }) => {
  try {
    const model = genAI.getGenerativeModel(
      {
        model: "gemini-3.5-flash-lite",
        generationConfig: {
          responseMimeType: "application/json",
          temperature: previousCaption ? 1 : 0.8,
        },
      },
      { apiVersion: "v1" }
    );

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
    console.error("AI caption generation failed:", error.message);
    throw error;
  }
};

module.exports = { generateCaption };
