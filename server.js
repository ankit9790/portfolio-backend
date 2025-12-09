const express = require("express");
const cors = require("cors");
require("dotenv").config();

require("./connection");

const projectRoute = require("./routes/projectRoute");
const certificationRoute = require("./routes/certificationRoute");
const aiRoute = require("./routes/ai");
const memoryRoute = require("./routes/memoryRoute");
const modeRoute = require("./routes/modeRoute");

const app = express();
const PORT = process.env.PORT || 5000;
app.use("/health", require("./routes/healthRoute"));


// Middlewares
app.use(cors());
app.use(express.json());

// Routes prefix
app.use("/api/projects", projectRoute);
app.use("/api/certifications", certificationRoute);
app.use("/api", aiRoute);
app.use("/api/memory", memoryRoute);
app.use("/api/mode", modeRoute);

// Error handling (basic)
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Internal server error" });
});

console.log("Gemini key loaded:", process.env.GEMINI_API_KEY?.slice(0, 12));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
