const express = require("express");

const {
    createCaption,
    getCaptions,
    deleteCaption
} = require("../controllers/captionController");

const router = express.Router();

router.post("/generate", createCaption);
router.get("/", getCaptions);
router.delete("/:id", deleteCaption);

module.exports = router;