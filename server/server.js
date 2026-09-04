const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "12mb" }));

// Reject queries immediately instead of buffering silently for 10s when disconnected.
const requireDbConnection = (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
            message: "Database not connected. Please try again shortly."
        });
    }
    next();
};

const captionRoutes = require("./routes/captionRoutes");
app.use("/api/captions", requireDbConnection, captionRoutes);

// Test route
app.get("/", (req, res) => {
    res.json({
        message: "AI Social Media Caption Generator API is running"
    });
});

app.get("/health", (req, res) => {
    const states = ["disconnected", "connected", "connecting", "disconnecting"];

    res.json({
        status: "ok",
        mongo: states[mongoose.connection.readyState] || "unknown"
    });
});

// MongoDB connection
mongoose.connection.on("connected", () => {
    console.log("MongoDB connected successfully");
});

mongoose.connection.on("error", (error) => {
    console.error("MongoDB connection error:", error.message);
});

mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected");
});

// Render's env var is MONGODB_URI; MONGO_URI is kept for local .env compatibility.
const MONGO_CONNECTION_STRING =
    process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_CONNECTION_STRING) {
    console.error(
        "FATAL: MONGODB_URI (or MONGO_URI) environment variable is not set. " +
        "The server will start, but all database operations will fail."
    );
} else {
    mongoose
        .connect(MONGO_CONNECTION_STRING, {
            serverSelectionTimeoutMS: 8000
        })
        .catch((error) => {
            console.error("MongoDB initial connection failed:", error.message);
        });
}

// Start server (bind immediately so Render's health check succeeds regardless of DB state)
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});