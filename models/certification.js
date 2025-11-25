// models/Certification.js
const mongoose = require("mongoose");

const CertificationSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },

  issuer: { type: String },

  issueDate: { 
    type: Date,
    required: true,
   },
   
  credentialUrl: { type: String },
  description: { type: String },
});

module.exports = mongoose.model("Certification", CertificationSchema);
