// routes/ai.js
const express = require("express");
const router = express.Router();
require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");
const Chat = require("../models/Chat");
const Memory = require("../models/Memory");
const fetch = global.fetch || require("node-fetch");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ----------------------------------------------------------
// 1) PERFECT LANGUAGE DETECTION (Fixed version)
// ----------------------------------------------------------
function detectLanguage(text) {
  if (!text) return "en";

  const hindiChars = (text.match(/[\u0900-\u097F]/g) || []).length;
  const englishChars = (text.match(/[A-Za-z]/g) || []).length;

  return hindiChars > englishChars ? "hi" : "en";
}

// ----------------------------------------------------------
// 2) Helper: Remove URLs
// ----------------------------------------------------------
function removeUrls(str) {
  if (!str) return "";
  return str
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/\bgithub\S+/gi, "")
    .replace(/\bdrive\S+/gi, "")
    .replace(/\/mnt\/data\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ----------------------------------------------------------
// 3) Project Cleaning
// ----------------------------------------------------------
function cleanProject(p) {
  return {
    id: p._id || p.id,
    title: p.title || "Untitled Project",
    shortDescription: removeUrls(p.shortDescription || p.desc || ""),
    longDescription: removeUrls(p.longDescription || ""),
    techStack: Array.isArray(p.techStack) ? p.techStack : [],
  };
}

// ----------------------------------------------------------
// 4) Certification Cleaning
// ----------------------------------------------------------
function cleanCert(c) {
  return {
    id: c._id || c.id,
    name: c.name || "",
    issuer: c.issuer || "",
    issueDate: c.issueDate ? new Date(c.issueDate).toLocaleDateString() : "",
    description: removeUrls(c.description || ""),
  };
}

// ----------------------------------------------------------
// 5) Load data from backend
// ----------------------------------------------------------
async function loadProjects() {
  try {
    const res = await fetch("http://localhost:5000/api/projects");
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map(cleanProject);
  } catch (err) {
    console.log("Project fetch error:", err.message);
    return [];
  }
}

async function loadCerts() {
  try {
    const res = await fetch("http://localhost:5000/api/certifications");
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map(cleanCert);
  } catch (err) {
    console.log("Cert fetch error:", err.message);
    return [];
  }
}

// ----------------------------------------------------------
// 6) Build project/cert prompt
// ----------------------------------------------------------
function projectsToPrompt(list, max = 5) {
  if (!list.length) return "";
  return (
    "Projects:\n" +
    list
      .slice(0, max)
      .map(
        (p, i) =>
          `${i + 1}. ${p.title} — ${
            p.shortDescription
          } — Tech: ${p.techStack.join(", ")}`
      )
      .join("\n") +
    "\n"
  );
}

function certsToPrompt(list, max = 6) {
  if (!list.length) return "";
  return (
    "Certifications:\n" +
    list
      .slice(0, max)
      .map(
        (c, i) =>
          `${i + 1}. ${c.name} — ${c.issuer} — ${c.issueDate} — ${
            c.description
          }`
      )
      .join("\n") +
    "\n"
  );
}

// ----------------------------------------------------------
// 7) MAIN AI ROUTE
// ----------------------------------------------------------
router.post("/ask-ai", async (req, res) => {
  console.log("\n================= NEW AI REQUEST =================");
  console.log("Incoming Body:", req.body);

  try {
    const {
      message,
      sessionId,
      includeProjects = false,
      includeCertifications = false,
    } = req.body;

    if (!message) return res.status(400).json({ error: "Message required" });

    const session = sessionId || "guest";

    // Detect user language correctly
    const lang = detectLanguage(message);
    console.log("Detected Language:", lang);

    // Load data based on user request
    const wantsProjects =
      includeProjects || message.toLowerCase().includes("project");

    const wantsCerts =
      includeCertifications || message.toLowerCase().includes("cert");

    const projects = wantsProjects ? await loadProjects() : [];
    const certs = wantsCerts ? await loadCerts() : [];

    // Build persona
    let prompt = `
You are AnkitBot, the AI assistant for Ankit Yadav.
Rules:
- NEVER include URLs.
- Do NOT invent facts.
- Expand only from given data.
`;

    if (projects.length) prompt += projectsToPrompt(projects);
    if (certs.length) prompt += certsToPrompt(certs);

    prompt += `\nUser: ${message}\nAssistant:\n`;

    // FORCE LANGUAGE (perfect fix)
    if (lang === "hi") {
      prompt += "IMPORTANT: Respond ONLY in Hindi.\n";
    } else {
      prompt += "IMPORTANT: Respond ONLY in English.\n";
    }

    const model = genAI.getGenerativeModel({
      model: "models/gemini-flash-latest",
    });

    console.log("Calling Gemini API...");

    const result = await model.generateContent(prompt);
    const reply =
      result.response?.text?.() || "Sorry, I couldn't generate a reply.";

    console.log("Gemini Final Reply:", reply);

    // Save chat
    await Chat.create({ sessionId: session, role: "user", text: message });
    await Chat.create({ sessionId: session, role: "assistant", text: reply });

    return res.json({
      reply,
      projects: wantsProjects ? projects : undefined,
      certifications: wantsCerts ? certs : undefined,
      language: lang,
    });
  } catch (err) {
    console.log("\n❌ GEMINI ERROR");
    console.error(err);

    return res.status(500).json({
      error: "Gemini failed",
      detail: err.message,
    });
  }
});

module.exports = router;
