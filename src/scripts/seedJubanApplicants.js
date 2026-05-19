const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

const REUSED_SPES_FILE = 'uploads/spes-documents/2b146718-c869-46e0-b362-a37e54b52492.jpg';

const config = process.env.MYSQL_URL || {
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'capstone_db',
    port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT || '3306', 10),
};

const tupadApplicants = [
    {
        email: 'juan.delacruz@juban.local',
        phone: '09171234561',
        password: 'Juban123!',
        first_name: 'Juan',
        middle_name: 'M.',
        last_name: 'Dela Cruz',
        birth_date: '1988-04-12',
        gender: 'Male',
        civil_status: 'Married',
        contact_number: '09171234561',
        address: 'Brgy. Cagbo, Juban, Sorsogon',
        valid_id_type: 'UMID',
        id_number: 'UMID-10001',
        occupation: 'Tricycle Driver',
        monthly_income: 4500.00,
        work_category: 'Manual Labor',
        job_preference: 'Construction',
        educational_attainment: 'High School'
    },
    {
        email: 'maria.santos@juban.local',
        phone: '09171234562',
        password: 'Juban123!',
        first_name: 'Maria',
        middle_name: 'L.',
        last_name: 'Santos',
        birth_date: '1992-08-03',
        gender: 'Female',
        civil_status: 'Single',
        contact_number: '09171234562',
        address: 'Brgy. San Roque, Juban, Sorsogon',
        valid_id_type: 'PhilHealth',
        id_number: 'PH-20002',
        occupation: 'Housekeeper',
        monthly_income: 3200.00,
        work_category: 'Household',
        job_preference: 'Cleaning',
        educational_attainment: 'Elementary'
    },
    {
        email: 'pedro.reyes@juban.local',
        phone: '09171234563',
        password: 'Juban123!',
        first_name: 'Pedro',
        middle_name: 'A.',
        last_name: 'Reyes',
        birth_date: '1985-01-19',
        gender: 'Male',
        civil_status: 'Single',
        contact_number: '09171234563',
        address: 'Brgy. Salvacion, Juban, Sorsogon',
        valid_id_type: 'Voter ID',
        id_number: 'VID-30003',
        occupation: 'Farm Worker',
        monthly_income: 2900.00,
        work_category: 'Agriculture',
        job_preference: 'Planting',
        educational_attainment: 'Elementary'
    },
    {
        email: 'ana.garcia@juban.local',
        phone: '09171234564',
        password: 'Juban123!',
        first_name: 'Ana',
        middle_name: 'R.',
        last_name: 'Garcia',
        birth_date: '1990-11-05',
        gender: 'Female',
        civil_status: 'Widowed',
        contact_number: '09171234564',
        address: 'Brgy. San Antonio, Juban, Sorsogon',
        valid_id_type: 'NBI Clearance',
        id_number: 'NBI-40004',
        occupation: 'Vendor',
        monthly_income: 3600.00,
        work_category: 'Retail',
        job_preference: 'Street Vending',
        educational_attainment: 'Secondary'
    },
    {
        email: 'carlo.mendoza@juban.local',
        phone: '09171234565',
        password: 'Juban123!',
        first_name: 'Carlo',
        middle_name: 'T.',
        last_name: 'Mendoza',
        birth_date: '1982-06-28',
        gender: 'Male',
        civil_status: 'Married',
        contact_number: '09171234565',
        address: 'Brgy. San Jose, Juban, Sorsogon',
        valid_id_type: 'Driver License',
        id_number: 'DL-50005',
        occupation: 'Mechanic',
        monthly_income: 5200.00,
        work_category: 'Technical',
        job_preference: 'Repair Work',
        educational_attainment: 'Vocational'
    }
];

