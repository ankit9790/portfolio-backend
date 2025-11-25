// routes/mode.js
const express = require("express");
const router = express.Router();
const Memory = require("../models/Memory");

// set mode
router.post("/set", async (req, res) => {
  try {
    const { sessionId, mode } = req.body;
    if (!sessionId || !mode)
      return res.status(400).json({ error: "sessionId and mode required" });
    const key = "mode";
    const value = mode;
    const existing = await Memory.findOne({ sessionId, key });
    if (existing) {
      existing.value = value;
      await existing.save();
    } else {
      await Memory.create({ sessionId, key, value });
    }
    res.json({ ok: true, mode: value });
  } catch (err) {
    res.status(500).json({ error: "set mode failed" });
  }
});

// get mode
router.get("/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const item = await Memory.findOne({ sessionId, key: "mode" });
    res.json({ mode: item ? item.value : "default" });
  } catch (err) {
    res.status(500).json({ error: "get mode failed" });
  }
});

module.exports = router;
