// routes/certificationRoutes.js
const express = require("express");
const router = express.Router();
const certController = require("../controllers/certificationController");

router.get("/", certController.getCertifications);
router.get("/:id", certController.getCertificationById);
router.post("/", certController.createCertification);
router.put("/:id", certController.updateCertification);
router.delete("/:id", certController.deleteCertification);

module.exports = router;
