const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

const config = process.env.MYSQL_URL || {
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'capstone_db',
    port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT || '3306', 10),
};

const path = require('path');
const SOURCE_FILE = '06319b0b-8885-497c-a659-9d4c076c870d.jpg';
const BASE_UPLOAD_DIR = 'uploads/beneficiary-documents';

const userEmails = {
    tupad: [
        'juan.delacruz@juban.local',
        'maria.santos@juban.local',
        'pedro.reyes@juban.local',
        'ana.garcia@juban.local',
        'carlo.mendoza@juban.local',
    ],
    spes: [
        'liza.carlota@juban.local',
        'mark.antonio@juban.local',
        'angelica.fernandez@juban.local',
        'danny.romero@juban.local',
        'emily.gonzales@juban.local',
    ],
    dilp: [
        'rafael.bautista@juban.local',
        'rosa.lim@juban.local',
        'ernesto.caballero@juban.local',
        'marisol.sancho@juban.local',
        'kevin.malones@juban.local',
    ],
};

const requirements = {
    tupad: ['government_id', 'barangay_certification', 'birth_certificate'],
    spes: ['government_id', 'birth_certificate', 'certificate_of_good_moral', 'proof_of_enrollment'],
    dilp: ['valid_government_id', 'project_proposal', 'barangay_clearance', 'business_registration'],
};

async function seed() {
    const connection = await mysql.createConnection(config);
    const filePath = path.resolve(__dirname, '../../uploads/beneficiary-documents', SOURCE_FILE);

    if (!fs.existsSync(filePath)) {
        console.error(`Source file does not exist: ${filePath}`);
        process.exit(1);
    }

    const stats = fs.statSync(filePath);
    const mimeType = 'image/jpeg';
    const fileSize = stats.size;

    console.log('Using shared file:', filePath);

    for (const [programType, emails] of Object.entries(userEmails)) {
        const docTypes = requirements[programType];

        for (const email of emails) {
            const [users] = await connection.execute('SELECT user_id FROM users WHERE email = ?', [email]);
            if (users.length === 0) {
                console.warn('User not found:', email);
                continue;
            }
            const userId = users[0].user_id;

            for (const documentType of docTypes) {
                const originalName = `${documentType}-${email}-${SOURCE_FILE}`;

                await connection.execute(
                    `INSERT INTO beneficiary_documents
                        (user_id, program_type, document_type, original_name, file_path, file_size, mime_type, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
                     ON DUPLICATE KEY UPDATE
                        original_name = VALUES(original_name),
                        file_path = VALUES(file_path),
                        file_size = VALUES(file_size),
                        mime_type = VALUES(mime_type),
                        status = 'pending',
                        remarks = NULL,
                        verified_by = NULL,
                        verified_at = NULL,
                        uploaded_at = CURRENT_TIMESTAMP`,
                    [userId, programType, documentType, originalName, filePath, fileSize, mimeType]
                );
            }
            console.log(`Submitted documents for ${email} (${programType})`);
        }
    }

    console.log('✅ Document submission seeding complete.');
    await connection.end();
}

seed().catch((err) => {
    console.error('Seed failed:', err.message || err);
    process.exit(1);
});
