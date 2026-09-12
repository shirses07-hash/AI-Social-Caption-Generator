const mongoose = require("mongoose");

const captionSchema = new mongoose.Schema(
  {
    topic: { type: String, required: true },
    platform: { type: String, required: true, enum: ["Instagram", "LinkedIn", "X"] },
    tone: { type: String, required: true },
    caption: { type: String, required: true },
    hashtags: { type: [String], default: [] },
    labels: { type: [String], default: [] },
    imageDescription: { type: String, default: "" },
    detectedItems: {
      type: [
        {
          label: String,
          boundingBox: {
            x: Number,
            y: Number,
            width: Number,
            height: Number,
          },
        },
      ],
      default: [],
    },
    hasImage: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Caption", captionSchema);
