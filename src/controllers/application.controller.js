const fs = require('fs');
const path = require('path');
const db = require('../../config');
const ExcelJS = require('exceljs');
const { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, ImageRun, AlignmentType, WidthType } = require('docx');
const tupadService = require('../services/tupad.services');
const dilpService = require('../services/dilp.services');
const spesService = require('../services/spes.services');
const gipService = require('../services/gip.services');
const jobseekerService = require('../services/jobseeker.services');
const beneficiaryService = require('../services/beneficiary.services');

/** @param {string|Date|null|undefined} birthDate */
function annexCalculateAge(birthDate) {
    if (!birthDate) return '';
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

/**
 * @param {import('exceljs').Worksheet} ws
 * @param {number} headerRow
 * @param {{ width: number }[]} headers
 */
function annexWriteHeaderRow(ws, headerRow, headers) {
    headers.forEach((h, i) => {
        ws.getColumn(i + 1).width = h.width;
    });
    const headerRowObj = ws.getRow(headerRow);
    headers.forEach((h, i) => {
        const cell = headerRowObj.getCell(i + 1);
        cell.value = h.header;
        cell.font = { bold: true, size: 9, name: 'Arial' };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        cell.border = {
            top: { style: 'thin' },
            bottom: { style: 'thin' },
            left: { style: 'thin' },
            right: { style: 'thin' }
        };
    });
    headerRowObj.height = 30;
}

/**
 * @param {import('exceljs').Worksheet} ws
 * @param {number} headerRow
 * @param {unknown[][]} rows
 */
function annexWriteDataRows(ws, headerRow, rows) {
    rows.forEach((values, index) => {
        const dataRow = ws.getRow(headerRow + 1 + index);
        values.forEach((val, i) => {
            const cell = dataRow.getCell(i + 1);
            cell.value = val;
            cell.font = { size: 9, name: 'Arial' };
            cell.alignment = { vertical: 'middle', wrapText: true };
            cell.border = {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
        dataRow.height = 20;
    });
}

/**
 * @param {import('exceljs').Worksheet} ws
 * @param {string} lastCol e.g. 'N', 'P'
 * @param {number} sigRow
 */
function annexWriteSignatureBlock(ws, lastCol, sigRow) {
    ws.mergeCells(`A${sigRow}:D${sigRow}`);
    ws.getCell(`A${sigRow}`).value = 'Prepared by:';
    ws.getCell(`A${sigRow}`).font = { size: 10, name: 'Arial' };

    ws.mergeCells(`H${sigRow}:${lastCol}${sigRow}`);
    ws.getCell(`H${sigRow}`).value = 'Noted by:';
    ws.getCell(`H${sigRow}`).font = { size: 10, name: 'Arial' };

    ws.mergeCells(`A${sigRow + 2}:D${sigRow + 2}`);
    ws.getCell(`A${sigRow + 2}`).value = '______________________________';
    ws.getCell(`A${sigRow + 2}`).alignment = { horizontal: 'center' };

    ws.mergeCells(`A${sigRow + 3}:D${sigRow + 3}`);
    ws.getCell(`A${sigRow + 3}`).value = 'PESO Manager';
    ws.getCell(`A${sigRow + 3}`).font = { size: 9, name: 'Arial', italic: true };
    ws.getCell(`A${sigRow + 3}`).alignment = { horizontal: 'center' };

    ws.mergeCells(`H${sigRow + 2}:${lastCol}${sigRow + 2}`);
    ws.getCell(`H${sigRow + 2}`).value = '______________________________';
    ws.getCell(`H${sigRow + 2}`).alignment = { horizontal: 'center' };

    ws.mergeCells(`H${sigRow + 3}:${lastCol}${sigRow + 3}`);
    ws.getCell(`H${sigRow + 3}`).value = 'Municipal Mayor / Authorized Representative';
    ws.getCell(`H${sigRow + 3}`).font = { size: 9, name: 'Arial', italic: true };
    ws.getCell(`H${sigRow + 3}`).alignment = { horizontal: 'center' };
}

function createImageRun(imagePath) {
    if (!imagePath) {
        return null;
    }

    const normalizedPath = imagePath.replace(/^\//, '');
    const absoluteImagePath = path.isAbsolute(imagePath)
        ? imagePath
        : path.join(__dirname, '../../', normalizedPath);

    if (!fs.existsSync(absoluteImagePath)) {
        return null;
    }

    const imageBuffer = fs.readFileSync(absoluteImagePath);
    const fileExt = path.extname(absoluteImagePath).toLowerCase();
    const supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

    if (!supportedExtensions.includes(fileExt)) {
        return null;
    }

    return new ImageRun({
        data: imageBuffer,
        transformation: {
            width: 450,
            height: 300,
        },
    });
}

function buildPhotoParagraphs(label, photoPath) {
    const children = [
        new Paragraph({
            children: [
                new TextRun({
                    text: `${label}`,
                    bold: true,
                    size: 24,
                    font: 'Arial',
                }),
            ],
            spacing: { before: 200, after: 100 },
        }),
    ];

    const imageRun = createImageRun(photoPath);
    if (imageRun) {
        children.push(
            new Paragraph({
                children: [imageRun],
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
            })
        );
    } else {
        children.push(
            new Paragraph({
                children: [
                    new TextRun({
                        text: photoPath ? `Photo file not found: ${photoPath}` : 'No photo available',
                        size: 22,
                        font: 'Arial',
                        italics: true,
                    }),
                ],
                spacing: { after: 200 },
            })
        );
    }

    return children;
}

// tupad application endpoint
exports.applyToTupad = async (req, res) => {
    try {
        const data = req.body;
        if (!data.user_id && req.user?.id) {
            data.user_id = req.user.id;
        }
        if (!data.user_id) {
            return res.status(400).json({ message: 'user_id is required' });
        }

        const result = await tupadService.applyTupad(data);
        res.status(201).json({ message: 'TUPAD application submitted', application_id: result.application_id });
    } catch (error) {
        console.error('TUPAD submission error:', error.message || error);
        res.status(500).json({ message: error.message || 'Error saving TUPAD application' });
    }
};

exports.createTupadReport = async (req, res) => {
    try {
        const { program_id, period_of_work, detail_of_work } = req.body;
        if (!program_id || !period_of_work || !detail_of_work) {
            return res.status(400).json({ message: 'program_id, period_of_work, and detail_of_work are required' });
        }

        const createdBy = req.user?.id;
        if (!createdBy) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const query = `
            INSERT INTO tupad_reports (program_id, period_of_work, detail_of_work, created_by)
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await db.execute(query, [program_id, period_of_work, detail_of_work, createdBy]);

        res.status(201).json({ message: 'TUPAD report created successfully', report_id: result.insertId });
    } catch (error) {
        console.error('Error creating TUPAD report:', error.message || error);
        res.status(500).json({ message: 'Failed to create TUPAD report', error: error.message || error });
    }
};

exports.uploadTupadReportPhotos = async (req, res) => {
    try {
        const { reportId } = req.params;
        const files = req.files || {};
        const updateFields = [];
        const params = [];

        if (files.before_photo?.[0]) {
            updateFields.push('before_photo_path = ?');
            params.push(files.before_photo[0].path);
        }
        if (files.during_photo?.[0]) {
            updateFields.push('during_photo_path = ?');
            params.push(files.during_photo[0].path);
        }
        if (files.after_photo?.[0]) {
            updateFields.push('after_photo_path = ?');
            params.push(files.after_photo[0].path);
        }

        if (!updateFields.length) {
            return res.status(400).json({ message: 'No photos were uploaded' });
        }

        params.push(reportId);
        const query = `UPDATE tupad_reports SET ${updateFields.join(', ')} WHERE report_id = ?`;
        const [result] = await db.execute(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Report not found' });
        }

        const urls = {};
        if (files.before_photo?.[0]) urls.before_photo_url = `/uploads/tupad-report-photos/${path.basename(files.before_photo[0].path)}`;
        if (files.during_photo?.[0]) urls.during_photo_url = `/uploads/tupad-report-photos/${path.basename(files.during_photo[0].path)}`;
        if (files.after_photo?.[0]) urls.after_photo_url = `/uploads/tupad-report-photos/${path.basename(files.after_photo[0].path)}`;

        res.status(200).json({ message: 'Photos uploaded successfully', urls });
    } catch (error) {
        console.error('Error uploading TUPAD report photos:', error.message || error);
        res.status(500).json({ message: 'Failed to upload photos', error: error.message || error });
    }
};

exports.getTupadReports = async (req, res) => {
    try {
        const programId = req.query.program_id ? Number(req.query.program_id) : null;
        const whereClause = programId ? 'WHERE program_id = ?' : '';
        const params = programId ? [programId] : [];
        const query = `SELECT * FROM tupad_reports ${whereClause} ORDER BY created_at DESC`;
        const [reports] = await db.execute(query, params);
        res.status(200).json(reports);
    } catch (error) {
        console.error('Error fetching TUPAD reports:', error.message || error);
        res.status(500).json({ message: 'Failed to fetch TUPAD reports', error: error.message || error });
    }
};

exports.getTupadReport = async (req, res) => {
    try {
        const { reportId } = req.params;
        const query = 'SELECT * FROM tupad_reports WHERE report_id = ?';
        const [reports] = await db.execute(query, [reportId]);
        if (!Array.isArray(reports) || reports.length === 0) {
            return res.status(404).json({ message: 'Report not found' });
        }
        res.status(200).json(reports[0]);
    } catch (error) {
        console.error('Error fetching TUPAD report:', error.message || error);
        res.status(500).json({ message: 'Failed to fetch TUPAD report', error: error.message || error });
    }
};

// Apply to SPES program
exports.applyToSpes = async (req, res) => {
    try {
        const data = req.body;
        if (!data.user_id && req.user?.id) {
            data.user_id = req.user.id;
        }
        if (!data.user_id) {
            return res.status(400).json({ message: 'User ID is required for SPES application' });
        }

        const result = await spesService.applyToSpes(data);
        res.status(201).json({ message: "SPES Application Success!", id: result.insertId });
        
    } catch (error) {
        console.error("SPES Application Error:", error.message);
        res.status(500).json({ message: "Error submitting SPES application", error: error.message });
    }
};

// Get SPES details by application ID
exports.getSpesDetails = async (req, res) => {
    try {
        const { applicationId } = req.params;
        const details = await spesService.getSpesDetails(applicationId);
        if (!details) {
            return res.status(404).json({ message: "SPES details not found" });
        }
        res.status(200).json(details);
    } catch (error) {
        console.error("Error fetching SPES details:", error.message);
        res.status(500).json({ message: "Error fetching SPES details", error: error.message });
    }
};

// Update SPES details
exports.updateSpesDetails = async (req, res) => {
    try {
        const { detailId } = req.params;
        const result = await spesService.updateSpesDetails(detailId, req.body);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "SPES details not found" });
        }
        res.status(200).json({ message: "SPES details updated successfully!" });
    } catch (error) {
        console.error("Error updating SPES details:", error.message);
        res.status(500).json({ message: "Error updating SPES details", error: error.message });
    }
};

// Create SPES details (for editing when details don't exist yet)
exports.createSpesDetails = async (req, res) => {
    try {
        const query = `
            INSERT INTO spes_details (
                application_id, gsis_beneficiary, place_of_birth, citizenship,
                social_media_account, status, sex, type_of_student, parent_status,
                is_pwd, is_senior_citizen, is_indigenous_people, is_displaced_worker, is_ofw_descendant,
                father_name, father_occupation, father_contact,
                mother_maiden_name, mother_occupation, mother_contact,
                education_level, name_of_school, degree_earned_course, year_level_grade, date_of_attendance,
                present_address, permanent_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            req.body.application_id,
            req.body.gsis_beneficiary || null,
            req.body.place_of_birth || null,
            req.body.citizenship || 'Filipino',
            req.body.social_media_account || null,
            req.body.status,
            req.body.sex,
            req.body.type_of_student,
            req.body.parent_status,
            req.body.is_pwd || false,
            req.body.is_senior_citizen || false,
            req.body.is_indigenous_people || false,
            req.body.is_displaced_worker || false,
            req.body.is_ofw_descendant || false,
            req.body.father_name || null,
            req.body.father_occupation || null,
            req.body.father_contact || null,
            req.body.mother_maiden_name || null,
            req.body.mother_occupation || null,
            req.body.mother_contact || null,
            req.body.education_level,
            req.body.name_of_school || null,
            req.body.degree_earned_course || null,
            req.body.year_level_grade || null,
            req.body.date_of_attendance || null,
            req.body.present_address || null,
            req.body.permanent_address || null
        ];

        const [result] = await db.execute(query, values);
        res.status(201).json({ message: "SPES details created successfully!", detailId: result.insertId });
    } catch (error) {
        console.error("Error creating SPES details:", error.message);
        res.status(500).json({ message: "Error creating SPES details", error: error.message });
    }
};

// Apply to DILP program (using central applications table)
exports.applyToDilp = async (req, res) => {
    try {
        const data = req.body;
        if (!data.user_id && req.user?.id) {
            data.user_id = req.user.id;
        }
        if (!data.user_id) {
            return res.status(400).json({ message: 'user_id is required' });
        }

        const result = await dilpService.applyToDilp(data);
        res.status(201).json({ message: 'DILP application submitted successfully', application_id: result.application_id });
    } catch (error) {
        console.error('DILP submission error:', error.message || error);
        if (error.message.includes('already have a pending')) {
            return res.status(409).json({ message: error.message });
        }
        res.status(500).json({ message: error.message || 'Error saving DILP application' });
    }
};

// Apply to GIP program
exports.applyToGip = async (req, res) => {
    try {
        const data = req.body;
        if (!data.user_id && req.user?.id) {
            data.user_id = req.user.id;
        }
        if (!data.user_id) {
            return res.status(400).json({ message: 'user_id is required' });
        }

        const result = await gipService.applyToGip(data);
        res.status(201).json({ message: 'GIP application submitted successfully', application_id: result.application_id });
    } catch (error) {
        console.error('GIP submission error:', error.message || error);
        if (error.message.includes('already have a pending')) {
            return res.status(409).json({ message: error.message });
        }
        res.status(500).json({ message: error.message || 'Error saving GIP application' });
    }
};

// Apply to Job Seekers program
exports.applyToJobSeekers = async (req, res) => {
    try {
        const data = req.body;
        if (!data.user_id && req.user?.id) {
            data.user_id = req.user.id;
        }
        if (!data.user_id) {
            return res.status(400).json({ message: 'user_id is required' });
        }

        const result = await jobseekerService.applyToJobSeekers(data);
        res.status(201).json({ message: 'Job Seekers application submitted successfully', application_id: result.application_id });
    } catch (error) {
        console.error('Job Seekers submission error:', error.message || error);
        if (error.message.includes('already have a pending')) {
            return res.status(409).json({ message: error.message });
        }
        res.status(500).json({ message: error.message || 'Error saving Job Seekers application' });
    }
};

// Get recent applications
exports.getRecentApplications = async (req, res) => {
    try {
        const limit = req.query.limit || 10;
        const isPrivileged = req.user?.role === 'admin' || req.user?.role === 'staff';
        const isBeneficiaryRequest = req.user?.role === 'beneficiary';
        const userId = isPrivileged
            ? (req.query.userId || null)
            : (isBeneficiaryRequest ? req.user?.id : null);
        const [applications] = await beneficiaryService.getRecentApplications(limit, userId);
        res.status(200).json(applications);
    } catch (error) {
        console.error("Error fetching recent applications:", error.message);
        res.status(500).json({ message: "Error fetching recent applications", error: error.message });
    }
};

// Get recent DILP applications
exports.getRecentDilpApplications = async (req, res) => {
    try {
        const limit = req.query.limit || 10;
        const [applications] = await dilpService.getDilpApplications(limit);
        res.status(200).json(applications);
    } catch (error) {
        console.error("Error fetching DILP applications:", error.message);
        res.status(500).json({ message: "Error fetching DILP applications", error: error.message });
    }
};

// Get DILP application by ID
exports.getDilpApplicationById = async (req, res) => {
    try {
        const { id } = req.params;
        const [application] = await dilpService.getDilpApplicationById(id);
        if (!application || application.length === 0) {
            return res.status(404).json({ message: "DILP application not found" });
        }
        res.status(200).json(application[0]);
    } catch (error) {
        console.error("Error fetching DILP application:", error.message);
        res.status(500).json({ message: "Error fetching DILP application", error: error.message });
    }
};

// Update DILP application status
exports.updateDilpStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }
        
        await dilpService.updateDilpStatus(id, status);
        res.status(200).json({ message: "DILP application status updated successfully" });
    } catch (error) {
        console.error("Error updating DILP application:", error.message);
        res.status(500).json({ message: "Error updating DILP application", error: error.message });
    }
};

// --- Application approval endpoints (beneficiary) ---
// Get all applications from all programs
exports.getAllApplications = async (req, res) => {
    try {
        const [applications] = await beneficiaryService.getAllApplications();
        res.status(200).json(applications);
    } catch (error) {
        console.error("Error fetching all applications:", error.message);
        res.status(500).json({ message: "Error fetching all applications", error: error.message });
    }
};

// fetch all pending applications
exports.getPendingApplications = async (req, res) => {
    try {
        const { programType } = req.query;
        const [applications] = await beneficiaryService.getPendingApplications(programType || null);
        res.status(200).json(applications);
    } catch (error) {
        console.error("Error getting pending apps:", error.message);
        res.status(500).json({ message: "Error fetching pending applications", error: error.message });
    }
};

// fetch apps filtered by status (query ?status=)
exports.getApplicationsByStatus = async (req, res) => {
    try {
        const { status, programType } = req.query;
        if (!status) {
            const [applications] = await beneficiaryService.getAllApplications();
            return res.status(200).json(applications);
        }
        const raw = String(status).trim();
        const statusCanon = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
        const statusNorm = statusCanon[raw.toLowerCase()] || raw;
        const includeEnrolledApproved =
            req.user?.role === 'admin' && statusNorm === 'Approved';
        const [applications] = await beneficiaryService.getApplicationsByStatus(statusNorm, programType || null, {
            includeEnrolledApproved,
        });
        res.status(200).json(applications);
    } catch (error) {
        console.error("Error getting applications by status:", error.message);
        res.status(500).json({ message: "Error fetching applications", error: error.message });
    }
};

// NEW: Get enrollment status for specific application
exports.getApplicationEnrollmentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const status = await beneficiaryService.getEnrollmentStatus(id);
        
        // Transform response to match frontend expectation
        const responseData = status ? {
            is_enrolled: status.current_status === 'Active',
            program_id: status.program_id
        } : {
            is_enrolled: false,
            program_id: null
        };
        
        res.status(200).json(responseData);
    } catch (error) {
        console.error("Error getting enrollment status:", error.message);
        res.status(500).json({ message: "Error checking enrollment status", error: error.message });
    }
};

