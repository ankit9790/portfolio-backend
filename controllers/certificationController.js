
// controllers/certificationController.js
const Certification = require('../models/certification');

const getCertifications = async (req, res) => {
  try {
    const certs = await Certification.find().sort({ issueDate: -1 });
    res.json(certs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createCertification = async (req, res) => {
  try {
    const cert = new Certification(req.body);
    await cert.save();
    res.status(201).json(cert);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Bad request', error: err.message });
  }
};

const getCertificationById = async (req, res) => {
  try {
    const cert = await Certification.findById(req.params.id);
    if (!cert) return res.status(404).json({ message: 'Certification not found' });
    res.json(cert);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateCertification = async (req, res) => {
  try {
    const updated = await Certification.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: 'Certification not found' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Bad request', error: err.message });
  }
};

const deleteCertification = async (req, res) => {
  try {
    const removed = await Certification.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ message: 'Certification not found' });
    res.json({ message: 'Certification deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getCertifications,
  createCertification,
  getCertificationById,
  updateCertification,
  deleteCertification
};