const spesApplicants = [
    {
        email: 'liza.carlota@juban.local',
        phone: '09171234571',
        password: 'Juban123!',
        first_name: 'Liza',
        middle_name: 'D.',
        last_name: 'Carlota',
        birth_date: '2006-02-15',
        gender: 'Female',
        civil_status: 'Single',
        contact_number: '09171234571',
        address: 'Brgy. San Gregorio, Juban, Sorsogon',
        place_of_birth: 'Juban, Sorsogon',
        citizenship: 'Filipino',
        social_media_account: '@liza_juban',
        civil_status_spes: 'Single',
        sex: 'Female',
        type_of_student: 'Student',
        parent_status: 'Living together',
        father_name: 'Jose Carlota',
        father_occupation: 'Fisherman',
        father_contact: '09173234571',
        mother_maiden_name: 'Lucia Dela Cruz',
        mother_occupation: 'Barangay Health Worker',
        mother_contact: '09173234572',
        education_level: 'Secondary',
        name_of_school: 'Juban National High School',
        degree_earned_course: 'Junior High',
        year_level: 'Grade 10',
        present_address: 'Brgy. San Gregorio, Juban, Sorsogon',
        permanent_address: 'Brgy. San Gregorio, Juban, Sorsogon'
    },
    {
        email: 'mark.antonio@juban.local',
        phone: '09171234572',
        password: 'Juban123!',
        first_name: 'Mark',
        middle_name: 'P.',
        last_name: 'Antonio',
        birth_date: '2005-09-20',
        gender: 'Male',
        civil_status: 'Single',
        contact_number: '09171234572',
        address: 'Brgy. Salvacion, Juban, Sorsogon',
        place_of_birth: 'Juban, Sorsogon',
        citizenship: 'Filipino',
        social_media_account: '@markjbn',
        civil_status_spes: 'Single',
        sex: 'Male',
        type_of_student: 'Student',
        parent_status: 'Solo Parent',
        father_name: 'Ramon Antonio',
        father_occupation: 'Driver',
        father_contact: '09173234573',
        mother_maiden_name: 'Ester Peralta',
        mother_occupation: 'Vendor',
        mother_contact: '09173234574',
        education_level: 'Secondary',
        name_of_school: 'Juban National High School',
        degree_earned_course: 'Junior High',
        year_level: 'Grade 11',
        present_address: 'Brgy. Salvacion, Juban, Sorsogon',
        permanent_address: 'Brgy. Salvacion, Juban, Sorsogon'
    },
    {
        email: 'angelica.fernandez@juban.local',
        phone: '09171234573',
        password: 'Juban123!',
        first_name: 'Angelica',
        middle_name: 'N.',
        last_name: 'Fernandez',
        birth_date: '2004-12-10',
        gender: 'Female',
        civil_status: 'Single',
        contact_number: '09171234573',
        address: 'Brgy. San Antonio, Juban, Sorsogon',
        place_of_birth: 'Juban, Sorsogon',
        citizenship: 'Filipino',
        social_media_account: '@angiejbn',
        civil_status_spes: 'Single',
        sex: 'Female',
        type_of_student: 'ALS student',
        parent_status: 'Separated',
        father_name: 'Miguel Fernandez',
        father_occupation: 'Laborer',
        father_contact: '09173234575',
        mother_maiden_name: 'Rosa Santos',
        mother_occupation: 'Tailor',
        mother_contact: '09173234576',
        education_level: 'Secondary',
        name_of_school: 'Juban ALS Center',
        degree_earned_course: 'ALS Program',
        year_level: 'Phase 2',
        present_address: 'Brgy. San Antonio, Juban, Sorsogon',
        permanent_address: 'Brgy. San Antonio, Juban, Sorsogon'
    },
    {
        email: 'danny.romero@juban.local',
        phone: '09171234574',
        password: 'Juban123!',
        first_name: 'Danny',
        middle_name: 'B.',
        last_name: 'Romero',
        birth_date: '2006-07-08',
        gender: 'Male',
        civil_status: 'Single',
        contact_number: '09171234574',
        address: 'Brgy. San Roque, Juban, Sorsogon',
        place_of_birth: 'Juban, Sorsogon',
        citizenship: 'Filipino',
        social_media_account: '@dannyjbn',
        civil_status_spes: 'Single',
        sex: 'Male',
        type_of_student: 'Student',
        parent_status: 'Living together',
        father_name: 'Renato Romero',
        father_occupation: 'Fisherman',
        father_contact: '09173234577',
        mother_maiden_name: 'Cynthia Pablo',
        mother_occupation: 'Barangay Clerk',
        mother_contact: '09173234578',
        education_level: 'Secondary',
        name_of_school: 'Juban National High School',
        degree_earned_course: 'Junior High',
        year_level: 'Grade 9',
        present_address: 'Brgy. San Roque, Juban, Sorsogon',
        permanent_address: 'Brgy. San Roque, Juban, Sorsogon'
    },
    {
        email: 'emily.gonzales@juban.local',
        phone: '09171234575',
        password: 'Juban123!',
        first_name: 'Emily',
        middle_name: 'C.',
        last_name: 'Gonzales',
        birth_date: '2005-05-22',
        gender: 'Female',
        civil_status: 'Single',
        contact_number: '09171234575',
        address: 'Brgy. Cagbo, Juban, Sorsogon',
        place_of_birth: 'Juban, Sorsogon',
        citizenship: 'Filipino',
        social_media_account: '@emilyjbn',
        civil_status_spes: 'Single',
        sex: 'Female',
        type_of_student: 'out-of-school (OSY)',
        parent_status: 'Living together',
        father_name: 'Hector Gonzales',
        father_occupation: 'Market Vendor',
        father_contact: '09173234579',
        mother_maiden_name: 'Nina Castro',
        mother_occupation: 'Housewife',
        mother_contact: '09173234580',
        education_level: 'Secondary',
        name_of_school: 'Juban National High School',
        degree_earned_course: 'Junior High',
        year_level: 'Grade 10',
        present_address: 'Brgy. Cagbo, Juban, Sorsogon',
        permanent_address: 'Brgy. Cagbo, Juban, Sorsogon'
    }
];