// approve specific application by id
exports.approveApplication = async (req, res) => {
    try {
        const { id } = req.params;
        // #region agent log
        fetch('http://127.0.0.1:7500/ingest/a56af0b5-bb5d-4246-ae1b-60ffc6fa82e8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f3a7d7'},body:JSON.stringify({sessionId:'f3a7d7',runId:'approval-slot-debug',hypothesisId:'H1',location:'application.controller.js:approveApplication:entry',message:'approveApplication endpoint hit',data:{applicationId:Number(id)||null,actorRole:req.user?.role||null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        const result = await beneficiaryService.approveApplication(id);
        // #region agent log
        fetch('http://127.0.0.1:7500/ingest/a56af0b5-bb5d-4246-ae1b-60ffc6fa82e8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f3a7d7'},body:JSON.stringify({sessionId:'f3a7d7',runId:'approval-slot-debug',hypothesisId:'H1',location:'application.controller.js:approveApplication:afterService',message:'approveApplication service completed',data:{applicationId:result?.applicationId||null,userId:result?.userId||null,programType:result?.programType||null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        res.status(200).json({
            message: "Application approved successfully",
            applicationId: result.applicationId,
            userId: result.userId,
            programType: result.programType
        });
    } catch (error) {
        console.error("Error approving application:", error.message, error.sqlMessage || "");
        if (error.message === 'Invalid application ID') {
            return res.status(400).json({ message: error.message });
        }
        if (error.message === 'Application not found') {
            return res.status(404).json({ message: "Application not found" });
        }
        if (error.message === 'Application is already approved') {
            return res.status(409).json({ message: "Application is already approved" });
        }
        res.status(500).json({ message: "Error approving application", error: error.message });
    }
};

// Submit complete SPES application with form data and documents
exports.submitCompleteSPESApplication = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'User authentication required' });
        }

        const data = {
            ...req.body,
            user_id: userId
        };

        const result = await spesService.applyToSpes(data);
        res.status(201).json({
            message: 'SPES application submitted successfully with all form data',
            application_id: result.insertId || result.applicationId,
            user_id: userId
        });
    } catch (error) {
        console.error('Error submitting SPES application:', error.message);
        res.status(500).json({ message: 'Error submitting SPES application', error: error.message });
    }
};

// Submit complete GIP application with form data and documents
exports.submitCompleteGIPApplication = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'User authentication required' });
        }

        const data = {
            ...req.body,
            user_id: userId
        };

        const result = await gipService.applyToGip(data);
        res.status(201).json({
            message: 'GIP application submitted successfully with all form data',
            application_id: result.application_id,
            user_id: userId
        });
    } catch (error) {
        console.error('Error submitting GIP application:', error.message);
        res.status(500).json({ message: 'Error submitting GIP application', error: error.message });
    }
};

