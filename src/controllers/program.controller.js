const db = require('../../config');
const { notifyAllBeneficiaries } = require('../services/notification.services');
const programsService = require('../services/programs.services');

// Map program status to a notification type and human-readable label
const getNotificationMeta = (status) => {
    switch ((status || '').toLowerCase()) {
        case 'ready':
            return { type: 'program_available', label: 'Now Ready for Applications' };
        case 'ongoing':
        case 'active':
            return { type: 'program_available', label: 'Now Open for Applications' };
        case 'pending':
            return { type: 'program_coming_soon', label: 'Coming Soon' };
        case 'completed':
            return { type: 'program_completed', label: 'Completed' };
        default:
            return { type: 'general', label: 'New Program' };
    }
};

// Create a new program (admin only)
exports.createProgram = async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ message: 'Only admin can create programs' });
        }

        const { name, location, slots, budget, status, start_date, end_date } = req.body;

        if (!name || !location || !slots || !budget) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const query = `
            INSERT INTO programs (program_name, location, slots, budget, status, start_date, end_date, filled, used)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
        `;

        const [result] = await db.execute(query, [
            name, location, slots, budget, status,
            start_date || null, end_date || null
        ]);

        const programId = result.insertId;

        // Notify all beneficiaries when a new program is created (every status)
        try {
            const { type, label } = getNotificationMeta(status);
            const dateInfo = start_date
                ? ` starting ${new Date(start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                : '';

            await notifyAllBeneficiaries({
                title: `${name} — ${label}`,
                message: `A new program "${name}" in ${location} is ${label.toLowerCase()}${dateInfo}. ${slots} slots available.`,
                type,
                program_id: programId,
            });
        } catch (notifError) {
            console.error('Failed to send program notifications:', notifError);
        }

        res.status(201).json({ 
            message: "Program created successfully!", 
            id: programId,
            program: {
                program_id: programId,
                name,
                location,
                slots,
                budget,
                status,
                start_date: start_date || null,
                end_date: end_date || null,
                filled: 0,
                used: 0
            }
        });
    } catch (error) {
        console.error("Error creating program:", error);
        res.status(500).json({ message: "Error creating program", error: error.message });
    }
};

// Get active/ongoing programs for beneficiary dashboard
exports.getReadyPrograms = async (req, res) => {
    try {
        const programs = await programsService.getReadyPrograms();
        res.status(200).json(programs);
    } catch (error) {
        console.error("Error fetching ready programs:", error);
        res.status(500).json({ message: "Error fetching ready programs", error: error.message });
    }
};

// Get all programs
exports.getAllPrograms = async (req, res) => {
    try {
        // Check if program_id column exists in applications table
        const [cols] = await db.execute(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'program_id'`
        );
        const hasProgramId = cols.length > 0;

        const query = hasProgramId
            ? `SELECT p.*,
                      COUNT(CASE WHEN a.status = 'Approved' THEN 1 END) AS approved_count
               FROM programs p
               LEFT JOIN applications a
                   ON a.program_id = p.program_id AND a.status = 'Approved'
               GROUP BY p.program_id
               ORDER BY p.program_id DESC`
            : `SELECT p.*, 0 AS approved_count
               FROM programs p
               ORDER BY p.program_id DESC`;

        const [programs] = await db.execute(query);
        res.status(200).json(programs);
    } catch (error) {
        console.error("Error fetching programs:", error);
        res.status(500).json({ message: "Error fetching programs", error: error.message });
    }
};

// Get active programs for a given program type (for beneficiary program picker)
exports.getActiveByType = async (req, res) => {
    try {
        const { programType } = req.params;
        const allowed = ['tupad', 'spes', 'dilp', 'gip', 'job_seekers'];
        if (!allowed.includes(programType.toLowerCase())) {
            return res.status(400).json({ message: 'Invalid program type' });
        }
        const [rows] = await db.execute(
            `SELECT program_id, program_name, location, slots, filled, budget, status, start_date, end_date
             FROM programs
             WHERE LOWER(program_name) LIKE CONCAT(LOWER(?), '%')
               AND status IN ('active', 'ongoing')
             ORDER BY start_date DESC`,
            [programType]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching active programs by type:', error);
        res.status(500).json({ message: 'Error fetching programs', error: error.message });
    }
};

// Get a single program
exports.getProgram = async (req, res) => {
    try {
        const { program_id } = req.params;
        const query = 'SELECT * FROM programs WHERE program_id = ?';
        const [program] = await db.execute(query, [program_id]);
        
        if (program.length === 0) {
            return res.status(404).json({ message: "Program not found" });
        }

        res.status(200).json(program[0]);
    } catch (error) {
        console.error("Error fetching program:", error);
        res.status(500).json({ message: "Error fetching program", error: error.message });
    }
};

// Update a program (admin only)
exports.updateProgram = async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ message: 'Only admin can update programs' });
        }

        const { program_id } = req.params;
        const { name, location, slots, budget, status, start_date, end_date } = req.body;

        const [existingRows] = await db.execute(
            'SELECT status FROM programs WHERE program_id = ?',
            [program_id]
        );

        if (existingRows.length === 0) {
            return res.status(404).json({ message: "Program not found" });
        }

        const previousStatus = String(existingRows[0].status || '').toLowerCase();

        const query = `
            UPDATE programs 
            SET program_name = ?, location = ?, slots = ?, budget = ?, status = ?, start_date = ?, end_date = ?
            WHERE program_id = ?
        `;

        const [result] = await db.execute(query, [
            name, location, slots, budget, status,
            start_date || null, end_date || null,
            program_id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Program not found" });
        }

        const newStatus = (status || '').toLowerCase();
        if (newStatus === 'ready' && previousStatus !== 'ready') {
            try {
                await notifyAllBeneficiaries({
                    title: `${name} — Now Ready for Applications!`,
                    message: `Program "${name}" in ${location} is now accepting applicants. ${slots} slots available. Apply now!`,
                    type: 'program_available',
                    program_id: parseInt(program_id, 10),
                });
            } catch (notifError) {
                console.error('Failed to send ready program notifications:', notifError);
            }
        }

        res.status(200).json({ message: "Program updated successfully!" });
    } catch (error) {
        console.error("Error updating program:", error);
        res.status(500).json({ message: "Error updating program", error: error.message });
    }
};

// Delete a program (admin only)
exports.deleteProgram = async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ message: 'Only admin can delete programs' });
        }

        const { program_id } = req.params;
        
        const query = 'DELETE FROM programs WHERE program_id = ?';
        const [result] = await db.execute(query, [program_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Program not found" });
        }

        res.status(200).json({ message: "Program deleted successfully!" });
    } catch (error) {
        console.error("Error deleting program:", error);
        res.status(500).json({ message: "Error deleting program", error: error.message });
    }
};