const dilpApplicants = [
    {
        email: 'rafael.bautista@juban.local',
        phone: '09171234581',
        password: 'Juban123!',
        first_name: 'Rafael',
        middle_name: 'S.',
        last_name: 'Bautista',
        birth_date: '1989-03-17',
        gender: 'Male',
        civil_status: 'Married',
        contact_number: '09171234581',
        address: 'Brgy. San Jose, Juban, Sorsogon',
        project_title: 'Community Vegetable Garden',
        project_type: 'Group',
        category: 'Formation',
        proposed_amount: 150000.00,
        location: 'Brgy. San Jose, Juban',
        barangay: 'San Jose',
        municipality: 'Juban',
        district: '1st District',
        street: 'Miguel Street',
        province: 'Sorsogon',
        contact_person: 'Rafael Bautista',
        business_experience: '3 years farming and small retail',
        estimated_monthly_income: 7000.00,
        number_of_beneficiaries: 8,
        skills_training: 'Organic gardening and small business management',
        valid_id_number: 'NBI-60001',
        brief_description: 'Set up a vegetable garden for local families and school canteen support.'
    },
    {
        email: 'rosa.lim@juban.local',
        phone: '09171234582',
        password: 'Juban123!',
        first_name: 'Rosa',
        middle_name: 'D.',
        last_name: 'Lim',
        birth_date: '1991-10-29',
        gender: 'Female',
        civil_status: 'Single',
        contact_number: '09171234582',
        address: 'Brgy. San Roque, Juban, Sorsogon',
        project_title: 'Rice Retail and Palay Trading',
        project_type: 'Individual',
        category: 'Enhancement',
        proposed_amount: 90000.00,
        location: 'Brgy. San Roque, Juban',
        barangay: 'San Roque',
        municipality: 'Juban',
        district: '1st District',
        street: 'Rizal Street',
        province: 'Sorsogon',
        contact_person: 'Rosa Lim',
        business_experience: '5 years sari-sari store and palay resale',
        estimated_monthly_income: 8500.00,
        number_of_beneficiaries: 3,
        skills_training: 'Retail management and inventory control',
        valid_id_number: 'UMID-60002',
        brief_description: 'Expand rice retail business to serve nearby barangays with affordable rice supply.'
    },
    {
        email: 'ernesto.caballero@juban.local',
        phone: '09171234583',
        password: 'Juban123!',
        first_name: 'Ernesto',
        middle_name: 'F.',
        last_name: 'Caballero',
        birth_date: '1987-07-02',
        gender: 'Male',
        civil_status: 'Married',
        contact_number: '09171234583',
        address: 'Brgy. Cagbo, Juban, Sorsogon',
        project_title: 'Livelihood Poultry Raising',
        project_type: 'Individual',
        category: 'Restoration',
        proposed_amount: 120000.00,
        location: 'Brgy. Cagbo, Juban',
        barangay: 'Cagbo',
        municipality: 'Juban',
        district: '1st District',
        street: 'Mabini Street',
        province: 'Sorsogon',
        contact_person: 'Ernesto Caballero',
        business_experience: 'Home-based poultry raising for 4 years',
        estimated_monthly_income: 6000.00,
        number_of_beneficiaries: 5,
        skills_training: 'Poultry care and marketing',
        valid_id_number: 'VoterID-60003',
        brief_description: 'Raise poultry to supply eggs and meat to the local market.'
    },
    {
        email: 'marisol.sancho@juban.local',
        phone: '09171234584',
        password: 'Juban123!',
        first_name: 'Marisol',
        middle_name: 'E.',
        last_name: 'Sancho',
        birth_date: '1984-11-18',
        gender: 'Female',
        civil_status: 'Widowed',
        contact_number: '09171234584',
        address: 'Brgy. San Antonio, Juban, Sorsogon',
        project_title: 'Bread Baking Enterprise',
        project_type: 'Group',
        category: 'Enhancement',
        proposed_amount: 130000.00,
        location: 'Brgy. San Antonio, Juban',
        barangay: 'San Antonio',
        municipality: 'Juban',
        district: '1st District',
        street: 'Libis Road',
        province: 'Sorsogon',
        contact_person: 'Marisol Sancho',
        business_experience: 'Street baking and small catering',
        estimated_monthly_income: 9500.00,
        number_of_beneficiaries: 6,
        skills_training: 'Bread baking and sales',
        valid_id_number: 'NBI-60004',
        brief_description: 'Produce baked goods for local customers and school events.'
    },
    {
        email: 'kevin.malones@juban.local',
        phone: '09171234585',
        password: 'Juban123!',
        first_name: 'Kevin',
        middle_name: 'J.',
        last_name: 'Malones',
        birth_date: '1993-12-12',
        gender: 'Male',
        civil_status: 'Single',
        contact_number: '09171234585',
        address: 'Brgy. San Roque, Juban, Sorsogon',
        project_title: 'Community Rice Mill',
        project_type: 'Group',
        category: 'Formation',
        proposed_amount: 185000.00,
        location: 'Brgy. San Roque, Juban',
        barangay: 'San Roque',
        municipality: 'Juban',
        district: '1st District',
        street: 'Gomez Street',
        province: 'Sorsogon',
        contact_person: 'Kevin Malones',
        business_experience: 'Milling and agro trade',
        estimated_monthly_income: 10500.00,
        number_of_beneficiaries: 10,
        skills_training: 'Rice milling operations and equipment handling',
        valid_id_number: 'UMID-60005',
        brief_description: 'Establish a small rice mill to support local farmers and reduce post-harvest losses.'
    }
];

