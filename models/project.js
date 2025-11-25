// models/Project.js
const mongoose = require("mongoose");

const ProjectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },

  shortDescription: {
    type: String,
    required: true,
  },

  longDescription: {
    type: String,
  },

  techStack: [{ 
    type: String, 
    required: true,
   }],

  repoUrl: { type: String },

  liveUrl: { type: String },

  thumbnailUrl: { type: String },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Project", ProjectSchema);
