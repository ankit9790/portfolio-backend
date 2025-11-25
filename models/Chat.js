// models/Chat.js
const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Chat || mongoose.model("Chat", ChatSchema);
