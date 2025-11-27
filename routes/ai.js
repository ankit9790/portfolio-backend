// routes/ai.js
const express = require("express");
const router = express.Router();
require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");
const Chat = require("../models/Chat");
const Memory = require("../models/Memory");
const fetch = global.fetch || require("node-fetch");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ---------------------------------------------------------------------
// 1) BASE URL (LOCAL + DEPLOYED)
// ---------------------------------------------------------------------
// ✅ For safety: put this in your backend .env:
// API_BASE_URL=https://portfolio-backend-1-k7rj.onrender.com
const BASE_URL = process.env.API_BASE_URL || "http://localhost:5000";

// ---------------------------------------------------------------------
// 2) LANGUAGE DETECTION (per message)
// ---------------------------------------------------------------------
function detectLanguage(text) {
  if (!text) return "en";

  const hindiChars = (text.match(/[\u0900-\u097F]/g) || []).length;
  const englishChars = (text.match(/[A-Za-z]/g) || []).length;

  return hindiChars > englishChars ? "hi" : "en";
}

// ---------------------------------------------------------------------
// 3) Remove URLs from any text (safety)
// ---------------------------------------------------------------------
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

// Also clean URLs from model reply just in case
function cleanReplyText(str) {
  return removeUrls(str);
}

// ---------------------------------------------------------------------
// 4) Project & Certification cleaning
// ---------------------------------------------------------------------
function cleanProject(p) {
  return {
    id: p._id || p.id,
    title: p.title || "Untitled Project",
    shortDescription: removeUrls(p.shortDescription || p.desc || ""),
    longDescription: removeUrls(p.longDescription || ""),
    techStack: Array.isArray(p.techStack)
      ? p.techStack
      : typeof p.techStack === "string"
      ? p.techStack.split(",").map((s) => s.trim())
      : [],
  };
}

function cleanCert(c) {
  return {
    id: c._id || c.id,
    name: c.name || "",
    issuer: c.issuer || "",
    issueDate: c.issueDate ? new Date(c.issueDate).toLocaleDateString() : "",
    description: removeUrls(c.description || ""),
  };
}

