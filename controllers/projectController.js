// controllers/projectController.js
const Project = require("../models/project");

// GET /api/projects
const getProjects = async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/projects/:id
const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /api/projects
const createProject = async (req, res) => {
  try {
    const data = req.body;
    const project = new Project(data);
    await project.save();
    res.status(201).json(project);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Bad request", error: err.message });
  }
};

// PUT /api/projects/:id
const updateProject = async (req, res) => {
  try {
    const updated = await Project.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!updated) return res.status(404).json({ message: "Project not found" });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Bad request", error: err.message });
  }
};

// DELETE /api/projects/:id
const deleteProject = async (req, res) => {
  try {
    const removed = await Project.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ message: "Project not found" });
    res.json({ message: "Project deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
};
