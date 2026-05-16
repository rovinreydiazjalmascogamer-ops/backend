const express = require('express');
const router = express.Router();
const programController = require('../controllers/program.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { validateProgram, validateBudgetUpdate } = require('../validators/program.validators');

// Get all programs (authenticated users)
router.get('/allPrograms', authMiddleware, programController.getAllPrograms);

// Get READY programs for beneficiary dashboard
router.get('/ready', authMiddleware, programController.getReadyPrograms);

// Get active programs by type (for beneficiary program picker)
router.get('/active/:programType', authMiddleware, programController.getActiveByType);

// Get a single program
router.get('/:program_id', authMiddleware, programController.getProgram);

// Create a new program (admin only — controller verifies role + validator checks data)
router.post('/', authMiddleware, validateProgram, programController.createProgram);

// Update a program (validator ensures budget ≥ used)
router.put('/:program_id', authMiddleware, validateProgram, validateBudgetUpdate, programController.updateProgram);

// Delete a program
router.delete('/:program_id', authMiddleware, programController.deleteProgram);

module.exports = router;