// Submit complete DILP application with form data and documents
exports.submitCompleteDILPApplication = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'User authentication required' });
        }

        const data = {
            ...req.body,
            user_id: userId
        };

        const result = await dilpService.applyToDilp(data);
        res.status(201).json({
            message: 'DILP application submitted successfully with all form data',
            application_id: result[0].insertId,
            user_id: userId
        });
    } catch (error) {
        console.error('Error submitting DILP application:', error.message);
        res.status(500).json({ message: 'Error submitting DILP application', error: error.message });
    }
};

// reject application with optional reason in body
exports.rejectApplication = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        await beneficiaryService.rejectApplication(id, reason);
        res.status(200).json({ message: "Application rejected successfully" });
    } catch (error) {
        console.error("Error rejecting application:", error.message);
        if (error.message === 'Invalid application ID') {
            return res.status(400).json({ message: error.message });
        }
        if (error.message === 'Application not found') {
            return res.status(404).json({ message: "Application not found" });
        }
        res.status(500).json({ message: "Error rejecting application", error: error.message });
    }
};

// approved tupad application 
exports.approvedTupadApplication = async (req, res) => {
    try {
        const { id } = req.params;
        await tupadService.approveTupadApplication(id);
        res.status(200).json({ message: "Tupad application approved successfully!" });
    } catch (error) {
        console.error("Error approving Tupad Application", error.message);
        if (error.message === 'Application not found') {
            return res.status(404).json({ message: "TUPAD application not found" });
        }
        res.status(500).json({ message: "Error approving TUPAD application", error: error.message });
    }
};

// Get current beneficiary status summary + submissions history.
exports.getApplicationStatus = async (req, res) => {
    try {
        // Only admin/staff can look up other users; beneficiaries always use their own ID
        const isPrivileged = req.user?.role === 'admin' || req.user?.role === 'staff';
        const userId = isPrivileged
            ? Number(req.query.userId || req.user?.id)
            : Number(req.user?.id);
        if (!userId) {
            return res.status(400).json({ message: 'userId is required' });
        }

        const data = await beneficiaryService.getUserApplicationStatus(userId);
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching application status:', error.message);
        res.status(500).json({ message: 'Error fetching application status', error: error.message });
    }
};

exports.exportApplications = async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ message: 'Only admin can export applications' });
        }

        const { programType, status } = req.query;
        const normalizedStatus = status ? String(status) : null;

        if (normalizedStatus && !['Pending', 'Approved'].includes(normalizedStatus)) {
            return res.status(400).json({ message: 'Status must be Pending or Approved for export' });
        }

        const rows = await beneficiaryService.getApplicationsForExport(
            programType || null,
            normalizedStatus || null
        );

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Applications');

        worksheet.columns = [
            { header: 'Application ID', key: 'id', width: 14 },
            { header: 'User ID', key: 'user_id', width: 10 },
            { header: 'Program Type', key: 'program_type', width: 14 },
            { header: 'First Name', key: 'first_name', width: 18 },
            { header: 'Middle Name', key: 'middle_name', width: 18 },
            { header: 'Last Name', key: 'last_name', width: 18 },
            { header: 'Contact Number', key: 'contact_number', width: 18 },
            { header: 'Address', key: 'address', width: 28 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Rejection Reason', key: 'rejection_reason', width: 24 },
            { header: 'Applied At', key: 'applied_at', width: 20 },
            { header: 'Approval Date', key: 'approval_date', width: 20 }
        ];

        rows.forEach((row) => worksheet.addRow(row));

        const safeProgram = (programType || 'all').toString().replace(/\s+/g, '_');
        const safeStatus = (normalizedStatus || 'all').toString().toLowerCase();
        const filename = `applications_${safeStatus}_${safeProgram}.xlsx`;

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting applications:', error.message);
        res.status(500).json({ message: 'Error exporting applications', error: error.message });
    }
};

