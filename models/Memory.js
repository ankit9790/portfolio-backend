// models/Memory.js
const mongoose = require("mongoose");
const MemorySchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  key: { type: String, required: true },
  value: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
MemorySchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});
module.exports =
  mongoose.models.Memory || mongoose.model("Memory", MemorySchema);
