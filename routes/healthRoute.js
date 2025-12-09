const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Server is live 🔥",
    time: new Date().toISOString(),
  });
});

module.exports = router;