exports.getTupadMonthlyReport = async (req, res) => {
    try {
        const month = req.query.month;
        const report = await beneficiaryService.getTupadMonthlyReport(month);
        res.status(200).json(report);
    } catch (error) {
        console.error('Error generating TUPAD monthly report:', error.message);
        res.status(500).json({ message: 'Error generating monthly report', error: error.message });
    }
};

// =============================================
// Daily Wage Settings
// =============================================
exports.getDailyWage = async (req, res) => {
    try {
        const wage = await beneficiaryService.getDailyWage();
        res.status(200).json({ daily_wage: wage });
    } catch (error) {
        console.error('Error fetching daily wage:', error.message);
        res.status(500).json({ message: 'Error fetching daily wage', error: error.message });
    }
};

exports.updateDailyWage = async (req, res) => {
    try {
        const { daily_wage } = req.body;
        if (daily_wage === undefined || daily_wage === null) {
            return res.status(400).json({ message: 'daily_wage is required' });
        }
        const wage = parseFloat(daily_wage);
        if (isNaN(wage) || wage <= 0) {
            return res.status(400).json({ message: 'Daily wage must be a positive number' });
        }
        if (wage > 100000) {
            return res.status(400).json({ message: 'Daily wage cannot exceed ₱100,000' });
        }
        const updatedWage = await beneficiaryService.updateDailyWage(wage);
        res.status(200).json({ message: 'Daily wage updated successfully', daily_wage: updatedWage });
    } catch (error) {
        console.error('Error updating daily wage:', error.message);
        res.status(400).json({ message: error.message });
    }
};

// =============================================
// Admin: Get TUPAD details by application ID
// =============================================
exports.getTupadDetails = async (req, res) => {
    try {
        const { applicationId } = req.params;
        const details = await tupadService.getTupadDetails(applicationId);
        if (!details) {
            return res.status(404).json({ message: "TUPAD details not found" });
        }
        res.status(200).json(details);
    } catch (error) {
        console.error("Error fetching TUPAD details:", error.message);
        res.status(500).json({ message: "Error fetching TUPAD details", error: error.message });
    }
};

// Admin: Update TUPAD details
exports.updateTupadDetails = async (req, res) => {
    try {
        const { detailId } = req.params;
        const result = await tupadService.updateTupadDetails(detailId, req.body);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "TUPAD details not found" });
        }
        res.status(200).json({ message: "TUPAD details updated successfully!" });
    } catch (error) {
        console.error("Error updating TUPAD details:", error.message);
        res.status(500).json({ message: "Error updating TUPAD details", error: error.message });
    }
};

