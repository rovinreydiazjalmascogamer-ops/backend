const db = require('../../config');

let tableEnsured = false;

const ensureAttendanceTable = async () => {
  if (tableEnsured) {
    return;
  }

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS attendance_records (
      attendance_id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      program_id INT DEFAULT NULL,
      program_type VARCHAR(30) NULL,
      attendance_date DATE NOT NULL,
      report_date DATE DEFAULT NULL,
      work_day VARCHAR(100) DEFAULT NULL,
      period_of_work TEXT DEFAULT NULL,
      detail_of_work TEXT DEFAULT NULL,
      before_photo_path TEXT DEFAULT NULL,
      during_photo_path TEXT DEFAULT NULL,
      after_photo_path TEXT DEFAULT NULL,
      time_in DATETIME NULL,
      time_out DATETIME NULL,
      status ENUM('Present', 'Incomplete', 'Absent') DEFAULT 'Incomplete',
      remarks VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_day (user_id, attendance_date),
      KEY fk_attendance_program (program_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )
  `;

  await db.execute(createTableQuery);

  const columnUpdates = [
    `ALTER TABLE attendance_records MODIFY COLUMN status ENUM('Present', 'Incomplete', 'Absent') DEFAULT 'Incomplete'`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS program_id INT DEFAULT NULL AFTER user_id`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS report_date DATE DEFAULT NULL AFTER attendance_date`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS work_day VARCHAR(100) DEFAULT NULL AFTER report_date`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS period_of_work TEXT DEFAULT NULL AFTER work_day`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS detail_of_work TEXT DEFAULT NULL AFTER period_of_work`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS before_photo_path TEXT DEFAULT NULL AFTER detail_of_work`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS during_photo_path TEXT DEFAULT NULL AFTER before_photo_path`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS after_photo_path TEXT DEFAULT NULL AFTER during_photo_path`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS program_type VARCHAR(30) NULL AFTER program_id`,
  ];

  for (const sql of columnUpdates) {
    try {
      await db.execute(sql);
    } catch (_) {
      // ignore if already exists or unsupported syntax
    }
  }

  try {
    await db.execute(`ALTER TABLE attendance_records ADD KEY fk_attendance_program (program_id)`);
  } catch (_) {
    // ignore if already exists or unsupported syntax
  }

  tableEnsured = true;
};

exports.ensureAttendanceTable = ensureAttendanceTable;


const getLatestProgram = async (userId) => {
  const query = `
    SELECT program_type
    FROM applications
    WHERE user_id = ?
    ORDER BY COALESCE(approval_date, updated_at, applied_at) DESC
    LIMIT 1
  `;

  const [rows] = await db.execute(query, [userId]);
  return rows[0] || null;
};

exports.getAttendanceRecords = async (userId) => {
  await ensureAttendanceTable();

  const query = `
    SELECT
      attendance_id,
      attendance_date,
      time_in,
      time_out,
      status,
      remarks,
      program_type
    FROM attendance_records
    WHERE user_id = ?
    ORDER BY attendance_date DESC
    LIMIT 30
  `;

  const [rows] = await db.execute(query, [userId]);
  return rows;
};

exports.getTodayAttendance = async (userId) => {
  await ensureAttendanceTable();

  const latestProgram = await getLatestProgram(userId);

  const query = `
    SELECT attendance_id, attendance_date, time_in, time_out, status, remarks, program_type
    FROM attendance_records
    WHERE user_id = ? AND attendance_date = CURDATE()
    LIMIT 1
  `;

  const [rows] = await db.execute(query, [userId]);
  return {
    attendance: rows[0] || null,
    programType: latestProgram ? latestProgram.program_type : null
  };
};

exports.timeIn = async (userId) => {
  await ensureAttendanceTable();

  const latestProgram = await getLatestProgram(userId);
  const programType = latestProgram ? latestProgram.program_type : null;

  const [existingRows] = await db.execute(
    'SELECT attendance_id, time_in, time_out FROM attendance_records WHERE user_id = ? AND attendance_date = CURDATE() LIMIT 1',
    [userId]
  );

  if (existingRows.length > 0 && existingRows[0].time_in) {
    const error = new Error('You have already timed in today.');
    error.statusCode = 409;
    throw error;
  }

  if (existingRows.length === 0) {
    const insertQuery = `
      INSERT INTO attendance_records (user_id, program_type, attendance_date, time_in, status, remarks)
      VALUES (?, ?, CURDATE(), NOW(), 'Incomplete', 'Timed in')
    `;

    await db.execute(insertQuery, [userId, programType]);
  } else {
    const updateQuery = `
      UPDATE attendance_records
      SET time_in = NOW(), status = 'Incomplete', remarks = 'Timed in', program_type = ?
      WHERE attendance_id = ?
    `;

    await db.execute(updateQuery, [programType, existingRows[0].attendance_id]);
  }

  return await exports.getTodayAttendance(userId);
};