// ---------------------------------------------------------------------
// 5) Load Projects / Certifications from backend
// ---------------------------------------------------------------------
async function loadProjects() {
  try {
    const res = await fetch(`${BASE_URL}/api/projects`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map(cleanProject);
  } catch (err) {
    console.log("Project fetch error:", err.message);
    return [];
  }
}

async function loadCerts() {
  try {
    const res = await fetch(`${BASE_URL}/api/certifications`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map(cleanCert);
  } catch (err) {
    console.log("Cert fetch error:", err.message);
    return [];
  }
}

// ---------------------------------------------------------------------
// 6) Prompt builders for projects/certs
// ---------------------------------------------------------------------
function projectsToPrompt(list, max = 6) {
  if (!list.length) return "";
  return (
    "Projects (for reference):\n" +
    list
      .slice(0, max)
      .map(
        (p, i) =>
          `${i + 1}. ${p.title} — ${
            p.shortDescription || "(no short description)"
          } — Tech: ${p.techStack.join(", ")}`
      )
      .join("\n") +
    "\n\n"
  );
}

function certsToPrompt(list, max = 8) {
  if (!list.length) return "";
  return (
    "Certifications (for reference):\n" +
    list
      .slice(0, max)
      .map(
        (c, i) =>
          `${i + 1}. ${c.name} — ${c.issuer} — ${c.issueDate} — ${
            c.description || ""
          }`
      )
      .join("\n") +
    "\n\n"
  );
}

// ---------------------------------------------------------------------
// 7) Memory loader (name, mode, introDone, etc.)
// ---------------------------------------------------------------------
async function loadMemory(sessionId) {
  try {
    const items = await Memory.find({ sessionId }).lean();
    const mem = {};
    items.forEach((m) => {
      mem[m.key] = m.value;
    });
    return mem;
  } catch (err) {
    console.log("Memory read failed:", err.message);
    return {};
  }
}

// helper: set memory key
async function setMemory(sessionId, key, value) {
  try {
    await Memory.findOneAndUpdate(
      { sessionId, key },
      { value },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.log("Memory write failed:", err.message);
  }
}

// ---------------------------------------------------------------------
// 8) Translator target detector
// ---------------------------------------------------------------------
function detectTranslatorTarget(message, lang) {
  const m = message.toLowerCase();
  if (
    m.includes("to hindi") ||
    m.includes("into hindi") ||
    m.includes("in hindi") ||
    m.includes("हिंदी")
  )
    return "hi";
  if (
    m.includes("to english") ||
    m.includes("into english") ||
    m.includes("in english")
  )
    return "en";

  // default: opposite of detected
  return lang === "hi" ? "en" : "hi";
}

// ---------------------------------------------------------------------
// 9) MAIN AI ROUTE
// ---------------------------------------------------------------------
router.post("/ask-ai", async (req, res) => {
  console.log("\n================= NEW AI REQUEST =================");
  console.log("Incoming Body:", req.body);

  try {
    const {
      message,
      sessionId,
      includeProjects = true,
      includeCertifications = true,
      fileUrl, // not actually readable by Gemini, but can be referenced conceptually
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    const session = sessionId || "guest";

    // Load memory: mode, name, introDone, etc.
    const memory = await loadMemory(session);
    const mode = memory.mode || "default";
    const userName = memory.name || null;
    const introDone = memory.introDone === "true";

    // Detect language for THIS message
    const lang = detectLanguage(message);

    // Translator mode? (either mode=translator OR user says translate)
    const lowerMsg = message.toLowerCase();
    const translatorActive =
      mode === "translator" || lowerMsg.includes("translate");

    const translatorTarget = translatorActive
      ? detectTranslatorTarget(message, lang)
      : null;

    // Load projects/certs if requested
    const wantsProjects =
      includeProjects || /project|portfolio|ems/.test(lowerMsg);
    const wantsCerts =
      includeCertifications ||
      /certificat|certificate|certification/.test(lowerMsg);

    const [projects, certs] = await Promise.all([
      wantsProjects ? loadProjects() : Promise.resolve([]),
      wantsCerts ? loadCerts() : Promise.resolve([]),
    ]);

    // Load small chat history for context (last 8 turns)
    let historyText = "";
    try {
      const history = await Chat.find({ sessionId: session })
        .sort({ createdAt: 1 })
        .limit(8);
      if (history.length) {
        historyText += "Conversation so far:\n";
        history.forEach((m) => {
          historyText += `${m.role === "assistant" ? "Assistant" : "User"}: ${
            m.text
          }\n`;
        });
        historyText += "\n";
      }
    } catch (err) {
      console.log("Chat history read failed:", err.message);
    }

    // -----------------------------------------------------------------
    // Persona & behavior
    // -----------------------------------------------------------------
    let persona = `
You are "AnkitBot", the professional AI assistant for developer Ankit Yadav.

GENERAL BEHAVIOR:
- Tone: professional, friendly, confident, concise.
- Always be clear and structured (use short paragraphs or bullet-like sections).
- Match the user's language (Hindi or English) based on the latest message.
- You MAY use your general knowledge for:
  - MERN roadmap, web development, JavaScript, React, Node.js, DBs, APIs.
  - Career guidance, interview preparation, resume advice (conceptually).
  - Real-world questions, general tech, or learning paths.
- You MUST NOT invent fake details about Ankit's personal projects or certifications beyond the data given.
  - You can rephrase, summarize, and logically expand based on project descriptions & tech stack.
  - If some specific detail is not available, say: "I don't have that information in the provided data."

PROJECT & CERT RULES:
- When the user asks about Ankit's projects:
  - Use only the provided project data (title, shortDescription, longDescription, techStack).
  - You can explain why the choice of tech is suitable.
  - You can describe typical features of such systems, but mark assumptions with words like "typically", "commonly", "likely".
- When the user asks about certifications:
  - Mention name, issuer, issue date, and what it roughly represents.

MODE SYSTEM:
- current mode: ${mode}
- default: balanced professional assistant.
- developer: more technical depth (architecture, code-level thinking).
- designer: focus on UI/UX, visual design, usability.
- mentor: focus on learning path, mindset, motivation, step-by-step guidance.
- translator: your main task is to translate user text between Hindi and English (no long explanation unless asked).

INTRO BEHAVIOR:
- If "introDone" is false or missing, give a short 1–2 line intro of who you are and then answer the question.
- If "introDone" is true, DO NOT introduce yourself again. Answer directly.
- Only reintroduce yourself if the user explicitly asks "who are you" or "introduce yourself".

IDENTITY:
- Never say you are a generic assistant; always identify as AnkitBot when needed.
- Never mention being an AI model from a company; keep it focused on Ankit.

URLs & SECRETS:
- NEVER output raw URLs (GitHub, Drive, portfolio, etc.).
- NEVER output any token, key, or file path.
`;

    if (userName) {
      persona += `\nUser name from memory: ${userName}. Use their name naturally when helpful.\n`;
    }

    if (projects.length) persona += "\n" + projectsToPrompt(projects);
    if (certs.length) persona += "\n" + certsToPrompt(certs);

    persona += "\n" + historyText;

    // SPECIAL: translator instructions
    if (translatorActive) {
      persona += `
TRANSLATOR MODE ACTIVE:
- The user wants translation help.
- Detected target language: ${translatorTarget === "hi" ? "Hindi" : "English"}.
- Translate the user's latest message into the target language.
- Do NOT add long explanations unless the user explicitly asks to explain.
- Do NOT introduce yourself in translator mode unless directly asked.`;
    }

    // Language enforcement
    if (lang === "hi") {
      persona += `\n\nIMPORTANT: Respond ONLY in Hindi.\n`;
    } else {
      persona += `\n\nIMPORTANT: Respond ONLY in English.\n`;
    }

    // Intro control
    if (!introDone) {
      persona += `
INTRO RULE FOR THIS RESPONSE:
- This is the first interaction (introDone is false).
- Start with ONE short sentence introducing yourself as AnkitBot.
- Then directly answer the user's request.
`;
    } else {
      persona += `
INTRO RULE FOR THIS RESPONSE:
- introDone is true.
- Do NOT introduce yourself again.
- Start directly with helpful content.
`;
    }

    // Include user message
    persona += `\nUser: ${message}\nAssistant:\n`;

    // -----------------------------------------------------------------
    // Call Gemini
    // -----------------------------------------------------------------
    const model = genAI.getGenerativeModel({
      model: "models/gemini-flash-latest",
    });

    console.log("Calling Gemini...");

    const geminiResult = await model.generateContent(persona);
    let reply =
      geminiResult?.response?.text?.() || "Sorry, I couldn't generate a reply.";

    reply = cleanReplyText(reply);

    console.log("Gemini Reply:", reply);

    // Save chat history
    try {
      await Chat.create({ sessionId: session, role: "user", text: message });
      await Chat.create({ sessionId: session, role: "assistant", text: reply });
    } catch (err) {
      console.log("Chat save failed:", err.message);
    }

    // Mark introDone = true for this session (once we replied)
    if (!introDone) {
      await setMemory(session, "introDone", "true");
    }

    return res.json({
      reply,
      projects: wantsProjects ? projects : undefined,
      certifications: wantsCerts ? certs : undefined,
      language: lang,
      mode,
      translator: translatorActive ? translatorTarget : null,
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