// Admin: Update beneficiary personal info (for any program)
exports.updateApplicationBeneficiary = async (req, res) => {
    try {
        if (req.user?.role !== 'admin' && req.user?.role !== 'staff') {
            return res.status(403).json({ message: 'Admin or staff access required' });
        }

        const { applicationId } = req.params;
        const { first_name, last_name, middle_name, birth_date, gender, civil_status, contact_number, address } = req.body;

        if (!first_name || !last_name) {
            return res.status(400).json({ message: 'first_name and last_name are required' });
        }

        if (first_name.trim().length < 2 || last_name.trim().length < 2) {
            return res.status(400).json({ message: 'Names must be at least 2 characters' });
        }

        if (birth_date) {
            const bd = new Date(birth_date);
            if (isNaN(bd.getTime()) || bd > new Date()) {
                return res.status(400).json({ message: 'Birth date must be a valid date in the past' });
            }
        }

        const validGenders = ['Male', 'Female', 'Other'];
        if (gender && !validGenders.includes(gender)) {
            return res.status(400).json({ message: `Gender must be one of: ${validGenders.join(', ')}` });
        }

        const validCivilStatuses = ['Single', 'Married', 'Widowed', 'Divorced', 'Separated'];
        if (civil_status && !validCivilStatuses.includes(civil_status)) {
            return res.status(400).json({ message: `Civil status must be one of: ${validCivilStatuses.join(', ')}` });
        }

        if (!first_name || !last_name) {
            return res.status(400).json({ message: 'first_name and last_name are required' });
        }

        // Find the beneficiary linked to this application
        const [apps] = await db.execute('SELECT user_id FROM applications WHERE application_id = ?', [applicationId]);
        if (apps.length === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }

        const userId = apps[0].user_id;

        // Update beneficiary record
        const [result] = await db.execute(
            `UPDATE beneficiaries SET
                first_name = ?, middle_name = ?, last_name = ?,
                birth_date = ?, gender = ?, civil_status = ?,
                contact_number = ?, address = ?
             WHERE user_id = ?`,
            [
                first_name,
                middle_name || null,
                last_name,
                birth_date || null,
                gender || null,
                civil_status || null,
                contact_number || null,
                address || null,
                userId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Beneficiary record not found for this application' });
        }

        res.status(200).json({ message: 'Beneficiary info updated successfully' });
    } catch (error) {
        console.error('Error updating beneficiary info:', error.message);
        res.status(500).json({ message: 'Error updating beneficiary info', error: error.message });
    }
};

// =============================================
// Annex D Excel Export (TUPAD format from PESO)
// =============================================
exports.exportAnnexD = async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ message: 'Only admin can export Annex D' });
        }

        const query = `
            SELECT
                b.beneficiary_id,
                b.first_name,
                b.middle_name,
                b.last_name,
                b.extension_name,
                b.birth_date,
                b.gender,
                b.civil_status,
                b.contact_number,
                b.address,
                a.application_id,
                a.program_type,
                a.approval_date,
                a.applied_at,
                td.valid_id_type,
                td.id_number,
                td.occupation,
                td.monthly_income,
                td.work_category,
                td.job_preference,
                td.educational_attainment
            FROM applications a
            LEFT JOIN beneficiaries b ON b.user_id = a.user_id
            LEFT JOIN tupad_details td ON td.application_id = a.application_id
            WHERE a.status = 'Approved' AND a.program_type = 'tupad'
            ORDER BY b.last_name ASC, b.first_name ASC
        `;

        const [rows] = await db.execute(query);

        // Build Annex D Excel
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'PESO Management System';
        workbook.created = new Date();

        const ws = workbook.addWorksheet('Annex D', {
            pageSetup: {
                paperSize: 9, // A4
                orientation: 'landscape',
                fitToPage: true,
                fitToWidth: 1,
                margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 }
            }
        });

        // ── Header rows ──
        // Row 1: Title
        ws.mergeCells('A1:V1');
        const titleCell = ws.getCell('A1');
        titleCell.value = 'ANNEX D';
        titleCell.font = { bold: true, size: 14, name: 'Arial' };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Row 2: Subtitle
        ws.mergeCells('A2:V2');
        const subtitleCell = ws.getCell('A2');
        subtitleCell.value = 'LIST OF TUPAD BENEFICIARIES';
        subtitleCell.font = { bold: true, size: 12, name: 'Arial' };
        subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Row 3: Program Info
        ws.mergeCells('A3:V3');
        const programCell = ws.getCell('A3');
        programCell.value = 'TUPAD (Tulong Panghanapbuhay sa Ating Disadvantaged/Displaced Workers)';
        programCell.font = { italic: true, size: 10, name: 'Arial' };
        programCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Row 4: blank spacer
        ws.mergeCells('A4:V4');

        // Row 5: Info fields
        ws.mergeCells('A5:D5');
        ws.getCell('A5').value = 'PESO/LGU: ________________________________________';
        ws.getCell('A5').font = { size: 10, name: 'Arial' };
        ws.mergeCells('E5:H5');
        ws.getCell('E5').value = 'Date: ' + new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
        ws.getCell('E5').font = { size: 10, name: 'Arial' };
        ws.mergeCells('I5:V5');
        ws.getCell('I5').value = 'Project: ________________________________________';
        ws.getCell('I5').font = { size: 10, name: 'Arial' };

        // Row 6: blank spacer
        ws.mergeCells('A6:V6');

        // Row 7-8: Annex D grouped headers
        const headerTopRow = 7;
        const headerSubRow = 8;

        const columnDefs = [
            { key: 'no', width: 5 },
            { key: 'first_name', width: 14 },
            { key: 'middle_name', width: 14 },
            { key: 'last_name', width: 14 },
            { key: 'extension_name', width: 8 },
            { key: 'bf_class', width: 10 },
            { key: 'street_or_lot', width: 14 },
            { key: 'barangay', width: 12 },
            { key: 'city_municipality', width: 14 },
            { key: 'district', width: 11 },
            { key: 'id_type', width: 12 },
            { key: 'id_no', width: 14 },
            { key: 'contact_no', width: 12 },
            { key: 'signature', width: 12 },
            { key: 'type_of_education', width: 14 },
            { key: 'occupation', width: 14 },
            { key: 'sex', width: 8 },
            { key: 'civil_status', width: 10 },
            { key: 'age', width: 6 },
            { key: 'avg_monthly_income', width: 14 },
            { key: 'dependents', width: 11 },
            { key: 'interest_livelihood', width: 20 },
        ];
        columnDefs.forEach((col, idx) => {
            ws.getColumn(idx + 1).width = col.width;
        });

        // Group headers (top row)
        ws.mergeCells('A7:A8');
        ws.getCell('A7').value = 'No.';

        ws.mergeCells('B7:E7');
        ws.getCell('B7').value = 'Name of Beneficiary';

        ws.mergeCells('F7:F8');
        ws.getCell('F7').value = "BF's Class";

        ws.mergeCells('G7:J7');
        ws.getCell('G7').value = 'Project Location';

        ws.mergeCells('K7:K8');
        ws.getCell('K7').value = 'Type of ID';

        ws.mergeCells('L7:L8');
        ws.getCell('L7').value = 'ID No.';

        ws.mergeCells('M7:M8');
        ws.getCell('M7').value = 'Contact No.';

        ws.mergeCells('N7:N8');
        ws.getCell('N7').value = 'Signature of beneficiary acknowledging receipt';

        ws.mergeCells('O7:O8');
        ws.getCell('O7').value = 'Type of education';

        ws.mergeCells('P7:P8');
        ws.getCell('P7').value = 'Occupation';

        ws.mergeCells('Q7:Q8');
        ws.getCell('Q7').value = 'Sex';

        ws.mergeCells('R7:R8');
        ws.getCell('R7').value = 'Civil Status';

        ws.mergeCells('S7:S8');
        ws.getCell('S7').value = 'Age';

        ws.mergeCells('T7:T8');
        ws.getCell('T7').value = 'Average monthly income';

        ws.mergeCells('U7:U8');
        ws.getCell('U7').value = 'Dependents';

        ws.mergeCells('V7:V8');
        ws.getCell('V7').value = 'Interested in joining other livelihood program?';

        // Sub headers (second row)
        ws.getCell('B8').value = 'First Name';
        ws.getCell('C8').value = 'Middle Name';
        ws.getCell('D8').value = 'Last Name';
        ws.getCell('E8').value = 'Extension Name';
        ws.getCell('G8').value = 'Street / Lot No.';
        ws.getCell('H8').value = 'Barangay';
        ws.getCell('I8').value = 'City / Municipality';
        ws.getCell('J8').value = 'District';

        // Apply style for both header rows
        for (let rowNo = headerTopRow; rowNo <= headerSubRow; rowNo++) {
            const row = ws.getRow(rowNo);
            for (let c = 1; c <= 22; c++) {
                const cell = row.getCell(c);
                cell.font = { bold: true, size: 9, name: 'Arial' };
                cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
                cell.border = {
                    top: { style: 'thin' },
                    bottom: { style: 'thin' },
                    left: { style: 'thin' },
                    right: { style: 'thin' }
                };
            }
            row.height = rowNo === headerTopRow ? 22 : 28;
        }

        const splitAddress = (addressValue) => {
            const parts = String(addressValue || '').split(',').map((p) => p.trim()).filter(Boolean);
            return {
                sitio: parts[0] || '',
                barangay: parts[1] || parts[0] || '',
                cityMunicipality: parts[2] || '',
                district: parts[3] || '',
            };
        };

        const dataRows = rows.map((row, index) => {
            const age = annexCalculateAge(row.birth_date);
            const location = splitAddress(row.address);
            return [
                index + 1,
                (row.first_name || '').toUpperCase(),
                (row.middle_name || '').toUpperCase(),
                (row.last_name || '').toUpperCase(),
                (row.extension_name || '').toUpperCase(),
                '', // BF's class is not stored yet
                location.sitio || '',
                location.barangay,
                location.cityMunicipality,
                location.district,
                row.valid_id_type || '',
                row.id_number || '',
                row.contact_number || '',
                '', // signature captured physically on printed sheet
                row.educational_attainment || '',
                row.occupation || '',
                row.gender || '',
                row.civil_status || '',
                age === '' ? '' : age,
                row.monthly_income ?? '',
                '', // dependents not captured in TUPAD form yet
                row.job_preference || '',
            ];
        });

        annexWriteDataRows(ws, headerSubRow, dataRows);

        // Note: Annex D (TUPAD) does not include a signature block.
        const filename = `Annex_D_TUPAD_Beneficiaries_${new Date().toISOString().slice(0, 10)}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting Annex D:', error.message);
        res.status(500).json({ message: 'Error exporting Annex D', error: error.message });
    }
};

// =============================================
// Annex B Excel Export (SPES beneficiaries)
// =============================================
exports.exportAnnexB = async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ message: 'Only admin can export Annex B' });
        }

        const query = `
            SELECT
                b.first_name,
                b.middle_name,
                b.last_name,
                b.extension_name,
                b.birth_date,
                b.gender,
                b.civil_status AS beneficiary_civil_status,
                b.contact_number,
                b.address,
                sd.type_of_student,
                sd.education_level,
                sd.name_of_school,
                sd.degree_earned_course,
                sd.year_level,
                sd.present_address,
                sd.civil_status AS spes_civil_status,
                sd.sex AS spes_sex
            FROM applications a
            LEFT JOIN beneficiaries b ON b.user_id = a.user_id
            LEFT JOIN spes_details sd ON sd.application_id = a.application_id
            WHERE a.status = 'Approved' AND a.program_type = 'spes'
            ORDER BY b.last_name ASC, b.first_name ASC
        `;

        const [rows] = await db.execute(query);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'PESO Management System';
        workbook.created = new Date();

        const ws = workbook.addWorksheet('Annex B', {
            pageSetup: {
                paperSize: 9,
                orientation: 'landscape',
                fitToPage: true,
                fitToWidth: 1,
                margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 }
            }
        });

        ws.mergeCells('A1:P1');
        ws.getCell('A1').value = 'ANNEX B';
        ws.getCell('A1').font = { bold: true, size: 14, name: 'Arial' };
        ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells('A2:P2');
        ws.getCell('A2').value = 'LIST OF SPES BENEFICIARIES';
        ws.getCell('A2').font = { bold: true, size: 12, name: 'Arial' };
        ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells('A3:P3');
        ws.getCell('A3').value = 'SPES — Special Program for Employment of Students';
        ws.getCell('A3').font = { italic: true, size: 10, name: 'Arial' };
        ws.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells('A4:P4');
        ws.mergeCells('A5:D5');
        ws.getCell('A5').value = 'PESO/LGU: ________________________________________';
        ws.getCell('A5').font = { size: 10, name: 'Arial' };
        ws.mergeCells('E5:I5');
        ws.getCell('E5').value = 'Date: ' + new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
        ws.getCell('E5').font = { size: 10, name: 'Arial' };
        ws.mergeCells('J5:P5');
        ws.getCell('J5').value = 'Employer / Agency: ________________________________________';
        ws.getCell('J5').font = { size: 10, name: 'Arial' };
        ws.mergeCells('A6:P6');

        const headerRow = 7;
        const headers = [
            { header: 'No.', width: 5 },
            { header: 'LAST NAME', width: 14 },
            { header: 'FIRST NAME', width: 14 },
            { header: 'MIDDLE NAME', width: 12 },
            { header: 'EXT.', width: 5 },
            { header: 'DATE OF BIRTH', width: 12 },
            { header: 'AGE', width: 5 },
            { header: 'SEX', width: 7 },
            { header: 'CIVIL STATUS', width: 12 },
            { header: 'TYPE OF STUDENT', width: 14 },
            { header: 'EDUCATION LEVEL', width: 12 },
            { header: 'SCHOOL', width: 18 },
            { header: 'COURSE / DEGREE', width: 18 },
            { header: 'YEAR LEVEL', width: 10 },
            { header: 'PRESENT ADDRESS', width: 24 },
            { header: 'CONTACT NO.', width: 14 },
        ];

        annexWriteHeaderRow(ws, headerRow, headers);

        const dataRows = rows.map((row, index) => [
            index + 1,
            (row.last_name || '').toUpperCase(),
            (row.first_name || '').toUpperCase(),
            (row.middle_name || '').toUpperCase(),
            row.extension_name || '',
            row.birth_date ? new Date(row.birth_date).toLocaleDateString('en-PH') : '',
            annexCalculateAge(row.birth_date),
            row.gender || row.spes_sex || '',
            row.beneficiary_civil_status || row.spes_civil_status || '',
            row.type_of_student || '',
            row.education_level || '',
            row.name_of_school || '',
            row.degree_earned_course || '',
            row.year_level || '',
            row.present_address || row.address || '',
            row.contact_number || '',
        ]);

        annexWriteDataRows(ws, headerRow, dataRows);

        const sigRow = headerRow + rows.length + 3;
        annexWriteSignatureBlock(ws, 'P', sigRow);

        const filename = `Annex_B_SPES_Beneficiaries_${new Date().toISOString().slice(0, 10)}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting Annex B:', error.message);
        res.status(500).json({ message: 'Error exporting Annex B', error: error.message });
    }
};

