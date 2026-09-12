const Caption = require("../models/Caption");
const { generateCaption } = require("../services/aiService");

const createCaption = async (req, res) => {
  // TEMPORARY timing logs to find where request time is spent - safe to remove later.
  const requestStart = Date.now();
  try {
    const { topic = "", platform, tone, imageData = "", mimeType = "", previousCaption = "" } = req.body;

    if (!platform || !tone) return res.status(400).json({ message: "Platform and tone are required" });
    if (!topic.trim() && !imageData) return res.status(400).json({ message: "Please add a description or upload an image" });

    console.log(`[timing] Request received: 0ms (hasImage=${Boolean(imageData)})`);

    const generated = await generateCaption({ topic, platform, tone, imageData, mimeType, previousCaption });
    console.log(`[timing] Gemini finished: ${Date.now() - requestStart}ms`);

    const mongoStart = Date.now();
    const savedCaption = await Caption.create({
      topic: topic.trim() || "Image-based caption",
      platform,
      tone,
      caption: generated.caption,
      hashtags: generated.hashtags,
      labels: generated.labels,
      imageDescription: generated.imageDescription,
      detectedItems: generated.detectedItems,
      hasImage: Boolean(imageData),
    });
    console.log(`[timing] MongoDB saved: ${Date.now() - mongoStart}ms`);
    console.log(`[timing] Total: ${Date.now() - requestStart}ms`);

    res.status(201).json(savedCaption);
  } catch (error) {
    console.log(`[timing] Failed after: ${Date.now() - requestStart}ms`);
    console.error("Caption generation error:", error);
    res.status(500).json({ message: "Failed to generate caption", error: error.message });
  }
};

const getCaptions = async (req, res) => {
  try {
    res.json(await Caption.find().sort({ createdAt: -1 }));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch captions", error: error.message });
  }
};

const deleteCaption = async (req, res) => {
  try {
    await Caption.findByIdAndDelete(req.params.id);
    res.json({ message: "Caption deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete caption", error: error.message });
  }
};

module.exports = { createCaption, getCaptions, deleteCaption };
