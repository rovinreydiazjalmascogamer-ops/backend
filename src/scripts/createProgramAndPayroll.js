const db = require('../../config');
const payrollService = require('../services/payroll.services');

(async function main(){
    try {
        console.log('Running program+payroll seed...');

        // 1) create program
        const programName = 'TUPAD Juban — Batch Seed';
        const location = 'Juban, Sorsogon';
        const slots = 10;
        const budget = 100000.00;
        const status = 'active';
        const start_date = new Date().toISOString().slice(0,10);
        const end_date = null;

        const [progRows] = await db.execute(
            `SELECT program_id FROM programs WHERE program_name = ? LIMIT 1`,
            [programName]
        );

        let programId;
        if (progRows.length > 0) {
            programId = progRows[0].program_id;
            console.log('Found existing program id', programId);
        } else {
            const [res] = await db.execute(
                `INSERT INTO programs (program_name, location, slots, budget, status, start_date, end_date, filled, used)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`,
                [programName, location, slots, budget, status, start_date, end_date]
            );
            programId = res.insertId;
            console.log('Created program id', programId);
        }

        // 2) approve TUPAD applicants and link to program
        const tupadEmails = [
            'juan.delacruz@juban.local',
            'maria.santos@juban.local',
            'pedro.reyes@juban.local',
            'ana.garcia@juban.local',
            'carlo.mendoza@juban.local'
        ];

        const [users] = await db.execute(
            `SELECT user_id, email FROM users WHERE email IN (${tupadEmails.map(()=>'?').join(',')})`,
            tupadEmails
        );

        if (users.length === 0) {
            console.warn('No tupad users found. Run seedJubanApplicants.js first.');
            process.exit(1);
        }

        for (const u of users) {
            const uid = u.user_id;
            await db.execute(
                `UPDATE applications SET program_id = ?, status = 'Approved', approval_date = COALESCE(approval_date, NOW()), updated_at = NOW()
                 WHERE user_id = ? AND program_type = 'tupad'`,
                [programId, uid]
            );
            console.log('Approved application and linked to program for', u.email);
        }

        // 3) insert attendance records for current month for each approved user
        const selectedMonth = new Date().toISOString().slice(0,7); // YYYY-MM
        console.log('Using payroll month', selectedMonth);

        const startDay = 1;
        const endDay = 10; // create 10 days of attendance

        for (const u of users) {
            for (let d = startDay; d <= endDay; d++) {
                const day = String(d).padStart(2, '0');
                const attendanceDate = `${selectedMonth}-${day}`;

                const [exists] = await db.execute(
                    `SELECT 1 FROM attendance_records WHERE user_id = ? AND attendance_date = ? LIMIT 1`,
                    [u.user_id, attendanceDate]
                );
                if (exists.length > 0) continue;

                await db.execute(
                    `INSERT INTO attendance_records (user_id, attendance_date, status, created_at, updated_at)
                     VALUES (?, ?, 'Present', NOW(), NOW())`,
                    [u.user_id, attendanceDate]
                );
            }
            console.log('Inserted attendance for', u.email);
        }

        // 4) generate payroll for the month
        try {
            const result = await payrollService.generatePayroll(selectedMonth);
            console.log('Payroll generation result:', result);
        } catch (err) {
            console.error('Payroll generation failed:', err.message || err);
            console.error('If payroll tables are missing, create them via migrations.');
        }

        console.log('✅ Program + payroll seed complete.');
        process.exit(0);
    } catch (err) {
        console.error('Error in seed script:', err.message || err);
        process.exit(1);
    }
})();
