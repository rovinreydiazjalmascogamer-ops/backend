const db = require('../../config');

exports.getAllPrograms = async () => {
  const [programs] = await db.execute(`
    SELECT 
      program_id,
      program_name,
      program_type,
      location,
      slots,
      filled,
      budget,
      status,
      start_date,
      end_date
    FROM programs
    WHERE status IN ('active', 'ongoing')
    ORDER BY program_name
  `);
  return programs;
};

exports.getProgramStats = async (programId) => {
  const [stats] = await db.execute(`
    SELECT 
      p.program_name,
      p.slots,
      p.filled,
      COUNT(DISTINCT a.application_id) as applications,
      COUNT(DISTINCT pe.enrollee_id) as enrollees,
      AVG(pe.enrollment_date) as avg_enrollment
    FROM programs p
    LEFT JOIN applications a ON p.program_type = a.program_type AND a.status = 'Approved'
    LEFT JOIN program_enrollees pe ON p.program_id = pe.program_id AND pe.current_status = 'Active'
    WHERE p.program_id = ?
    GROUP BY p.program_id
  `, [programId]);
  return stats[0] || null;
};

exports.getReadyPrograms = async () => {
  const [programs] = await db.execute(`
    SELECT 
      program_id,
      program_name,
      location,
      slots,
      filled,
      budget,
      status,
      start_date,
      end_date
    FROM programs
    WHERE status IN ('active', 'ongoing')
    ORDER BY start_date ASC
  `);
  return programs;
};