// =============================================
// Annex H Excel Export (GIP beneficiaries)
// =============================================
exports.exportAnnexH = async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ message: 'Only admin can export Annex H' });
        }

        const query = `
            SELECT
                b.first_name,
                b.middle_name,
                b.last_name,
                b.extension_name,
                b.birth_date,
                b.gender,
                b.civil_status,
                b.contact_number,
                b.address,
                g.school,
                g.course,
                g.year_graduated,
                g.education_level,
                g.employment_status,
                g.skills,
                g.government_id,
                g.emergency_name,
                g.emergency_contact
            FROM applications a
            LEFT JOIN beneficiaries b ON b.user_id = a.user_id
            LEFT JOIN gip_details g ON g.application_id = a.application_id
            WHERE a.status = 'Approved' AND a.program_type = 'gip'
            ORDER BY b.last_name ASC, b.first_name ASC
        `;

        const [rows] = await db.execute(query);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'PESO Management System';
        workbook.created = new Date();

        const ws = workbook.addWorksheet('Annex H', {
            pageSetup: {
                paperSize: 9,
                orientation: 'landscape',
                fitToPage: true,
                fitToWidth: 1,
                margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 }
            }
        });

        ws.mergeCells('A1:S1');
        ws.getCell('A1').value = 'ANNEX H';
        ws.getCell('A1').font = { bold: true, size: 14, name: 'Arial' };
        ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells('A2:S2');
        ws.getCell('A2').value = 'LIST OF GIP BENEFICIARIES';
        ws.getCell('A2').font = { bold: true, size: 12, name: 'Arial' };
        ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells('A3:S3');
        ws.getCell('A3').value = 'GIP — Government Internship Program';
        ws.getCell('A3').font = { italic: true, size: 10, name: 'Arial' };
        ws.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells('A4:S4');
        ws.mergeCells('A5:D5');
        ws.getCell('A5').value = 'PESO/LGU: ________________________________________';
        ws.getCell('A5').font = { size: 10, name: 'Arial' };
        ws.mergeCells('E5:J5');
        ws.getCell('E5').value = 'Date: ' + new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
        ws.getCell('E5').font = { size: 10, name: 'Arial' };
        ws.mergeCells('K5:S5');
        ws.getCell('K5').value = 'Partner Agency: ________________________________________';
        ws.getCell('K5').font = { size: 10, name: 'Arial' };
        ws.mergeCells('A6:S6');

        const headerRow = 7;
        const headers = [
            { header: 'No.', width: 5 },
            { header: 'LAST NAME', width: 12 },
            { header: 'FIRST NAME', width: 12 },
            { header: 'MIDDLE NAME', width: 11 },
            { header: 'EXT.', width: 5 },
            { header: 'DATE OF BIRTH', width: 11 },
            { header: 'AGE', width: 5 },
            { header: 'SEX', width: 6 },
            { header: 'CIVIL STATUS', width: 11 },
            { header: 'ADDRESS', width: 20 },
            { header: 'CONTACT NO.', width: 12 },
            { header: 'SCHOOL', width: 14 },
            { header: 'COURSE', width: 14 },
            { header: 'YEAR GRAD.', width: 9 },
            { header: 'EDUC. LEVEL', width: 11 },
            { header: 'EMPLOYMENT STATUS', width: 14 },
            { header: 'SKILLS', width: 18 },
            { header: 'GOV\'T ID NO.', width: 12 },
            { header: 'EMERGENCY (NAME / CONTACT)', width: 22 },
        ];

        annexWriteHeaderRow(ws, headerRow, headers);

        const dataRows = rows.map((row, index) => {
            const emergency = [row.emergency_name, row.emergency_contact].filter(Boolean).join(' / ');
            return [
                index + 1,
                (row.last_name || '').toUpperCase(),
                (row.first_name || '').toUpperCase(),
                (row.middle_name || '').toUpperCase(),
                row.extension_name || '',
                row.birth_date ? new Date(row.birth_date).toLocaleDateString('en-PH') : '',
                annexCalculateAge(row.birth_date),
                row.gender || '',
                row.civil_status || '',
                row.address || '',
                row.contact_number || '',
                row.school || '',
                row.course || '',
                row.year_graduated || '',
                row.education_level || '',
                row.employment_status || '',
                row.skills || '',
                row.government_id || '',
                emergency,
            ];
        });

        annexWriteDataRows(ws, headerRow, dataRows);

        const sigRow = headerRow + rows.length + 3;
        annexWriteSignatureBlock(ws, 'S', sigRow);

        const filename = `Annex_H_GIP_Beneficiaries_${new Date().toISOString().slice(0, 10)}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting Annex H:', error.message);
        res.status(500).json({ message: 'Error exporting Annex H', error: error.message });
    }
};

// =============================================
// Annex L Excel Export (registered job seekers)
// =============================================
exports.exportAnnexL = async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ message: 'Only admin can export Annex L' });
        }

        const query = `
            SELECT
                b.first_name,
                b.middle_name,
                b.last_name,
                b.extension_name,
                b.birth_date,
                b.gender,
                b.civil_status,
                b.contact_number,
                b.address,
                j.employment_status,
                j.preferred_work_type,
                j.preferred_industry,
                j.years_of_experience,
                j.technical_skills,
                j.urgent_training,
                j.certifications,
                j.availability,
                j.expected_salary
            FROM applications a
            LEFT JOIN beneficiaries b ON b.user_id = a.user_id
            LEFT JOIN jobseeker_details j ON j.application_id = a.application_id
            WHERE a.status = 'Approved' AND a.program_type = 'job_seekers'
            ORDER BY b.last_name ASC, b.first_name ASC
        `;

        const [rows] = await db.execute(query);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'PESO Management System';
        workbook.created = new Date();

        const ws = workbook.addWorksheet('Annex L', {
            pageSetup: {
                paperSize: 9,
                orientation: 'landscape',
                fitToPage: true,
                fitToWidth: 1,
                margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 }
            }
        });

        ws.mergeCells('A1:R1');
        ws.getCell('A1').value = 'ANNEX L';
        ws.getCell('A1').font = { bold: true, size: 14, name: 'Arial' };
        ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells('A2:R2');
        ws.getCell('A2').value = 'LIST OF REGISTERED JOB SEEKERS';
        ws.getCell('A2').font = { bold: true, size: 12, name: 'Arial' };
        ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells('A3:R3');
        ws.getCell('A3').value = 'Public Employment Service Office — Job Applicants Registry';
        ws.getCell('A3').font = { italic: true, size: 10, name: 'Arial' };
        ws.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells('A4:R4');
        ws.mergeCells('A5:D5');
        ws.getCell('A5').value = 'PESO/LGU: ________________________________________';
        ws.getCell('A5').font = { size: 10, name: 'Arial' };
        ws.mergeCells('E5:I5');
        ws.getCell('E5').value = 'Date: ' + new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
        ws.getCell('E5').font = { size: 10, name: 'Arial' };
        ws.mergeCells('J5:R5');
        ws.getCell('J5').value = 'Reporting period: ________________________________________';
        ws.getCell('J5').font = { size: 10, name: 'Arial' };
        ws.mergeCells('A6:R6');

        const headerRow = 7;
        const headers = [
            { header: 'No.', width: 5 },
            { header: 'LAST NAME', width: 12 },
            { header: 'FIRST NAME', width: 12 },
            { header: 'MIDDLE NAME', width: 11 },
            { header: 'EXT.', width: 5 },
            { header: 'DATE OF BIRTH', width: 11 },
            { header: 'AGE', width: 5 },
            { header: 'SEX', width: 6 },
            { header: 'CIVIL STATUS', width: 11 },
            { header: 'ADDRESS', width: 22 },
            { header: 'CONTACT NO.', width: 12 },
            { header: 'EMPLOYMENT STATUS', width: 13 },
            { header: 'PREFERRED WORK TYPE', width: 14 },
            { header: 'INDUSTRY', width: 14 },
            { header: 'YEARS EXP.', width: 9 },
            { header: 'EXPECTED SALARY', width: 12 },
            { header: 'AVAILABILITY', width: 12 },
            { header: 'TECHNICAL SKILLS', width: 20 },
            { header: 'TRAINING / CERTS', width: 20 },
        ];

        annexWriteHeaderRow(ws, headerRow, headers);

        const dataRows = rows.map((row, index) => {
            const trainCerts = [row.urgent_training, row.certifications].filter(Boolean).join(' | ');
            return [
                index + 1,
                (row.last_name || '').toUpperCase(),
                (row.first_name || '').toUpperCase(),
                (row.middle_name || '').toUpperCase(),
                row.extension_name || '',
                row.birth_date ? new Date(row.birth_date).toLocaleDateString('en-PH') : '',
                annexCalculateAge(row.birth_date),
                row.gender || '',
                row.civil_status || '',
                row.address || '',
                row.contact_number || '',
                row.employment_status || '',
                row.preferred_work_type || '',
                row.preferred_industry || '',
                row.years_of_experience || '',
                row.expected_salary || '',
                row.availability || '',
                row.technical_skills || '',
                trainCerts,
            ];
        });

        annexWriteDataRows(ws, headerRow, dataRows);

        const sigRow = headerRow + rows.length + 3;
        annexWriteSignatureBlock(ws, 'R', sigRow);

        const filename = `Annex_L_Job_Seekers_${new Date().toISOString().slice(0, 10)}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting Annex L:', error.message);
        res.status(500).json({ message: 'Error exporting Annex L', error: error.message });
    }
};