exports.timeOut = async (userId) => {
  await ensureAttendanceTable();

  const latestProgram = await getLatestProgram(userId);
  const programType = latestProgram ? latestProgram.program_type : null;

  const [rows] = await db.execute(
    'SELECT attendance_id, time_in, time_out FROM attendance_records WHERE user_id = ? AND attendance_date = CURDATE() LIMIT 1',
    [userId]
  );

  if (rows.length === 0 || !rows[0].time_in) {
    const error = new Error('You must time in before timing out.');
    error.statusCode = 400;
    throw error;
  }

  if (rows[0].time_out) {
    const error = new Error('You have already timed out today.');
    error.statusCode = 409;
    throw error;
  }

  const query = `
    UPDATE attendance_records
    SET time_out = NOW(), status = 'Present', remarks = 'Completed attendance', program_type = ?
    WHERE attendance_id = ?
  `;

  await db.execute(query, [programType, rows[0].attendance_id]);

  return await exports.getTodayAttendance(userId);
};

exports.getMonitoringRecords = async (limit = 200) => {
  await ensureAttendanceTable();

  const safeLimit = Number(limit) > 0 ? Number(limit) : 200;
  const query = `
    SELECT
      ar.attendance_id,
      ar.user_id,
      ar.program_type,
      ar.attendance_date,
      ar.time_in,
      ar.time_out,
      ar.status,
      ar.remarks,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', b.first_name, b.middle_name, b.last_name)), ''),
        u.user_name
      ) AS beneficiary_name
    FROM attendance_records ar
    LEFT JOIN users u ON u.user_id = ar.user_id
    LEFT JOIN beneficiaries b ON b.user_id = ar.user_id
    ORDER BY ar.attendance_date DESC, ar.attendance_id DESC
    LIMIT ?
  `;

  const [rows] = await db.execute(query, [safeLimit]);
  return rows;
};

// Get beneficiaries for a program with their today's attendance status
exports.getProgramAttendance = async (programType, date) => {
  await ensureAttendanceTable();
  const attendanceDate = date || new Date().toISOString().slice(0, 10);

  const query = `
    SELECT
      a.user_id,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', b.first_name, b.middle_name, b.last_name)), ''),
        u.user_name
      ) AS beneficiary_name,
      p.program_name AS program_type,
      ar.attendance_id,
      ar.attendance_date,
      ar.time_in,
      ar.time_out,
      ar.status AS attendance_status,
      ar.remarks
    FROM program_enrollees pe
    INNER JOIN applications a ON pe.application_id = a.application_id
    INNER JOIN programs p ON pe.program_id = p.program_id
    LEFT JOIN users u ON u.user_id = a.user_id
    LEFT JOIN beneficiaries b ON b.user_id = a.user_id
    LEFT JOIN attendance_records ar ON ar.user_id = a.user_id AND ar.attendance_date = ?
    WHERE p.program_type = ? AND pe.current_status = 'Active'
    ORDER BY beneficiary_name ASC
  `;

  const [rows] = await db.execute(query, [attendanceDate, programType]);
  return rows;
};

// Get beneficiaries for a specific program ID with true enrolled beneficiaries
exports.getProgramAttendanceById = async (programId, date) => {
  await ensureAttendanceTable();
  const attendanceDate = date || new Date().toISOString().slice(0, 10);

  const query = `
    SELECT
      a.user_id,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', b.first_name, b.middle_name, b.last_name)), ''),
        u.user_name
      ) AS beneficiary_name,
      p.program_name AS program_type,
      ar.attendance_id,
      ar.attendance_date,
      ar.time_in,
      ar.time_out,
      ar.status AS attendance_status,
      ar.remarks
    FROM program_enrollees pe
    INNER JOIN applications a ON pe.application_id = a.application_id
    INNER JOIN programs p ON pe.program_id = p.program_id
    LEFT JOIN users u ON u.user_id = a.user_id
    LEFT JOIN beneficiaries b ON b.user_id = a.user_id
    LEFT JOIN attendance_records ar ON ar.user_id = a.user_id AND ar.attendance_date = ?
    WHERE pe.program_id = ? AND pe.current_status = 'Active'
    ORDER BY beneficiary_name ASC
  `;

  const [rows] = await db.execute(query, [attendanceDate, programId]);
  return rows;
};

// Admin marks a beneficiary as present or absent for a given date
exports.adminMarkAttendance = async (userId, programType, date, status) => {
  await ensureAttendanceTable();
  const attendanceDate = date || new Date().toISOString().slice(0, 10);

  const [existing] = await db.execute(
    'SELECT attendance_id FROM attendance_records WHERE user_id = ? AND attendance_date = ? LIMIT 1',
    [userId, attendanceDate]
  );

  if (existing.length > 0) {
    await db.execute(
      `UPDATE attendance_records SET status = ?, program_type = ?, remarks = ?, time_in = COALESCE(time_in, NOW()), time_out = CASE WHEN ? = 'Present' THEN COALESCE(time_out, NOW()) ELSE time_out END WHERE attendance_id = ?`,
      [status, programType, `Marked ${status} by admin`, status, existing[0].attendance_id]
    );
  } else {
    const timeIn = status === 'Present' ? 'NOW()' : 'NULL';
    const timeOut = status === 'Present' ? 'NOW()' : 'NULL';
    await db.execute(
      `INSERT INTO attendance_records (user_id, program_type, attendance_date, time_in, time_out, status, remarks)
       VALUES (?, ?, ?, ${timeIn}, ${timeOut}, ?, ?)`,
      [userId, programType, attendanceDate, status, `Marked ${status} by admin`]
    );
  }

  return { userId, date: attendanceDate, status };
};