function formatAddress(base) {
    return `${base}, Juban, Sorsogon`;
}

async function seed() {
    let connection;
    try {
        connection = await mysql.createConnection(config);
        console.log('Connected to database via', config.database);

        const passwordHash = await bcrypt.hash('Juban123!', 10);

        const insertUser = async (applicant) => {
            const [existing] = await connection.execute(
                'SELECT user_id FROM users WHERE email = ? OR phone = ?',
                [applicant.email, applicant.phone]
            );
            if (existing.length > 0) {
                return existing[0].user_id;
            }

            const [result] = await connection.execute(
                'INSERT INTO users (user_name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
                [
                    `${applicant.first_name} ${applicant.last_name}`,
                    applicant.email,
                    applicant.phone,
                    passwordHash,
                    'beneficiary',
                ]
            );
            return result.insertId;
        };

        const upsertBeneficiary = async (userId, applicant) => {
            await connection.execute(
                `INSERT INTO beneficiaries (user_id, first_name, middle_name, last_name, birth_date, gender, civil_status, contact_number, address, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE
                   user_id = VALUES(user_id),
                   contact_number = VALUES(contact_number),
                   address = VALUES(address)`,
                [
                    userId,
                    applicant.first_name,
                    applicant.middle_name,
                    applicant.last_name,
                    applicant.birth_date,
                    applicant.gender,
                    applicant.civil_status,
                    applicant.contact_number,
                    applicant.address,
                ]
            );
        };

        for (const applicant of tupadApplicants) {
            const userId = await insertUser(applicant);
            await upsertBeneficiary(userId, applicant);

            const [existingApp] = await connection.execute(
                'SELECT application_id FROM applications WHERE user_id = ? AND program_type = ? LIMIT 1',
                [userId, 'tupad']
            );
            if (existingApp.length > 0) {
                console.log('Skipping existing TUPAD application for', applicant.email);
                continue;
            }

            const [appResult] = await connection.execute(
                'INSERT INTO applications (user_id, program_type) VALUES (?, ?)',
                [userId, 'tupad']
            );
            await connection.execute(
                `INSERT INTO tupad_details
                  (application_id, valid_id_type, id_number, occupation, monthly_income, civil_status, work_category, job_preference, educational_attainment)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    appResult.insertId,
                    applicant.valid_id_type,
                    applicant.id_number,
                    applicant.occupation,
                    applicant.monthly_income,
                    applicant.civil_status,
                    applicant.work_category,
                    applicant.job_preference,
                    applicant.educational_attainment,
                ]
            );
            console.log('Inserted TUPAD applicant:', applicant.email);
        }

        for (const applicant of spesApplicants) {
            const userId = await insertUser(applicant);
            await upsertBeneficiary(userId, applicant);

            const [existingApp] = await connection.execute(
                'SELECT application_id FROM applications WHERE user_id = ? AND program_type = ? LIMIT 1',
                [userId, 'spes']
            );
            if (existingApp.length > 0) {
                console.log('Skipping existing SPES application for', applicant.email);
                continue;
            }

            const [appResult] = await connection.execute(
                'INSERT INTO applications (user_id, program_type) VALUES (?, ?)',
                [userId, 'spes']
            );
            await connection.execute(
                `INSERT INTO spes_details
                  (application_id, place_of_birth, citizenship, social_media_account, civil_status, sex, type_of_student,
                   parent_status, father_name, father_occupation, father_contact, mother_maiden_name, mother_occupation,
                   mother_contact, education_level, name_of_school, degree_earned_course, year_level, present_address, permanent_address)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    appResult.insertId,
                    applicant.place_of_birth,
                    applicant.citizenship,
                    applicant.social_media_account,
                    applicant.civil_status_spes,
                    applicant.sex,
                    applicant.type_of_student,
                    applicant.parent_status,
                    applicant.father_name,
                    applicant.father_occupation,
                    applicant.father_contact,
                    applicant.mother_maiden_name,
                    applicant.mother_occupation,
                    applicant.mother_contact,
                    applicant.education_level,
                    applicant.name_of_school,
                    applicant.degree_earned_course,
                    applicant.year_level,
                    applicant.present_address,
                    applicant.permanent_address,
                ]
            );

            await connection.execute(
                `INSERT INTO SPES_Applications
                  (user_id, application_status, form2_path, form2a_path, form4_path, passport_photo_path,
                   birth_cert_path, indigency_path, registration_path, grades_path, philjobnet_screenshot_path)
                 VALUES (?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    REUSED_SPES_FILE,
                    REUSED_SPES_FILE,
                    REUSED_SPES_FILE,
                    REUSED_SPES_FILE,
                    REUSED_SPES_FILE,
                    REUSED_SPES_FILE,
                    REUSED_SPES_FILE,
                    REUSED_SPES_FILE,
                    REUSED_SPES_FILE,
                ]
            );
            console.log('Inserted SPES applicant:', applicant.email);
        }

        for (const applicant of dilpApplicants) {
            const userId = await insertUser(applicant);
            await upsertBeneficiary(userId, applicant);

            const [existingApp] = await connection.execute(
                'SELECT application_id FROM applications WHERE user_id = ? AND program_type = ? LIMIT 1',
                [userId, 'dilp']
            );
            if (existingApp.length > 0) {
                console.log('Skipping existing DILP application for', applicant.email);
                continue;
            }

            const [appResult] = await connection.execute(
                `INSERT INTO applications (user_id, program_type, status, applied_at)
                 VALUES (?, 'dilp', 'Pending', NOW())`,
                [userId]
            );

            await connection.execute(
                `INSERT INTO dilp_details
                  (application_id, project_title, project_type, category, proposed_amount, location, barangay,
                   municipality, district, street, province, contact_person, business_experience,
                   estimated_monthly_income, number_of_beneficiaries, skills_training, valid_id_number, brief_description)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    appResult.insertId,
                    applicant.project_title,
                    applicant.project_type,
                    applicant.category,
                    applicant.proposed_amount,
                    applicant.location,
                    applicant.barangay,
                    applicant.municipality,
                    applicant.district,
                    applicant.street,
                    applicant.province,
                    applicant.contact_person,
                    applicant.business_experience,
                    applicant.estimated_monthly_income,
                    applicant.number_of_beneficiaries,
                    applicant.skills_training,
                    applicant.valid_id_number,
                    applicant.brief_description,
                ]
            );
            console.log('Inserted DILP applicant:', applicant.email);
        }

        console.log('✅ Seeding complete. 5 TUPAD, 5 SPES, and 5 DILP applicants inserted.');
    } catch (error) {
        console.error('❌ Seed failed:', error.message || error);
    } finally {
        if (connection) await connection?.end();
    }
}

seed();