// =============================================
// Admin: Update Excel data inline (read, edit, re-export without MS Excel)
// =============================================
exports.updateExcelData = async (req, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ message: 'Only admin can update Excel data' });
        }

        const { updates } = req.body;
        // updates = [{ application_id, field, table, detail_id, value }]
        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({ message: 'No updates provided' });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            for (const update of updates) {
                const { application_id, field, table, detail_id, value } = update;

                // Whitelist allowed tables and fields to prevent injection
                const allowedTables = {
                    beneficiaries: [
                        'first_name', 'middle_name', 'last_name', 'extension_name',
                        'birth_date', 'gender', 'civil_status', 'contact_number', 'address'
                    ],
                    tupad_details: [
                        'valid_id_type', 'id_number', 'occupation', 'monthly_income',
                        'civil_status', 'work_category', 'job_preference', 'educational_attainment'
                    ],
                    spes_details: [
                        'place_of_birth', 'citizenship', 'social_media_account', 'civil_status',
                        'sex', 'type_of_student', 'parent_status', 'father_name', 'father_occupation',
                        'father_contact', 'mother_maiden_name', 'mother_occupation', 'mother_contact',
                        'education_level', 'name_of_school', 'degree_earned_course', 'year_level',
                        'present_address', 'permanent_address'
                    ]
                };

                if (!allowedTables[table] || !allowedTables[table].includes(field)) {
                    throw new Error(`Invalid table/field: ${table}.${field}`);
                }

                if (table === 'beneficiaries') {
                    // Get user_id from application
                    const [apps] = await connection.execute(
                        'SELECT user_id FROM applications WHERE application_id = ?',
                        [application_id]
                    );
                    if (apps.length === 0) continue;

                    await connection.execute(
                        `UPDATE beneficiaries SET \`${field}\` = ? WHERE user_id = ?`,
                        [value, apps[0].user_id]
                    );
                } else {
                    const idColumn = detail_id ? 'detail_id' : 'application_id';
                    const idValue = detail_id || application_id;
                    await connection.execute(
                        `UPDATE \`${table}\` SET \`${field}\` = ? WHERE \`${idColumn}\` = ?`,
                        [value, idValue]
                    );
                }
            }

            await connection.commit();
            res.status(200).json({ message: `${updates.length} field(s) updated successfully` });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error updating Excel data:', error.message);
        res.status(500).json({ message: error.message });
    }
};

// ── Duplicate Detection Endpoints ────────────────────

/**
 * GET /api/forms/duplicates/detect
 * Auto-detect potential duplicates based on matching criteria.
 */
exports.detectDuplicates = async (req, res) => {
    try {
        const duplicates = await beneficiaryService.detectDuplicates();
        res.status(200).json({ duplicates, count: duplicates.length });
    } catch (error) {
        console.error('Error detecting duplicates:', error.message);
        res.status(500).json({ message: 'Failed to detect duplicates' });
    }
};

/**
 * GET /api/forms/duplicates/marked
 * Get all manually-marked duplicate applications.
 */
exports.getMarkedDuplicates = async (req, res) => {
    try {
        const duplicates = await beneficiaryService.getMarkedDuplicates();
        res.status(200).json({ duplicates, count: duplicates.length });
    } catch (error) {
        console.error('Error fetching marked duplicates:', error.message);
        res.status(500).json({ message: 'Failed to fetch marked duplicates' });
    }
};

/**
 * PUT /api/forms/duplicates/:applicationId/mark
 * Mark an application as duplicate with optional notes.
 */
exports.markDuplicate = async (req, res) => {
    try {
        const { applicationId } = req.params;
        const { notes } = req.body;
        await beneficiaryService.markAsDuplicate(applicationId, notes);
        res.status(200).json({ message: 'Application marked as duplicate' });
    } catch (error) {
        console.error('Error marking duplicate:', error.message);
        res.status(500).json({ message: 'Failed to mark as duplicate' });
    }
};

/**
 * PUT /api/forms/duplicates/:applicationId/unmark
 * Remove duplicate flag from an application.
 */
exports.unmarkDuplicate = async (req, res) => {
    try {
        const { applicationId } = req.params;
        await beneficiaryService.unmarkDuplicate(applicationId);
        res.status(200).json({ message: 'Duplicate flag removed' });
    } catch (error) {
        console.error('Error unmarking duplicate:', error.message);
        res.status(500).json({ message: 'Failed to unmark duplicate' });
    }
};

/**
 * PUT /api/forms/duplicates/:applicationId/resolve
 * Resolve a duplicate — either reject or keep the application.
 */
exports.resolveDuplicate = async (req, res) => {
    try {
        const { applicationId } = req.params;
        const { action } = req.body; // 'reject' or 'keep'
        if (!['reject', 'keep'].includes(action)) {
            return res.status(400).json({ message: 'Action must be "reject" or "keep"' });
        }
        await beneficiaryService.resolveDuplicate(applicationId, action);
        res.status(200).json({ message: `Application ${action === 'reject' ? 'rejected as duplicate' : 'kept and unmarked'}` });
    } catch (error) {
        console.error('Error resolving duplicate:', error.message);
        res.status(500).json({ message: 'Failed to resolve duplicate' });
    }
};

