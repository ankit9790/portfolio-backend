// routes/ai.js
const express = require("express");
const router = express.Router();
require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");
const Chat = require("../models/Chat");
const Memory = require("../models/Memory"); // FIXED ✔
const fetch = global.fetch || require("node-fetch");

// Safe logging
console.log(
  "Gemini key loaded:",
  process.env.GEMINI_API_KEY
    ? process.env.GEMINI_API_KEY.slice(0, 12) + "..."
    : "undefined"
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Local file reference (resume)
const DEFAULT_FILE_PATH = "/mnt/data/f4b44d1f-2ee2-48fa-8fed-898b12f75657.png";

// -------------------------- MEMORY LOADING --------------------------
async function loadMemory(sessionId) {
  try {
    const items = await Memory.find({ sessionId }).lean();
    const out = {};
    items.forEach((m) => (out[m.key] = m.value));
    return out;
  } catch (err) {
    console.warn("Memory read failed:", err.message);
    return {};
  }
}

// -------------------------- LANGUAGE DETECTION --------------------------
function detectLanguage(text) {
  if (!text) return "en";
  const devanagari = /[\u0900-\u097F]/;
  if (devanagari.test(text)) return "hi";
  const hindiWords = ["है", "क्या", "आप", "नमस्ते", "मुझे"];
  if (hindiWords.some((w) => text.includes(w))) return "hi";
  return "en";
}

// -------------------------- URL CLEANING --------------------------
function removeUrls(str) {
  if (!str) return "";
  return str
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/\bdrive\.google\S+/gi, "")
    .replace(/\bgithub\.com\/\S+/gi, "")
    .replace(/\/mnt\/data\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// -------------------------- SHAPERS --------------------------

function cleanProject(p) {
  return {
    id: p._id || p.id,
    title: p.title || p.name || "Untitled Project",
    shortDescription: removeUrls(p.shortDescription || p.desc || ""),
    longDescription: removeUrls(p.longDescription || ""),
    techStack: Array.isArray(p.techStack) ? p.techStack : [],
  };
}

function cleanCert(c) {
  return {
    id: c._id || c.id,
    name: c.name || c.title || "",
    issuer: c.issuer || "",
    issueDate: c.issueDate ? new Date(c.issueDate).toLocaleDateString() : "",
    description: removeUrls(c.description || ""),
  };
}

// -------------------------- FETCH PROJECTS --------------------------

async function loadProjects() {
  try {
    const res = await fetch("http://localhost:5000/api/projects");
    const data = await res.json();
    return data.map(cleanProject);
  } catch (err) {
    console.log("Project fetch error:", err.message);
    return [];
  }
}

async function loadCerts() {
  try {
    const res = await fetch("http://localhost:5000/api/certifications");
    const data = await res.json();
    return data.map(cleanCert);
  } catch (err) {
    console.log("Cert fetch error:", err.message);
    return [];
  }
}

// -------------------------- PROMPT HELPERS --------------------------

function projectsToPrompt(list) {
  if (!list.length) return "";
  let out = "Projects:\n";
  list.forEach((p, i) => {
    out += `${i + 1}. ${p.title} — ${
      p.shortDescription
    } — Tech: ${p.techStack.join(", ")}\n`;
  });
  return out;
}

function certsToPrompt(list) {
  if (!list.length) return "";
  let out = "Certifications:\n";
  list.forEach((c, i) => {
    out += `${i + 1}. ${c.name} — ${c.issuer} — ${c.issueDate} — ${
      c.description
    }\n`;
  });
  return out;
}

// -------------------------- MAIN AI ROUTE --------------------------

router.post("/ask-ai", async (req, res) => {
  try {
    const {
      message,
      sessionId,
      includeProjects = false,
      includeCertifications = false,
      fileUrl,
    } = req.body;

    if (!message) return res.status(400).json({ error: "Message required" });

    const session = sessionId || "guest";

    // LOAD MEMORY + MODE
    const memory = await loadMemory(session);
    const mode = memory.mode || "default";

    // MODE-INSTRUCTION
    let modeInstruction = "";
    if (mode === "developer") {
      modeInstruction =
        "Focus on system design, architecture, scalability, APIs.";
    } else if (mode === "designer") {
      modeInstruction = "Focus on UI/UX, accessibility, layout, user flow.";
    } else if (mode === "mentor") {
      modeInstruction = "Give interview tips, guidance, roadmap suggestions.";
    } else {
      modeInstruction = "Balanced explanations.";
    }

    // Fetch data if needed
    const lower = message.toLowerCase();
    const wantsProjects = includeProjects || lower.includes("project");
    const wantsCerts = includeCertifications || lower.includes("certificate");

    const projects = wantsProjects ? await loadProjects() : [];
    const certs = wantsCerts ? await loadCerts() : [];

    const lang = detectLanguage(message);

    // Persona
    const persona = `
You are AnkitBot, a highly professional assistant for Ankit Yadav.
Rules:
- NEVER show URLs.
- NEVER invent features beyond provided data.
- Expand intelligently (architecture, workflow, purpose, problem-solving).
- Match user language.
Mode: ${mode}.
${modeInstruction}
`;

    // Build prompt
    let prompt = persona + "\n\n";

    if (fileUrl || DEFAULT_FILE_PATH) {
      prompt +=
        "(A resume/image is available for context. DO NOT reveal its path.)\n\n";
    }

    if (projects.length) prompt += projectsToPrompt(projects) + "\n";
    if (certs.length) prompt += certsToPrompt(certs) + "\n";

    prompt += `User: ${message}\nAssistant:`;

    if (lang === "hi") prompt += " (Answer in Hindi.)\n";
    else prompt += " (Answer in the user's language.)\n";

    const model = genAI.getGenerativeModel({
      model: "models/gemini-flash-latest",
    });

    const result = await model.generateContent(prompt);
    const reply = result.response?.text?.() || "Could not generate reply.";

    // Store conversation
    await Chat.create({ sessionId: session, role: "user", text: message });
    await Chat.create({ sessionId: session, role: "assistant", text: reply });

    return res.json({
      reply,
      projects: wantsProjects ? projects : undefined,
      certifications: wantsCerts ? certs : undefined,
      language: lang,
    });
  } catch (err) {
    console.error("GEMINI ERROR:", err);
    return res.status(500).json({
      error: "Gemini failed",
      detail: err.message,
    });
  }
});

module.exports = router;
