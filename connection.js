require("dotenv").config();
const mongoose = require("mongoose");

// SIMPLE MONGO CONNECTION
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch((err) => console.log("MongoDB Connection Error:", err));