// ── Duplicate Beneficiaries ──────────────────────────

exports.detectDuplicateBeneficiaries = async (req, res) => {
    try {
        const duplicates = await beneficiaryService.detectDuplicateBeneficiaries();
        res.status(200).json({ duplicates, count: duplicates.length });
    } catch (error) {
        console.error('Error detecting duplicate beneficiaries:', error.message);
        res.status(500).json({ message: 'Failed to detect duplicate beneficiaries' });
    }
};

exports.deleteBeneficiary = async (req, res) => {
    try {
        const { beneficiaryId } = req.params;
        await beneficiaryService.deleteBeneficiaryById(beneficiaryId);
        res.status(200).json({ message: 'Beneficiary deleted successfully' });
    } catch (error) {
        console.error('Error deleting beneficiary:', error.message);
        res.status(500).json({ message: 'Failed to delete beneficiary' });
    }
};

// ── Duplicate Attendance ─────────────────────────────

exports.detectDuplicateAttendance = async (req, res) => {
    try {
        const duplicates = await beneficiaryService.detectDuplicateAttendance();
        res.status(200).json({ duplicates, count: duplicates.length });
    } catch (error) {
        console.error('Error detecting duplicate attendance:', error.message);
        res.status(500).json({ message: 'Failed to detect duplicate attendance' });
    }
};

exports.deleteAttendanceRecord = async (req, res) => {
    try {
        const { attendanceId } = req.params;
        await beneficiaryService.deleteAttendanceRecord(attendanceId);
        res.status(200).json({ message: 'Attendance record deleted successfully' });
    } catch (error) {
        console.error('Error deleting attendance record:', error.message);
        res.status(500).json({ message: 'Failed to delete attendance record' });
    }
};

// =============================================
// Annex K Word Export (TUPAD accomplishment report)
// =============================================
exports.exportAnnexK = async (req, res) => {
    try {
        if (!['admin', 'staff'].includes(req.user?.role)) {
            return res.status(403).json({ message: 'Only admin or staff can export Annex K' });
        }

        const programId = req.query.program_id ? Number(req.query.program_id) : null;
        const reportId = req.query.report_id ? Number(req.query.report_id) : null;
        const whereClauses = [];
        const values = [];

        if (programId) {
            whereClauses.push('tr.program_id = ?');
            values.push(programId);
        }

        if (reportId) {
            whereClauses.push('tr.report_id = ?');
            values.push(reportId);
        }

        const whereClause = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const query = `
            SELECT
                tr.report_id,
                tr.program_id,
                tr.period_of_work,
                tr.detail_of_work,
                tr.before_photo_path,
                tr.during_photo_path,
                tr.after_photo_path,
                tr.created_by,
                tr.created_at,
                p.program_name,
                p.program_type,
                u.first_name as creator_first_name,
                u.last_name as creator_last_name
            FROM tupad_reports tr
            LEFT JOIN programs p ON tr.program_id = p.program_id
            LEFT JOIN users u ON tr.created_by = u.user_id
            ${whereClause}
            ORDER BY tr.created_at ASC
        `;

        const [reports] = await db.execute(query, values);

        if (!Array.isArray(reports) || reports.length === 0) {
            return res.status(404).json({ message: 'No TUPAD reports found for the requested criteria' });
        }

        const uniqueProgramNames = [...new Set(reports.map((report) => report.program_name).filter(Boolean))];
        const programTitle = uniqueProgramNames.length === 1 ? uniqueProgramNames[0] : 'TUPAD Program';

        const children = [
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'ANNEX K',
                        bold: true,
                        size: 32,
                        font: 'Arial',
                    }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'TUPAD ACCOMPLISHMENT REPORT',
                        bold: true,
                        size: 28,
                        font: 'Arial',
                    }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: `Program: ${programTitle}`,
                        size: 24,
                        font: 'Arial',
                    }),
                ],
                spacing: { after: 200 },
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: `Date: ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`,
                        size: 24,
                        font: 'Arial',
                    }),
                ],
                spacing: { after: 400 },
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'SECTION A: PERIOD OF WORK AND DETAIL OF WORK',
                        bold: true,
                        size: 26,
                        font: 'Arial',
                    }),
                ],
                spacing: { before: 400, after: 200 },
            }),
            new Table({
                width: {
                    size: 100,
                    type: WidthType.PERCENTAGE,
                },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({
                                children: [
                                    new Paragraph({
                                        children: [
                                            new TextRun({
                                                text: 'Period of Work',
                                                bold: true,
                                                size: 22,
                                                font: 'Arial',
                                            }),
                                        ],
                                        alignment: AlignmentType.CENTER,
                                    }),
                                ],
                                width: { size: 30, type: WidthType.PERCENTAGE },
                            }),
                            new TableCell({
                                children: [
                                    new Paragraph({
                                        children: [
                                            new TextRun({
                                                text: 'Detail of Work',
                                                bold: true,
                                                size: 22,
                                                font: 'Arial',
                                            }),
                                        ],
                                        alignment: AlignmentType.CENTER,
                                    }),
                                ],
                                width: { size: 70, type: WidthType.PERCENTAGE },
                            }),
                        ],
                    }),
                    ...reports.map((report) =>
                        new TableRow({
                            children: [
                                new TableCell({
                                    children: [
                                        new Paragraph({
                                            children: [
                                                new TextRun({
                                                    text: report.period_of_work || '',
                                                    size: 22,
                                                    font: 'Arial',
                                                }),
                                            ],
                                            alignment: AlignmentType.LEFT,
                                        }),
                                    ],
                                    width: { size: 30, type: WidthType.PERCENTAGE },
                                }),
                                new TableCell({
                                    children: [
                                        new Paragraph({
                                            children: [
                                                new TextRun({
                                                    text: report.detail_of_work || '',
                                                    size: 22,
                                                    font: 'Arial',
                                                }),
                                            ],
                                            alignment: AlignmentType.LEFT,
                                        }),
                                    ],
                                    width: { size: 70, type: WidthType.PERCENTAGE },
                                }),
                            ],
                        })
                    ),
                ],
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'SECTION B: PHOTOGRAPHIC DOCUMENTATION',
                        bold: true,
                        size: 26,
                        font: 'Arial',
                    }),
                ],
                spacing: { before: 600, after: 200 },
            }),
            ...reports.flatMap((report) => [
                new Paragraph({
                    children: [
                        new TextRun({
                            text: `TUPAD Report #${report.report_id}`,
                            bold: true,
                            size: 24,
                            font: 'Arial',
                        }),
                    ],
                    spacing: { before: 300, after: 120 },
                }),
                ...buildPhotoParagraphs('BEFORE WORK:', report.before_photo_path),
                ...buildPhotoParagraphs('DURING WORK:', report.during_photo_path),
                ...buildPhotoParagraphs('AFTER WORK:', report.after_photo_path),
            ]),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Prepared by:',
                        size: 24,
                        font: 'Arial',
                    }),
                ],
                spacing: { before: 600, after: 100 },
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: '______________________________',
                        size: 24,
                        font: 'Arial',
                    }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 50 },
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: `${reports[0].creator_first_name || ''} ${reports[0].creator_last_name || ''}`,
                        size: 22,
                        font: 'Arial',
                        italics: true,
                    }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 50 },
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'PESO Manager',
                        size: 22,
                        font: 'Arial',
                        italics: true,
                    }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Noted by:',
                        size: 24,
                        font: 'Arial',
                    }),
                ],
                spacing: { after: 100 },
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: '______________________________',
                        size: 24,
                        font: 'Arial',
                    }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 50 },
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: 'Municipal Mayor / Authorized Representative',
                        size: 22,
                        font: 'Arial',
                        italics: true,
                    }),
                ],
                alignment: AlignmentType.CENTER,
            }),
        ];

        const doc = new Document({
            sections: [
                {
                    properties: {},
                    children,
                },
            ],
        });

        const buffer = await Packer.toBuffer(doc);
        const filename = `Annex_K_TUPAD_Accomplishment_Report_${new Date().toISOString().slice(0, 10)}.docx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(buffer);
    } catch (error) {
        console.error('Error exporting Annex K:', error.message || error);
        res.status(500).json({ message: 'Error exporting Annex K', error: error.message || error });
    }
};
