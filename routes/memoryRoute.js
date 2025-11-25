// routes/memory.js
const express = require("express");
const router = express.Router();
const Memory = require("../models/Memory");

// Save or update memory item
router.post("/", async (req, res) => {
  try {
    const { sessionId, key, value } = req.body;
    if (!sessionId || !key)
      return res.status(400).json({ error: "sessionId and key required" });
    const existing = await Memory.findOne({ sessionId, key });
    if (existing) {
      existing.value = value;
      await existing.save();
      return res.json({ ok: true, updated: true });
    }
    await Memory.create({ sessionId, key, value });
    res.json({ ok: true, created: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Memory save failed" });
  }
});

// Get memory for a session (or a specific key)
router.get("/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const items = await Memory.find({ sessionId }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: "Memory read failed" });
  }
});

module.exports = router;
