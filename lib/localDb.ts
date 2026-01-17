import CryptoJS from 'crypto-js';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

const DB_NAME = 'multiuser.db';
const dbDirectory = `${FileSystem.documentDirectory}SQLite`;


const part1 = 'olin-lms';
const part2 = '-super-secure';
const part3 = '-offline-key';
const year = 2025;
const SECRET_KEY = `${part1}${part2}${part3}-${year}`;

const encryptData = (data: string): string => {
  try {
    return CryptoJS.AES.encrypt(data, SECRET_KEY).toString();
  } catch (e) {
    console.error('Encryption failed:', e);
    return data; // Fallback (risky, but prevents crash)
  }
};

// Helper to Decrypt
const decryptData = (ciphertext: string): string => {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    return originalText || ciphertext; // Return decrypted or original if failed
  } catch (e) {
    console.error('Decryption failed:', e);
    return ciphertext;
  }
};

type TimeCheckRecord = {
  user_email: string;
  server_time: string;
  server_time_offset: number;
  last_time_check: number;
  time_check_sequence: number;
  last_online_sync: number;
  manipulation_detected: number;
  cumulative_forward_drift?: number;
  last_drift_reset?: number;
  // NEW: Track suspicious patterns
  recent_jumps_count?: number;       
  last_jump_reset?: number;         
  suspicious_pattern_count?: number;  
};

// Add this type definition near the top of your file
type StudentAnswers = {
  [questionId: number]: {
    type: 'multiple_choice' | 'true_false' | 'essay' | 'identification' | 'enumeration';
    answer: string | number[] | string[]; // Added string[] for enumeration
    isDirty?: boolean;
    submitted_answer?: string | null;
    is_correct?: boolean | null;
    score_earned?: number | null;
  };
};

// Database result types
type CourseDetailRow = {
  course_data: string;
};

type MaterialRow = {
  id: number;
  user_email: string;
  course_id: number;
  title: string;
  file_path: string | null;
  content: string | null;
  material_type: string;
  created_at: string;
  available_at: string | null;
  unavailable_at: string | null;
};

type AssessmentRow = {
  id: number;
  user_email: string;
  course_id: number;
  title: string;
  description: string | null;
  type: string;
  available_at: string | null;
  unavailable_at: string | null;
  max_attempts: number | null;
  duration_minutes: number | null;
  points: number;
  assessment_file_path: string | null;
  assessment_file_url: string | null;
  assessment_data: string;
  allow_answer_review: number;
};

type AssessmentDataRow = {
  data: string;
};

type ReviewDataRow = {
  review_data: string;
};

type QuizAttemptRow = {
  attempt_id: number;
  assessment_id: number;
  user_email: string;
  start_time: string;
  end_time: string | null;
  is_completed: number;
  answers: string | null;
  shuffled_order: string | null;
  server_submission_id: number | null;
};

type CountRow = {
  count: number;
};

type AppStateRow = {
  user_email: string;
  server_time: string;
  server_time_offset: number;
  last_time_check: number;
  time_check_sequence: number;
  last_online_sync: number;
  manipulation_detected: number;
};

type SyncedAssessmentRow = {
  assessment_id: number;
  last_sync_timestamp: string;
};

// Global database instance
let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbInitialized = false;
let initializationPromise: Promise<void> | null = null;
let dbLock = false; // Add a simple lock mechanism

const openDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  try {
    // Wait if another process is opening the database
    while (dbLock) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    dbLock = true;
    
    if (Platform.OS === 'android') {
      await FileSystem.makeDirectoryAsync(dbDirectory, { intermediates: true }).catch(() => {
        // Directory might already exist, ignore error
      });
    }
    
    console.log('📂 Opening database:', DB_NAME);
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    console.log('✅ Database opened successfully');
    
    dbLock = false;
    return db;
  } catch (error) {
    dbLock = false;
    console.error('❌ Failed to open database:', error);
    throw error;
  }
};

export const getDb = async (): Promise<SQLite.SQLiteDatabase> => {
  // If we already have an instance and it's initialized, return it
  if (dbInstance && dbInitialized) {
    return dbInstance;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    await initializationPromise;
    if (dbInstance) {
      return dbInstance;
    }
  }

  // Open a new database instance only if we don't have one
  if (!dbInstance) {
    dbInstance = await openDatabase();
  }
  
  return dbInstance;
};

export const initDb = async (): Promise<void> => {
  if (dbInitialized && dbInstance) {
    console.log('✅ Database already initialized');
    return;
  }
  if (initializationPromise) {
    console.log('⏳ Database initialization in progress, waiting...');
    await initializationPromise;
    return;
  }

  initializationPromise = (async () => {
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`🚀 Initializing database... (attempt ${retryCount + 1})`);
        
        // Close any existing connection first
        if (dbInstance) {
          try {
            await dbInstance.closeAsync();
          } catch (closeError) {
            console.warn('⚠️ Error closing existing database connection:', closeError);
          }
          dbInstance = null;
          dbInitialized = false;
        }
        
        // Wait a bit before retrying
        if (retryCount > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
        
        const db = await openDatabase();
        
        console.log('📄 Creating database schema...');
        
        // Use a transaction for all schema operations to prevent locks
        await db.withTransactionAsync(async () => {
          // ⚠️ REMOVED DROP STATEMENTS - Don't delete existing data!
          // Only create tables if they don't exist
          
          const createStatements = [
            // 1. app_state (independent table)
            `CREATE TABLE IF NOT EXISTS app_state (
              user_email TEXT PRIMARY KEY NOT NULL, 
              server_time TEXT, 
              server_time_offset INTEGER, 
              last_time_check INTEGER, 
              time_check_sequence INTEGER DEFAULT 0,
              last_online_sync INTEGER,
              manipulation_detected INTEGER DEFAULT 0,
              cumulative_forward_drift INTEGER DEFAULT 0,
              last_drift_reset INTEGER,
              recent_jumps_count INTEGER DEFAULT 0,
              last_jump_reset INTEGER,
              suspicious_pattern_count INTEGER DEFAULT 0
            );`,
            
            `CREATE TABLE IF NOT EXISTS sync_metadata (
              user_email TEXT PRIMARY KEY NOT NULL,
              last_full_sync INTEGER DEFAULT 0,
              last_course_sync INTEGER DEFAULT 0,
              last_assessment_sync INTEGER DEFAULT 0,
              last_quiz_sync INTEGER DEFAULT 0
            );`,
            
            // 2. offline_courses (parent table)
            `CREATE TABLE IF NOT EXISTS offline_courses (
              id INTEGER NOT NULL, 
              user_email TEXT NOT NULL, 
              title TEXT NOT NULL, 
              course_code TEXT, 
              description TEXT, 
              program_id INTEGER, 
              program_name TEXT, 
              instructor_id INTEGER, 
              instructor_name TEXT, 
              status TEXT, 
              enrollment_date TEXT NOT NULL,
              PRIMARY KEY (id, user_email)
            );`,
            
            // 3. offline_course_details (references offline_courses)
            `CREATE TABLE IF NOT EXISTS offline_course_details (
              course_id INTEGER NOT NULL, 
              user_email TEXT NOT NULL, 
              course_data TEXT NOT NULL, 
              PRIMARY KEY (course_id, user_email),
              FOREIGN KEY (course_id, user_email) REFERENCES offline_courses(id, user_email) ON DELETE CASCADE
            );`,
            
            // 4. offline_materials (references offline_courses)
            `CREATE TABLE IF NOT EXISTS offline_materials (
              id INTEGER NOT NULL, 
              user_email TEXT NOT NULL, 
              course_id INTEGER NOT NULL, 
              title TEXT NOT NULL, 
              file_path TEXT, 
              content TEXT, 
              material_type TEXT, 
              created_at TEXT, 
              available_at TEXT, 
              unavailable_at TEXT,
              PRIMARY KEY (id, user_email),
              FOREIGN KEY (course_id, user_email) REFERENCES offline_courses(id, user_email) ON DELETE CASCADE
            );`,

            // 4b. offline_material_details (full material JSON including files/links)
            `CREATE TABLE IF NOT EXISTS offline_material_details (
              material_id INTEGER NOT NULL,
              user_email TEXT NOT NULL,
              data TEXT NOT NULL,
              PRIMARY KEY (material_id, user_email),
              FOREIGN KEY (material_id, user_email) REFERENCES offline_materials(id, user_email) ON DELETE CASCADE
            );`,
            
            // 5. offline_assessments (references offline_courses)
            `CREATE TABLE IF NOT EXISTS offline_assessments (
              id INTEGER NOT NULL, 
              user_email TEXT NOT NULL, 
              course_id INTEGER NOT NULL, 
              title TEXT NOT NULL, 
              description TEXT, 
              type TEXT, 
              available_at TEXT, 
              unavailable_at TEXT, 
              max_attempts INTEGER, 
              duration_minutes INTEGER, 
              points INTEGER DEFAULT 0,
              assessment_file_path TEXT, 
              assessment_file_url TEXT, 
              assessment_data TEXT NOT NULL DEFAULT '{}',
              allow_answer_review INTEGER DEFAULT 0,
              PRIMARY KEY (id, user_email),
              FOREIGN KEY (course_id, user_email) REFERENCES offline_courses(id, user_email) ON DELETE CASCADE
            );`,
            
            // 6. offline_assessment_data
            `CREATE TABLE IF NOT EXISTS offline_assessment_data (
              assessment_id INTEGER NOT NULL, 
              user_email TEXT NOT NULL, 
              data TEXT NOT NULL, 
              PRIMARY KEY (assessment_id, user_email),
              FOREIGN KEY (assessment_id, user_email) REFERENCES offline_assessments(id, user_email) ON DELETE CASCADE
            );`,

            // 6b. offline_assessment_details (full assessment JSON including files/links)
            `CREATE TABLE IF NOT EXISTS offline_assessment_details (
              assessment_id INTEGER NOT NULL,
              user_email TEXT NOT NULL,
              data TEXT NOT NULL,
              PRIMARY KEY (assessment_id, user_email),
              FOREIGN KEY (assessment_id, user_email) REFERENCES offline_assessments(id, user_email) ON DELETE CASCADE
            );`,
            
            // 7. offline_assessment_sync
            `CREATE TABLE IF NOT EXISTS offline_assessment_sync (
              assessment_id INTEGER NOT NULL, 
              user_email TEXT NOT NULL, 
              last_sync_timestamp TEXT NOT NULL, 
              PRIMARY KEY (assessment_id, user_email),
              FOREIGN KEY (assessment_id, user_email) REFERENCES offline_assessments(id, user_email) ON DELETE CASCADE
            );`,
            
            // 8. offline_submissions - Updated to support multiple files
            // files_json stores JSON array: [{uri, name, type, size}, ...]
            // file_uri and original_filename kept for backward compatibility
            `CREATE TABLE IF NOT EXISTS offline_submissions (
              id INTEGER PRIMARY KEY AUTOINCREMENT, 
              user_email TEXT NOT NULL, 
              assessment_id INTEGER NOT NULL, 
              file_uri TEXT NOT NULL, 
              original_filename TEXT NOT NULL, 
              files_json TEXT,
              submission_status TEXT NOT NULL, 
              submitted_at TEXT NOT NULL,
              UNIQUE(user_email, assessment_id) ON CONFLICT REPLACE,
              FOREIGN KEY (assessment_id, user_email) REFERENCES offline_assessments(id, user_email) ON DELETE CASCADE
            );`,
            
            // 9. offline_quiz_questions
            `CREATE TABLE IF NOT EXISTS offline_quiz_questions (
              id INTEGER NOT NULL, 
              user_email TEXT NOT NULL, 
              assessment_id INTEGER NOT NULL, 
              question_text TEXT NOT NULL, 
              question_type TEXT NOT NULL, 
              options TEXT, 
              correct_answer TEXT, 
              points INTEGER, 
              order_index INTEGER, 
              question_data TEXT NOT NULL,
              PRIMARY KEY (id, user_email),
              FOREIGN KEY (assessment_id, user_email) REFERENCES offline_assessments(id, user_email) ON DELETE CASCADE
            );`,
            
            // 10. offline_quiz_attempts
            `CREATE TABLE IF NOT EXISTS offline_quiz_attempts (
              attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
              assessment_id INTEGER NOT NULL,
              user_email TEXT NOT NULL,
              start_time TEXT NOT NULL,
              end_time TEXT,
              is_completed INTEGER DEFAULT 0,
              answers TEXT,
              shuffled_order TEXT, 
              server_submission_id INTEGER,
              FOREIGN KEY (assessment_id, user_email) REFERENCES offline_assessments(id, user_email) ON DELETE CASCADE
            );`,
            
            // 11. offline_quiz_question_submissions
            `CREATE TABLE IF NOT EXISTS offline_quiz_question_submissions (
              submission_id INTEGER PRIMARY KEY AUTOINCREMENT,
              attempt_id INTEGER NOT NULL,
              question_id INTEGER NOT NULL,
              submitted_answer TEXT,
              max_points INTEGER NOT NULL DEFAULT 1,
              FOREIGN KEY (attempt_id) REFERENCES offline_quiz_attempts(attempt_id) ON DELETE CASCADE
            );`,
            
            // 12. offline_quiz_option_selections
            `CREATE TABLE IF NOT EXISTS offline_quiz_option_selections (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              submission_id INTEGER NOT NULL,
              option_id INTEGER NOT NULL,
              option_text TEXT NOT NULL,
              is_selected INTEGER NOT NULL DEFAULT 0,
              is_correct_option INTEGER NOT NULL DEFAULT 0,
              FOREIGN KEY (submission_id) REFERENCES offline_quiz_question_submissions(submission_id) ON DELETE CASCADE
            );`,

            `CREATE TABLE IF NOT EXISTS offline_assessment_reviews (
              assessment_id INTEGER NOT NULL,
              user_email TEXT NOT NULL,
              review_data TEXT NOT NULL,
              PRIMARY KEY (assessment_id, user_email),
              FOREIGN KEY (assessment_id, user_email) REFERENCES offline_assessments(id, user_email) ON DELETE CASCADE
            );`,

            `CREATE TABLE IF NOT EXISTS unlocked_assessments (
              assessment_id INTEGER NOT NULL,
              user_email TEXT NOT NULL,
              PRIMARY KEY (assessment_id, user_email),
              FOREIGN KEY (assessment_id, user_email) REFERENCES offline_assessments(id, user_email) ON DELETE CASCADE
            );`
          ];
          
          for (const statement of createStatements) {
            await db.execAsync(statement);
          }
        });

        console.log('✅ All tables created successfully with proper schema.');
        
        dbInstance = db;
        dbInitialized = true;
        console.log('✅ Database initialization complete');
        return; // Success, exit retry loop
        
      } catch (error) {
        retryCount++;
        console.error(`❌ Database initialization failed (attempt ${retryCount}):`, error);
        
        if (retryCount >= maxRetries) {
          throw error;
        }
        
        // Clean up on failure
        if (dbInstance) {
          try {
            await dbInstance.closeAsync();
          } catch (closeError) {
            console.warn('⚠️ Error closing database after failed initialization:', closeError);
          }
          dbInstance = null;
          dbInitialized = false;
        }
      }
    }
  })();
  
  await initializationPromise;
  initializationPromise = null;
};


// COURSES
export const saveCourseToDb = async (course: any, userEmail: string): Promise<void> => {
  try {
    await initDb(); // Ensure DB is initialized
    const db = await getDb();
    
    console.log('ðŸ’¾ Saving course to local DB for user:', userEmail);
    
    const currentTime = new Date().toISOString();

    await db.runAsync(
      `INSERT OR REPLACE INTO offline_courses
       (id, user_email, title, course_code, description, program_id, program_name, instructor_id, instructor_name, status, enrollment_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        course.id,
        userEmail, // <-- New parameter
        course.title || '',
        course.course_code || '',
        course.description || '',
        course.program?.id || null,
        course.program?.name || '',
        course.instructor?.id || null,
        course.instructor?.name || '',
        course.status || 'Enrolled',
        currentTime
      ]
    );
    
    console.log('âœ… Saved course to local DB:', course.title);
  } catch (error) {
    console.error('âŒ Failed to save course to local DB:', error);
    throw error;
  }
};

export const saveCourseDetailsToDb = async (course: any, userEmail: string): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    
    // ENHANCED: Better validation with more specific error messages
    if (!course) {
      console.error('❌ Course parameter is null or undefined');
      throw new Error('Course parameter is required and cannot be null');
    }
    
    // CRITICAL FIX: Handle string IDs and validate properly
    let courseId: number;
    if (typeof course.id === 'string') {
      courseId = parseInt(course.id, 10);
    } else if (typeof course.id === 'number') {
      courseId = course.id;
    } else {
      courseId = 0; // Will fail validation below
    }
    
    if (!courseId || isNaN(courseId) || courseId <= 0) {
      console.error('❌ Invalid course.id after conversion:', {
        originalId: course.id,
        originalType: typeof course.id,
        convertedId: courseId,
        convertedType: typeof courseId,
        isNaN: isNaN(courseId)
      });
      console.error('❌ Course object:', JSON.stringify(course, null, 2));
      throw new Error(`Invalid course.id: ${course.id} (converted to ${courseId}). Must be a positive number.`);
    }
    
    // Update the course object with the validated numeric ID
    course.id = courseId;
    
    if (!userEmail || userEmail.trim() === '') {
      console.error('❌ Invalid userEmail:', userEmail);
      throw new Error(`Invalid userEmail: ${userEmail}. Must be a non-empty string.`);
    }
    
    console.log('💾 Saving detailed course data for user:', userEmail, ' and course:', courseId);
    console.log(`📋 Validated - Course ID: ${courseId} (type: ${typeof courseId}), User: "${userEmail}"`);

    const courseDataString = JSON.stringify(course);
    const encryptedCourseData = encryptData(courseDataString);

    await db.runAsync(
      `INSERT OR REPLACE INTO offline_course_details (course_id, user_email, course_data) VALUES (?, ?, ?);`,
      [courseId, userEmail, encryptedCourseData] 
    );

    // Separate and save materials and assessments from topics
    const materialsToSave = [];
    const assessmentsToSave = [];

    // Extract materials and assessments from nested topics
    if (course.topics && Array.isArray(course.topics)) {
      for (const topic of course.topics) {
        if (topic.materials && Array.isArray(topic.materials)) {
          materialsToSave.push(...topic.materials);
        }
        if (topic.assessments && Array.isArray(topic.assessments)) {
          assessmentsToSave.push(...topic.assessments);
        }
      }
    }
    
    // Handle independent assessments (not in a topic)
    if (course.assessments && Array.isArray(course.assessments)) {
      assessmentsToSave.push(...course.assessments);
    }
    
    // Handle independent materials (not in a topic)
    if (course.materials && Array.isArray(course.materials)) {
      materialsToSave.push(...course.materials);
    }
    
    // ENHANCED: Better logging and validation before calling sub-functions
    console.log(`📊 Found ${materialsToSave.length} materials and ${assessmentsToSave.length} assessments to save for course ${courseId}`);
    
    // Save the materials with error handling
    if (materialsToSave.length > 0) {
      try {
        console.log(`🔄 About to save ${materialsToSave.length} materials with courseId: ${courseId} (${typeof courseId}) and userEmail: "${userEmail}"`);
        await saveMaterialsToDb(materialsToSave, courseId, userEmail);
      } catch (materialError) {
        console.error('❌ Failed to save materials for course', courseId, ':', materialError);
        // Don't throw here, continue with assessments
      }
    }
    
    // Save the assessments with error handling
    if (assessmentsToSave.length > 0) {
      try {
        console.log(`🔄 About to save ${assessmentsToSave.length} assessments with courseId: ${courseId} (${typeof courseId}) and userEmail: "${userEmail}"`);
        await saveAssessmentsToDb(assessmentsToSave, courseId, userEmail);
      } catch (assessmentError) {
        console.error('❌ Failed to save assessments for course', courseId, ':', assessmentError);
        // Don't throw here, the course details are already saved
      }
    }

    console.log('✅ Detailed course data saved successfully.');
  } catch (error) {
    console.error('❌ Failed to save detailed course data:', error);
    console.error('❌ Parameters received:', { 
      courseId: course?.id, 
      courseType: typeof course?.id,
      userEmail: userEmail,
      userEmailType: typeof userEmail 
    });
    throw error;
  }
};

export const refreshAllMaterialsForCourse = async (
  courseId: number,
  userEmail: string,
  apiInstance: any
): Promise<{ success: boolean }> => {
  try {
    console.log(`🔄 Refreshing materials for course ${courseId}...`);
    
    // Fetch fresh course details
    const response = await apiInstance.get(`/courses/${courseId}`);
    if (response.status !== 200) return { success: false };
    
    const detailedCourse = response.data.course;
    
    // Extract all materials
    const materialsToSave: any[] = [];
    
    if (detailedCourse.topics && Array.isArray(detailedCourse.topics)) {
      for (const topic of detailedCourse.topics) {
        if (topic.materials && Array.isArray(topic.materials)) {
          materialsToSave.push(...topic.materials);
        }
      }
    }
    
    if (detailedCourse.materials && Array.isArray(detailedCourse.materials)) {
      materialsToSave.push(...detailedCourse.materials);
    }
    
    // Delete old materials and save fresh ones
    if (materialsToSave.length > 0) {
      const db = await getDb();
      await db.runAsync(
        `DELETE FROM offline_materials WHERE course_id = ? AND user_email = ?;`,
        [courseId, userEmail]
      );
      
      await saveMaterialsToDb(materialsToSave, courseId, userEmail);
      console.log(`✅ Refreshed ${materialsToSave.length} materials for course ${courseId}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to refresh materials for course ${courseId}:`, error);
    return { success: false };
  }
};

export const getCourseDetailsFromDb = async (courseId: number, userEmail: string): Promise<any | null> => {
  try {
    await initDb();
    const db = await getDb();

    const result = await db.getAllAsync<CourseDetailRow>(
      `SELECT course_data FROM offline_course_details WHERE course_id = ? AND user_email = ?;`,
      [courseId, userEmail]
    );
    
    if (result && result.length > 0) {
      // --- MODIFIED: Decrypt the data before parsing ---
      const encryptedData = result[0].course_data;
      const decryptedData = decryptData(encryptedData);
      return JSON.parse(decryptedData);
    }
    
    return null;
  } catch (error) {
    console.error('❌ Failed to get course details:', error);
    return null;
  }
};

export const getEnrolledCoursesFromDb = async (userEmail: string) => {
  try {
    await initDb(); // Ensure DB is initialized
    const db = await getDb();
    
    const resultSet = await db.getAllAsync(
      `SELECT * FROM offline_courses WHERE user_email = ? ORDER BY enrollment_date DESC;`,
      [userEmail] // <-- New parameter
    );
    
    // Transform the data to match the expected format
    const courses = (resultSet || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      course_code: row.course_code,
      description: row.description,
      credits: 0, // Default value since we don't store this
      program: {
        id: row.program_id,
        name: row.program_name
      },
      instructor: row.instructor_id ? {
        id: row.instructor_id,
        name: row.instructor_name
      } : null,
      status: row.status,
      pivot: {
        status: row.status,
        enrollment_date: row.enrollment_date
      }
    }));
    
    console.log(`âœ… Retrieved ${courses.length} courses from local DB for user: ${userEmail}`);
    return courses;
  } catch (error) {
    console.error('âŒ Failed to get enrolled courses from local DB:', error);
    return [];
  }
};

export const deleteCourseAndRelatedDataFromDb = async (courseId: number, userEmail: string): Promise<void> => {
  if (!courseId || !userEmail) throw new Error('Valid courseId and userEmail are required.');

  try {
    const db = await getDb();
    console.log(`🗑️ Starting smart deletion for course ${courseId}...`);

    await db.withTransactionAsync(async () => {
      // 1. Identify Assessments that MUST be kept (Pending Submissions or Unsynced Quizzes)
      const pendingSubmissions = await db.getAllAsync<{ assessment_id: number }>(
        `SELECT assessment_id FROM offline_submissions WHERE user_email = ? AND submission_status = 'to sync'`,
        [userEmail]
      );
      
      const pendingQuizzes = await db.getAllAsync<{ assessment_id: number }>(
        `SELECT assessment_id FROM offline_quiz_attempts WHERE user_email = ? AND is_completed = 1`,
        [userEmail]
      );

      // Create a Set of IDs to protect
      const protectedAssessmentIds = new Set([
        ...pendingSubmissions.map(s => s.assessment_id),
        ...pendingQuizzes.map(q => q.assessment_id)
      ]);

      // 2. Delete Course Materials (Safe to delete)
      await db.runAsync(`DELETE FROM offline_materials WHERE course_id = ? AND user_email = ?;`, [courseId, userEmail]);
      
      // 3. Delete Course Details blob (Safe to delete)
      await db.runAsync(`DELETE FROM offline_course_details WHERE course_id = ? AND user_email = ?;`, [courseId, userEmail]);

      // 4. Delete Assessments NOT in the protected list
      const allCourseAssessments = await db.getAllAsync<{ id: number }>(
        `SELECT id FROM offline_assessments WHERE course_id = ? AND user_email = ?`,
        [courseId, userEmail]
      );

      for (const assessment of allCourseAssessments) {
        if (!protectedAssessmentIds.has(assessment.id)) {
          // No pending work, safe to delete.
          // Due to CASCADE settings, deleting the assessment deletes its child data.
          await db.runAsync(
            `DELETE FROM offline_assessments WHERE id = ? AND user_email = ?`, 
            [assessment.id, userEmail]
          );
        }
      }

      // 5. Delete the Course ONLY if no assessments remain
      const remainingAssessments = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM offline_assessments WHERE course_id = ? AND user_email = ?`,
        [courseId, userEmail]
      );

      if (remainingAssessments && remainingAssessments.count === 0) {
        await db.runAsync(`DELETE FROM offline_courses WHERE id = ? AND user_email = ?;`, [courseId, userEmail]);
        console.log(`✅ Completely deleted course ${courseId}`);
      } else {
        console.log(`⚠️ Preserved course ${courseId} shell because pending assessments exist.`);
      }
    });

  } catch (error) {
    console.error(`❌ Error deleting course ${courseId}:`, error);
    throw error;
  }
};



// MATERIALS
export const saveMaterialsToDb = async (materials: any[], courseId: number, userEmail: string): Promise<void> => {
  if (!materials || materials.length === 0) {
    console.log('📝 No materials to save for course:', courseId);
    return;
  }
  
  // FIXED: More specific validation with better error messages
  if (!courseId || courseId === 0) {
    console.error('❌ Invalid courseId parameter for materials:', courseId);
    console.error('❌ Called with parameters:', { materials: materials?.length, courseId, userEmail });
    throw new Error(`Invalid courseId for materials: ${courseId}. Must be a positive number.`);
  }
  
  if (!userEmail || userEmail.trim() === '') {
    console.error('❌ Invalid userEmail parameter for materials:', userEmail);
    console.error('❌ Called with parameters:', { materials: materials?.length, courseId, userEmail });
    throw new Error(`Invalid userEmail for materials: ${userEmail}. Must be a non-empty string.`);
  }
  
  await initDb();
  const db = await getDb();
  console.log('💾 Saving materials for course:', courseId, 'user:', userEmail);

  await db.withTransactionAsync(async () => {
    for (const material of materials) {
      try {
        if (!material.id) continue;

        // 🔒 SECURITY FIX: Encrypt sensitive fields
        const encryptedFilePath = material.file_path ? encryptData(material.file_path) : '';
        const encryptedContent = material.content ? encryptData(material.content) : '';

        await db.runAsync(
          `INSERT OR REPLACE INTO offline_materials 
           (id, user_email, course_id, title, file_path, content, material_type, created_at, available_at, unavailable_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            material.id,
            userEmail,
            courseId,
            material.title || 'Untitled', // Titles are usually fine in plain text for UI lists
            encryptedFilePath, // ✅ Now Encrypted
            encryptedContent,  // ✅ Now Encrypted
            material.type || 'document',
            material.created_at || new Date().toISOString(),
            material.available_at || null,
            material.unavailable_at || null
          ]
        );

        // Cache full material JSON (includes files/links arrays if present)
        try {
          const fullEncrypted = encryptData(JSON.stringify(material ?? {}));
          await db.runAsync(
            `INSERT OR REPLACE INTO offline_material_details (material_id, user_email, data) VALUES (?, ?, ?);`,
            [material.id, userEmail, fullEncrypted]
          );
        } catch (detailErr) {
          console.error('❌ Failed to save material full details:', detailErr);
        }
      } catch (materialError) {
        console.error('❌ Failed to save material:', materialError);
      }
    }
  });
  console.log(`✅ Saved materials for course ${courseId}`);
};

export const getMaterialDetailsFromDb = async (materialId: number, userEmail: string): Promise<any | null> => {
  try {
    const db = await getDb();
    const result = await db.getFirstAsync<MaterialRow>(
      `SELECT * FROM offline_materials WHERE id = ? AND user_email = ?;`,
      [materialId, userEmail]
    );
    
    if (result) {
      // 🔓 Decrypt fields before returning to UI
      return {
        ...result,
        file_path: result.file_path ? decryptData(result.file_path) : '',
        content: result.content ? decryptData(result.content) : ''
      };
    }
    return null;
  } catch (error) {
    console.error(`❌ Failed to get material ${materialId}:`, error);
    return null;
  }
};

export const saveMaterialFullDetailsToDb = async (
  materialId: number,
  userEmail: string,
  materialData: any
): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    const dataString = JSON.stringify(materialData ?? {});
    const encrypted = encryptData(dataString);
    await db.runAsync(
      `INSERT OR REPLACE INTO offline_material_details (material_id, user_email, data) VALUES (?, ?, ?);`,
      [materialId, userEmail, encrypted]
    );
  } catch (error) {
    console.error(`❌ Failed to save material details ${materialId}:`, error);

    // If FK constraints are enabled and the base row is missing, create a minimal base row and retry.
    try {
      await initDb();
      const db = await getDb();
      const courseId = Number(materialData?.course_id || 0);
      if (courseId > 0) {
        const encryptedFilePath = materialData?.file_path ? encryptData(String(materialData.file_path)) : '';
        const encryptedContent = materialData?.content ? encryptData(String(materialData.content)) : '';
        await db.runAsync(
          `INSERT OR REPLACE INTO offline_materials 
           (id, user_email, course_id, title, file_path, content, material_type, created_at, available_at, unavailable_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            materialId,
            userEmail,
            courseId,
            String(materialData?.title || 'Untitled'),
            encryptedFilePath,
            encryptedContent,
            String(materialData?.type || materialData?.material_type || 'document'),
            String(materialData?.created_at || new Date().toISOString()),
            materialData?.available_at || null,
            materialData?.unavailable_at || null,
          ]
        );

        const encryptedFull = encryptData(JSON.stringify(materialData ?? {}));
        await db.runAsync(
          `INSERT OR REPLACE INTO offline_material_details (material_id, user_email, data) VALUES (?, ?, ?);`,
          [materialId, userEmail, encryptedFull]
        );
      }
    } catch (retryErr) {
      console.error(`❌ Failed to retry save material details ${materialId}:`, retryErr);
    }
  }
};

export const getMaterialFullDetailsFromDb = async (
  materialId: number,
  userEmail: string
): Promise<any | null> => {
  try {
    const db = await getDb();
    const result = await db.getFirstAsync<{ data: string }>(
      `SELECT data FROM offline_material_details WHERE material_id = ? AND user_email = ?;`,
      [materialId, userEmail]
    );
    if (!result?.data) return null;
    const decrypted = decryptData(result.data);
    return JSON.parse(decrypted);
  } catch (error) {
    console.error(`❌ Failed to get material details ${materialId}:`, error);
    return null;
  }
};


// ASSESSMENTS

export const saveAssessmentsToDb = async (assessments: any[], courseId: number, userEmail: string): Promise<void> => {
  if (!assessments || assessments.length === 0) {
    console.log('📝 No assessments to save for course:', courseId);
    return;
  }
  
  // ENHANCED: More specific validation with proper courseId handling
  let validCourseId: number;
  
  // Handle string courseId conversion
  if (typeof courseId === 'string') {
    validCourseId = parseInt(courseId, 10);
  } else if (typeof courseId === 'number') {
    validCourseId = courseId;
  } else {
    console.error('❌ Invalid courseId type:', typeof courseId, courseId);
    throw new Error(`Invalid courseId type: ${typeof courseId}. Must be a number or numeric string.`);
  }
  
  // Validate the parsed courseId
  if (isNaN(validCourseId) || validCourseId <= 0) {
    console.error('❌ Invalid courseId parameter (NaN or invalid):', {
      originalCourseId: courseId,
      parsedCourseId: validCourseId,
      type: typeof courseId,
      isNaN: isNaN(validCourseId),
      isNumber: typeof validCourseId === 'number'
    });
    console.error('❌ Called with parameters:', { 
      assessments: assessments?.length, 
      courseId, 
      userEmail,
      courseIdType: typeof courseId
    });
    
    // Try to extract courseId from the assessment itself as fallback
    if (assessments.length > 0 && assessments[0].course_id) {
      validCourseId = parseInt(assessments[0].course_id, 10);
      console.log('🔄 Using courseId from assessment data as fallback:', validCourseId);
      
      if (isNaN(validCourseId) || validCourseId <= 0) {
        throw new Error(`Invalid courseId even from assessment fallback: ${validCourseId}. Cannot save assessments.`);
      }
    } else {
      throw new Error(`Invalid courseId: ${courseId} (parsed: ${validCourseId}). Must be a positive number and no fallback available.`);
    }
  }
  
  if (!userEmail || userEmail.trim() === '') {
    console.error('❌ Invalid userEmail parameter:', userEmail);
    console.error('❌ Called with parameters:', { assessments: assessments?.length, courseId: validCourseId, userEmail });
    throw new Error(`Invalid userEmail: ${userEmail}. Must be a non-empty string.`);
  }
  
  await initDb();
  const db = await getDb();
  console.log('💾 Saving assessments for course:', validCourseId, 'user:', userEmail);
  
  await db.withTransactionAsync(async () => {
    for (const assessment of assessments) {
      try {
        console.log(`💾 Saving assessment: ${assessment.title} (ID: ${assessment.id})`);
        
        await db.runAsync(
          `INSERT OR REPLACE INTO offline_assessments 
           (id, course_id, user_email, title, type, description, available_at, unavailable_at, 
            max_attempts, duration_minutes, points, assessment_file_path, assessment_file_url, allow_answer_review) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            assessment.id,
            validCourseId,
            userEmail,
            assessment.title || '',
            assessment.type || '',
            assessment.description || '',
            assessment.available_at || null,
            assessment.unavailable_at || null,
            assessment.max_attempts || null,
            assessment.duration_minutes || null,
            assessment.total_points ?? assessment.points ?? 0,
            assessment.assessment_file_path || null,
            assessment.assessment_file_url || null,
            assessment.allow_answer_review ? 1 : 0, // Add this field
          ]
        );

        // Cache full assessment JSON (includes files/links arrays if present)
        try {
          const fullEncrypted = encryptData(JSON.stringify(assessment ?? {}));
          await db.runAsync(
            `INSERT OR REPLACE INTO offline_assessment_details (assessment_id, user_email, data) VALUES (?, ?, ?);`,
            [assessment.id, userEmail, fullEncrypted]
          );
        } catch (detailErr) {
          console.error('❌ Failed to save assessment full details:', detailErr);
        }
      } catch (error) {
        console.error(`❌ Failed to save assessment ${assessment.id}:`, error);
        throw error;
      }
    }
  });
  
  console.log(`✅ Saved ${assessments.length} assessments for course ${validCourseId}`);
};

export const hasAssessmentDetailsSaved = async (
  assessmentId: number,
  userEmail: string
): Promise<boolean> => {
  try {
    const db = await getDb();
    const result = await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM offline_assessment_data 
       WHERE assessment_id = ? AND user_email = ?;`,
      [assessmentId, userEmail]
    );
    return (result as any)?.count > 0;
  } catch (error) {
    console.error('Error checking assessment details:', error);
    return false;
  }
};

export const saveAssessmentDetailsToDb = async (
  assessmentId: number | string,
  userEmail: string,
  attemptStatus: any,
  latestSubmission: any
): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();

    const assessmentData = {
      attemptStatus: attemptStatus || null,
      latestSubmission: latestSubmission || null,
    };

    // --- MODIFIED: Encrypt data ---
    const dataString = JSON.stringify(assessmentData);
    const encryptedData = encryptData(dataString);

    await db.runAsync(
      `INSERT OR REPLACE INTO offline_assessment_data (assessment_id, user_email, data) VALUES (?, ?, ?);`,
      [assessmentId, userEmail, encryptedData] // <-- Saved encrypted
    );

    console.log('✅ Detailed assessment data saved successfully.');
  } catch (error) {
    console.error('❌ Failed to save detailed assessment data:', error);
    throw error;
  }
};

export const saveAssessmentFullDetailsToDb = async (
  assessmentId: number | string,
  userEmail: string,
  assessmentData: any
): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    const dataString = JSON.stringify(assessmentData ?? {});
    const encrypted = encryptData(dataString);
    await db.runAsync(
      `INSERT OR REPLACE INTO offline_assessment_details (assessment_id, user_email, data) VALUES (?, ?, ?);`,
      [assessmentId, userEmail, encrypted]
    );
  } catch (error) {
    console.error(`❌ Failed to save assessment details ${assessmentId}:`, error);

    // If FK constraints are enabled and the base row is missing, create a minimal base row and retry.
    try {
      await initDb();
      const db = await getDb();
      const courseId = Number(assessmentData?.course_id || 0);
      const idNum = Number(assessmentId);
      if (courseId > 0 && Number.isFinite(idNum) && idNum > 0) {
        await db.runAsync(
          `INSERT OR REPLACE INTO offline_assessments
           (id, course_id, user_email, title, type, description, available_at, unavailable_at,
            max_attempts, duration_minutes, points, assessment_file_path, assessment_file_url, allow_answer_review)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            idNum,
            courseId,
            userEmail,
            String(assessmentData?.title || ''),
            String(assessmentData?.type || ''),
            String(assessmentData?.description || ''),
            assessmentData?.available_at || null,
            assessmentData?.unavailable_at || null,
            assessmentData?.max_attempts || null,
            assessmentData?.duration_minutes || null,
            assessmentData?.total_points ?? assessmentData?.points ?? 0,
            assessmentData?.assessment_file_path || null,
            assessmentData?.assessment_file_url || null,
            assessmentData?.allow_answer_review ? 1 : 0,
          ]
        );

        const encryptedFull = encryptData(JSON.stringify(assessmentData ?? {}));
        await db.runAsync(
          `INSERT OR REPLACE INTO offline_assessment_details (assessment_id, user_email, data) VALUES (?, ?, ?);`,
          [idNum, userEmail, encryptedFull]
        );
      }
    } catch (retryErr) {
      console.error(`❌ Failed to retry save assessment details ${assessmentId}:`, retryErr);
    }
  }
};

export const getAssessmentFullDetailsFromDb = async (
  assessmentId: number | string,
  userEmail: string
): Promise<any | null> => {
  try {
    const db = await getDb();
    const result = await db.getFirstAsync<{ data: string }>(
      `SELECT data FROM offline_assessment_details WHERE assessment_id = ? AND user_email = ?;`,
      [assessmentId, userEmail]
    );
    if (!result?.data) return null;
    const decrypted = decryptData(result.data);
    return JSON.parse(decrypted);
  } catch (error) {
    console.error(`❌ Failed to get assessment details ${assessmentId}:`, error);
    return null;
  }
};

export const getAssessmentsWithoutDetails = async (userEmail: string): Promise<number[]> => {
  try {
    await initDb();
    const db = await getDb();
    
    // Get all assessment IDs for the user
    const allAssessments = await db.getAllAsync(
      `SELECT DISTINCT id FROM offline_assessments WHERE user_email = ?;`,
      [userEmail]
    );
    
    // Get assessment IDs that already have detailed data
    const assessmentsWithData = await db.getAllAsync(
      `SELECT DISTINCT assessment_id FROM offline_assessment_data WHERE user_email = ?;`,
      [userEmail]
    );
    
    const allAssessmentIds = allAssessments.map((row: any) => row.id);
    const assessmentIdsWithData = assessmentsWithData.map((row: any) => row.assessment_id);
    
    // Return IDs that don't have detailed data
    const assessmentsWithoutData = allAssessmentIds.filter(
      id => !assessmentIdsWithData.includes(id)
    );
    
    console.log(`ðŸ“Š Found ${assessmentsWithoutData.length} assessments without detailed data`);
    return assessmentsWithoutData;
  } catch (error) {
    console.error('âŒ Failed to get assessments without details:', error);
    return [];
  }
};

export const checkIfAssessmentNeedsDetails = async (assessmentId: number, userEmail: string): Promise<boolean> => {
  try {
    const db = await getDb();
    const result = await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM offline_assessment_data WHERE assessment_id = ? AND user_email = ?;`,
      [assessmentId, userEmail]
    );
    return (result as any)?.count === 0;
  } catch (error) {
    console.error('âŒ Error checking assessment details:', error);
    return true; // Assume it needs details if there's an error
  }
};

export const deleteAllAssessmentDetails = async (userEmail: string): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    
    console.log(`ðŸ—‘ï¸ Deleting all assessment data for user: ${userEmail}`);

    await db.runAsync(`DELETE FROM offline_assessments WHERE user_email = ?;`, [userEmail]);
    await db.runAsync(`DELETE FROM offline_assessment_data WHERE user_email = ?;`, [userEmail]);

    console.log('âœ… All assessment data cleared successfully.');
  } catch (error) {
    console.error('âŒ Failed to delete all assessment data:', error);
    throw error;
  }
};

export const downloadAllAssessmentDetails = async (
  userEmail: string, 
  apiInstance: any,
  onProgress?: (current: number, total: number, skipped?: number) => void
): Promise<{ success: number, failed: number, skipped: number }> => {
  try {
    const assessmentIds = await getAssessmentsWithoutDetails(userEmail);
    if (assessmentIds.length === 0) {
      console.log('All assessments already have detailed data');
      return { success: 0, failed: 0, skipped: 0 };
    }
    
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    
    console.log(`Starting download for ${assessmentIds.length} assessments`);
    
    for (let i = 0; i < assessmentIds.length; i++) {
      const assessmentId = assessmentIds[i];
      
      try {
        if (onProgress) {
          onProgress(i + 1, assessmentIds.length, skippedCount);
        }
        
        // Check if assessment details are already saved
        const hasDetails = await hasAssessmentDetailsSaved(assessmentId, userEmail);
        if (hasDetails) {
          console.log(`Assessment ${assessmentId} details already saved, skipping`);
          skippedCount++;
          continue;
        }
        
        let attemptStatus = null;
        let latestSubmission = null;
        
        const db = await getDb();
        const assessmentResult = await db.getFirstAsync(
          `SELECT type FROM offline_assessments WHERE id = ? AND user_email = ?;`,
          [assessmentId, userEmail]
        );
        
        if (!assessmentResult) {
          console.warn(`Assessment ${assessmentId} not found in local DB`);
          failedCount++;
          continue;
        }
        
        const assessmentType = (assessmentResult as any).type;
        
        // Fetch attempt status for quiz/exam types
        if (assessmentType === 'quiz' || assessmentType === 'exam') {
          try {
            const attemptResponse = await apiInstance.get(`/assessments/${assessmentId}/attempt-status`);
            if (attemptResponse.status === 200) {
              attemptStatus = attemptResponse.data;
            }
          } catch (error) {
            console.warn(`Failed to fetch attempt status for assessment ${assessmentId}`);
          }
        }
        
        // Fetch latest submission for assignment types
        if (['assignment', 'activity', 'project'].includes(assessmentType)) {
          try {
            const submissionResponse = await apiInstance.get(`/assessments/${assessmentId}/latest-assignment-submission`);
            if (submissionResponse.status === 200) {
              latestSubmission = submissionResponse.data;
            }
          } catch (error) {
            console.warn(`Failed to fetch submission for assessment ${assessmentId}`);
          }
        }
        
        await saveAssessmentDetailsToDb(assessmentId, userEmail, attemptStatus, latestSubmission);
        successCount++;
        
        console.log(`Downloaded details for assessment ${assessmentId}`);
        
      } catch (error) {
        console.error(`Failed to download details for assessment ${assessmentId}:`, error);
        failedCount++;
      }
    }
    
    console.log(`Download completed: ${successCount} successful, ${failedCount} failed, ${skippedCount} skipped`);
    return { success: successCount, failed: failedCount, skipped: skippedCount };
    
  } catch (error) {
    console.error('Batch download failed:', error);
    throw error;
  }
};

export const getAssessmentDetailsFromDb = async (assessmentId: number | string, userEmail: string): Promise<any | null> => {
  try {
    const db = await getDb();
    
    // First, get the base assessment details
    const assessmentResult = await db.getFirstAsync<AssessmentRow>(
      `SELECT * FROM offline_assessments WHERE id = ? AND user_email = ?;`,
      [assessmentId, userEmail]
    );

    if (!assessmentResult) {
      return null;
    }

    // Convert allow_answer_review from INTEGER to boolean
    const assessmentData = {
      ...assessmentResult,
      allow_answer_review: assessmentResult.allow_answer_review === 1,
      total_points: assessmentResult.points
    };

    // Then, get the dynamic data (attempt status, submission)
    const dataResult = await db.getFirstAsync<AssessmentDataRow>(
      `SELECT data FROM offline_assessment_data WHERE assessment_id = ? AND user_email = ?;`,
      [assessmentId, userEmail]
    );

    let additionalData = {
      attemptStatus: null,
      latestSubmission: null,
    };

    if (dataResult && dataResult.data) {
      const decryptedData = decryptData(dataResult.data);
      additionalData = JSON.parse(decryptedData);
    }

    // Combine the two results
    return {
      ...assessmentData,
      attemptStatus: additionalData.attemptStatus,
      latestSubmission: additionalData.latestSubmission,
    };
  } catch (error) {
    console.error(`❌ Failed to get assessment ${assessmentId} from DB:`, error);
    return null;
  }
};

export const saveOfflineSubmission = async (
  userEmail: string,
  assessmentId: number,
  fileUri: string,
  originalFilename: string,
  submittedAt?: string // Optional parameter for server time
) => {
  try {
    await initDb();
    const db = await getDb();
    
    // Use provided server time or fallback to current server time calculation
    let finalSubmittedAt = submittedAt;
    if (!finalSubmittedAt) {
      const serverTime = await getSavedServerTime(userEmail);
      finalSubmittedAt = serverTime || new Date().toISOString();
    }
    
    const encryptedUri = encryptData(fileUri);

    await db.runAsync(
      `INSERT OR REPLACE INTO offline_submissions (user_email, assessment_id, file_uri, original_filename, submission_status, submitted_at) VALUES (?, ?, ?, ?, ?, ?);`,
      [userEmail, assessmentId, encryptedUri, originalFilename, 'to sync', finalSubmittedAt]
    );

    console.log('âœ… Offline submission saved successfully.');
    return finalSubmittedAt; // Return the timestamp that was used
  } catch (error) {
    console.error('âŒ Failed to save offline submission:', error);
    throw error;
  }
};

// Interface for multiple file support
export interface OfflineSubmissionFile {
  uri: string;
  name: string;
  type?: string;
  size?: number;
}

// New function to support multiple files for offline submission
export const saveOfflineSubmissionMultiple = async (
  userEmail: string,
  assessmentId: number,
  files: OfflineSubmissionFile[],
  submittedAt?: string
) => {
  try {
    await initDb();
    const db = await getDb();
    
    let finalSubmittedAt = submittedAt;
    if (!finalSubmittedAt) {
      const serverTime = await getSavedServerTime(userEmail);
      finalSubmittedAt = serverTime || new Date().toISOString();
    }
    
    // Prepare files array for JSON storage
    const filesData = files.map(file => ({
      uri: file.uri,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size || 0,
    }));
    
    // For backward compatibility, store first file in legacy columns
    const primaryUri = filesData[0]?.uri || '';
    const primaryFilename = filesData[0]?.name || '';
    const filesJson = encryptData(JSON.stringify(filesData));
    const encryptedUri = encryptData(primaryUri);

    await db.runAsync(
      `INSERT OR REPLACE INTO offline_submissions (user_email, assessment_id, file_uri, original_filename, files_json, submission_status, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [userEmail, assessmentId, encryptedUri, primaryFilename, filesJson, 'to sync', finalSubmittedAt]
    );

    console.log(`[Offline] Saved submission with ${filesData.length} file(s) for assessment ${assessmentId}`);
    return finalSubmittedAt;
  } catch (error) {
    console.error('[Offline] Failed to save multi-file submission:', error);
    throw error;
  }
};

export const saveAssessmentSyncTimestamp = async (
  assessmentId: number,
  userEmail: string,
  syncTimestamp: string
): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    
    await db.runAsync(
      `INSERT OR REPLACE INTO offline_assessment_sync (assessment_id, user_email, last_sync_timestamp) VALUES (?, ?, ?);`,
      [assessmentId, userEmail, syncTimestamp]
    );
  } catch (error) {
    console.error('Failed to save sync timestamp:', error);
  }
};

// [ADD THIS NEW FUNCTION] to localDb.ts

export const forceRefreshAllAssessmentStatuses = async (
  userEmail: string,
  apiInstance: any,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: number, failed: number }> => {
  try {
    await initDb();
    const db = await getDb();
    console.log('🔄 [Force Refresh] Starting force-refresh for all assessment statuses...');

    const allAssessments = await db.getAllAsync<{ id: number; type: string }>(
      `SELECT id, type FROM offline_assessments WHERE user_email = ?;`,
      [userEmail]
    );

    if (allAssessments.length === 0) {
      console.log('✅ [Force Refresh] No local assessments found to refresh.');
      return { success: 0, failed: 0 };
    }
    
    console.log(`[Force Refresh] Found ${allAssessments.length} assessments to check.`);

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < allAssessments.length; i++) {
      const assessment = allAssessments[i];
      const assessmentId = assessment.id;
      const assessmentType = assessment.type;

      if (onProgress) {
        onProgress(i + 1, allAssessments.length);
      }

      try {
        let attemptStatus = null;
        let latestSubmission = null;

        if (assessmentType === 'quiz' || assessmentType === 'exam') {
          // A. Fetch Attempt Status
          try {
            const attemptResponse = await apiInstance.get(`/assessments/${assessmentId}/attempt-status`);
            if (attemptResponse.status === 200) {
              attemptStatus = attemptResponse.data;
            }
          } catch (e) { /* ignore errors */ }

          // B. [NEW] Fetch Submission Status & Perform Cleanup
          // This ensures that if the quiz is "Completed" on server, we wipe any local "In Progress" data.
          try {
            const subResponse = await apiInstance.get(`/assessments/${assessmentId}/submitted-assessment`);
            if (subResponse.status === 200) {
              const sub = subResponse.data.submitted_assessment;
              
              if (sub && (sub.status === 'completed' || sub.status === 'graded')) {
                console.log(`🧹 [Force Refresh] Quiz ${assessmentId} is ${sub.status} on server. Removing stale local attempts.`);
                // This deletes the 'in_progress' attempt from the local DB
                await deleteOfflineQuizAttempt(assessmentId, userEmail);
              }
            }
          } catch (e) { /* ignore 404 or other errors */ }
        }

        if (['assignment', 'activity', 'project'].includes(assessmentType)) {
          try {
            const submissionResponse = await apiInstance.get(`/assessments/${assessmentId}/latest-assignment-submission`);
            if (submissionResponse.status === 200) {
              latestSubmission = submissionResponse.data;
            }
          } catch (e) { /* ignore errors */ }
        }

        await saveAssessmentDetailsToDb(assessmentId, userEmail, attemptStatus, latestSubmission);
        await saveAssessmentSyncTimestamp(assessmentId, userEmail, new Date().toISOString());

        successCount++;
      } catch (error) {
        console.error(`❌ [Force Refresh] Failed to refresh status for assessment ${assessmentId}:`, error);
        failedCount++;
      }
    }
    
    console.log(`✅ [Force Refresh] Complete. Success: ${successCount}, Failed: ${failedCount}`);
    return { success: successCount, failed: failedCount };

  } catch (error) {
    console.error('❌ [Force Refresh] Batch force-refresh failed:', error);
    throw error;
  }
};

export const getAssessmentsNeedingSync = async (
  userEmail: string,
  apiInstance: any
): Promise<{ missing: number[], outdated: number[] }> => {
  try {
    await initDb();
    const db = await getDb();
    
    // Get all assessment IDs for the user
    const allAssessments = await db.getAllAsync<{ id: number }>(
      `SELECT DISTINCT id FROM offline_assessments WHERE user_email = ?;`,
      [userEmail]
    );
    
    // Get assessments with detailed data and sync timestamps
    const assessmentsWithData = await db.getAllAsync<SyncedAssessmentRow>(
      `SELECT assessment_id, last_sync_timestamp FROM offline_assessment_sync WHERE user_email = ?;`,
      [userEmail]
    );
    
    const allAssessmentIds = allAssessments.map((row) => row.id);
    const syncedAssessmentIds = assessmentsWithData.map((row) => row.assessment_id);
    
    // Find missing assessments (never synced)
    const missingAssessments = allAssessmentIds.filter(
      id => !syncedAssessmentIds.includes(id)
    );
    
    // Check for outdated assessments by comparing server timestamps
    const outdatedAssessments: number[] = [];
    
    for (const syncedAssessment of assessmentsWithData) {
      try {
        // Get server's last modified timestamp for this assessment
        const response = await apiInstance.get(`/assessments/${syncedAssessment.assessment_id}/last-modified`);
        const serverTimestamp = response.data.last_modified;
        
        // Compare with local sync timestamp
        if (new Date(serverTimestamp) > new Date(syncedAssessment.last_sync_timestamp)) {
          outdatedAssessments.push(syncedAssessment.assessment_id);
        }
      } catch (error) {
        console.warn(`Failed to check timestamp for assessment ${syncedAssessment.assessment_id}`);
      }
    }
    
    return {
      missing: missingAssessments,
      outdated: outdatedAssessments
    };
    
  } catch (error) {
    console.error('Failed to check assessments needing sync:', error);
    return { missing: [], outdated: [] };
  }
};

export const saveAssessmentReviewToDb = async (assessmentId: number, userEmail: string, reviewData: any): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    console.log(`💾 Saving review data for assessment ${assessmentId}`);
    const encryptedReview = encryptData(JSON.stringify(reviewData));

    await db.runAsync(
      `INSERT OR REPLACE INTO offline_assessment_reviews (assessment_id, user_email, review_data) VALUES (?, ?, ?);`,
      [assessmentId, userEmail, encryptedReview]
    );
    console.log(`✅ Review data for assessment ${assessmentId} saved successfully.`);
  } catch (error) {
    console.error(`❌ Failed to save assessment review data for assessment ${assessmentId}:`, error);
    throw error;
  }
};

export const getAssessmentReviewFromDb = async (assessmentId: number, userEmail: string): Promise<any | null> => {
  try {
    const db = await getDb();
    const result = await db.getFirstAsync<ReviewDataRow>(
      `SELECT review_data FROM offline_assessment_reviews WHERE assessment_id = ? AND user_email = ?;`,
      [assessmentId, userEmail]
    );
    if (result && result.review_data) {
      // --- MODIFIED: Decrypt ---
      const decryptedData = decryptData(result.review_data);
      return JSON.parse(decryptedData);
    }
    console.log(`⚠️ No offline review data found for assessment ${assessmentId}`);
    return null;
  } catch (error) {
    console.error(`❌ Failed to get assessment review data for assessment ${assessmentId}:`, error);
    return null;
  }
};

export const hasAssessmentReviewSaved = async (assessmentId: number, userEmail: string): Promise<boolean> => {
  try {
    const db = await getDb();
    const result = await db.getFirstAsync<CountRow>(
      `SELECT COUNT(*) as count FROM offline_assessment_reviews WHERE assessment_id = ? AND user_email = ?;`,
      [assessmentId, userEmail]
    );
    return result?.count ? result.count > 0 : false;
  } catch (error) {
    console.error(`❌ Error checking for saved assessment review for assessment ${assessmentId}:`, error);
    return false;
  }
};

export const syncAllAssessmentDetails = async (
  userEmail: string,
  apiInstance: any,
  onProgress?: (current: number, total: number, type: 'missing' | 'updating') => void
): Promise<{ success: number, failed: number, updated: number }> => {
  try {
    const { missing, outdated } = await getAssessmentsNeedingSync(userEmail, apiInstance);
    const totalAssessments = missing.length + outdated.length;
    
    if (totalAssessments === 0) {
      return { success: 0, failed: 0, updated: 0 };
    }
    
    let successCount = 0;
    let failedCount = 0;
    let updatedCount = 0;
    let currentIndex = 0;
    
    // Process missing assessments first
    for (const assessmentId of missing) {
      currentIndex++;
      if (onProgress) {
        onProgress(currentIndex, totalAssessments, 'missing');
      }
      
      const result = await downloadSingleAssessmentDetails(assessmentId, userEmail, apiInstance);
      if (result.success) {
        successCount++;
        // Save sync timestamp
        await saveAssessmentSyncTimestamp(assessmentId, userEmail, new Date().toISOString());
      } else {
        failedCount++;
      }
    }
    
    // Process outdated assessments
    for (const assessmentId of outdated) {
      currentIndex++;
      if (onProgress) {
        onProgress(currentIndex, totalAssessments, 'updating');
      }
      
      const result = await downloadSingleAssessmentDetails(assessmentId, userEmail, apiInstance);
      if (result.success) {
        successCount++;
        updatedCount++;
        // Update sync timestamp
        await saveAssessmentSyncTimestamp(assessmentId, userEmail, new Date().toISOString());
      } else {
        failedCount++;
      }
    }
    
    return { success: successCount, failed: failedCount, updated: updatedCount };
    
  } catch (error) {
    console.error('Sync failed:', error);
    throw error;
  }
};

const downloadSingleAssessmentDetails = async (
  assessmentId: number,
  userEmail: string,
  apiInstance: any
): Promise<{ success: boolean }> => {
  try {
    const db = await getDb();
    const assessmentResult = await db.getFirstAsync(
      `SELECT type FROM offline_assessments WHERE id = ? AND user_email = ?;`,
      [assessmentId, userEmail]
    );
    
    if (!assessmentResult) {
      return { success: false };
    }
    
    const assessmentType = (assessmentResult as any).type;
    let attemptStatus = null;
    let latestSubmission = null;
    
    if (assessmentType === 'quiz' || assessmentType === 'exam') {
      // A. Fetch Attempt Status
      try {
        const attemptResponse = await apiInstance.get(`/assessments/${assessmentId}/attempt-status`);
        if (attemptResponse.status === 200) {
          attemptStatus = attemptResponse.data;
        }
      } catch (error) {
        console.warn(`Failed to fetch attempt status for assessment ${assessmentId}`);
      }

      // B. [NEW] Fetch Submission Status & Perform Cleanup
      try {
        const subResponse = await apiInstance.get(`/assessments/${assessmentId}/submitted-assessment`);
        if (subResponse.status === 200) {
          const sub = subResponse.data.submitted_assessment;
          
          // Check if Completed/Graded
          if (sub && (sub.status === 'completed' || sub.status === 'graded')) {
             console.log(`🧹 [Auto Sync] Quiz ${assessmentId} is done on server. Cleaning local attempts.`);
             // Remove the stale local attempt so the user sees "Completed" instead of "Resume"
             await deleteOfflineQuizAttempt(assessmentId, userEmail);
          }
        }
      } catch (e) { /* ignore 404 */ }
    }
    
    if (['assignment', 'activity', 'project'].includes(assessmentType)) {
      try {
        const submissionResponse = await apiInstance.get(`/assessments/${assessmentId}/latest-assignment-submission`);
        if (submissionResponse.status === 200) {
          latestSubmission = submissionResponse.data;
        }
      } catch (error) {
        console.warn(`Failed to fetch submission for assessment ${assessmentId}`);
      }
    }
    
    await saveAssessmentDetailsToDb(assessmentId, userEmail, attemptStatus, latestSubmission);
    return { success: true };
    
  } catch (error) {
    console.error(`Failed to download details for assessment ${assessmentId}:`, error);
    return { success: false };
  }
};


// QUIZZES

export const fixQuizQuestionsTable = async (): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    
    console.log('🔧 Fixing offline_quiz_questions table structure...');
    
    // Drop the existing table if it exists
    await db.execAsync(`DROP TABLE IF EXISTS offline_quiz_questions;`);
    
    // Create the table with correct structure
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS offline_quiz_questions (
        id INTEGER PRIMARY KEY NOT NULL,
        user_email TEXT NOT NULL,
        assessment_id INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        question_type TEXT NOT NULL,
        options TEXT,
        correct_answer TEXT,
        points INTEGER,
        order_index INTEGER,
        question_data TEXT NOT NULL,
        FOREIGN KEY (assessment_id, user_email) REFERENCES offline_assessment_data(assessment_id, userEmail) ON DELETE CASCADE
      );`
    );
    
    console.log('✅ offline_quiz_questions table structure fixed');
  } catch (error) {
    console.error('❌ Failed to fix quiz questions table:', error);
    throw error;
  }
};

export const saveQuizQuestionsToDb = async (
  assessmentId: number,
  userEmail: string,
  questions: any[]
): Promise<void> => {
  if (!questions || questions.length === 0) {
    return;
  }
  
  try {
    await initDb();
    const db = await getDb();
    
    console.log(`🧠 Saving ${questions.length} quiz questions for assessment ${assessmentId}`);
    
    // Get assessment details to include duration
    const assessmentResult = await db.getFirstAsync<{ duration_minutes: number | null }>(
      `SELECT duration_minutes FROM offline_assessments WHERE id = ? AND user_email = ?;`,
      [assessmentId, userEmail]
    );
    const durationMinutes = assessmentResult?.duration_minutes || null;
    
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `DELETE FROM offline_quiz_questions WHERE assessment_id = ? AND user_email = ?;`,
        [assessmentId, userEmail]
      );
      
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const questionId = question.id || `${assessmentId}_${i + 1}`;
        
        // Include duration in question data
        const enhancedQuestionData = {
          ...question,
          duration_minutes: durationMinutes
        };
        
        // Improved options validation and sanitization
        let optionsToSave = null;
        if (question.options) {
          if (typeof question.options === 'string') {
            try {
              // Try to parse if it's already a JSON string
              JSON.parse(question.options);
              optionsToSave = question.options;
            } catch (e) {
              // If parsing fails, it means it's a plain string, so we'll skip it
              console.warn(`Invalid JSON string for question ${questionId} options:`, question.options);
              optionsToSave = null;
            }
          } else if (typeof question.options === 'object' && question.options !== null) {
            // It's an object/array, stringify it
            try {
              optionsToSave = JSON.stringify(question.options);
            } catch (e) {
              console.warn(`Failed to stringify options for question ${questionId}:`, question.options);
              optionsToSave = null;
            }
          } else {
            console.warn(`Invalid options data type for question ${questionId}:`, typeof question.options, question.options);
            optionsToSave = null;
          }
        }

        await db.runAsync(
          `INSERT INTO offline_quiz_questions 
          (id, user_email, assessment_id, question_text, question_type, options, correct_answer, points, order_index, question_data) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            questionId,
            userEmail,
            assessmentId,
            'Encrypted Question', // 🔒 Hide the text
            question.type || question.question_type || 'text',
            null,                 // 🔒 Hide the options (they are inside question_data)
            null,                 // 🔒 Hide the correct answer!
            question.points || question.point_value || 1,
            i + 1,
            encryptData(JSON.stringify(enhancedQuestionData)) // This contains everything safely
          ]
        );
      }
    });
    
    console.log(`✅ Saved ${questions.length} quiz questions for assessment ${assessmentId}`);
  } catch (error) {
    console.error(`❌ Failed to save quiz questions for assessment ${assessmentId}:`, error);
    throw error;
  }
};

export const hasQuizQuestionsSaved = async (
  assessmentId: number,
  userEmail: string
): Promise<boolean> => {
  try {
    const db = await getDb();
    const result = await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM offline_quiz_questions 
       WHERE assessment_id = ? AND user_email = ?;`,
      [assessmentId, userEmail]
    );
    return (result as any)?.count > 0;
  } catch (error) {
    console.error('Error checking quiz questions:', error);
    return false;
  }
};

export const getQuizQuestionsFromDb = async (
  assessmentId: number,
  userEmail: string
): Promise<any[]> => {
  try {
    const db = await getDb();
    const result = await db.getAllAsync(
      `SELECT question_data FROM offline_quiz_questions 
       WHERE assessment_id = ? AND user_email = ? 
       ORDER BY order_index ASC;`,
      [assessmentId, userEmail]
    );
    
    return result.map((row: any) => {
      try {
        const decryptedString = decryptData(row.question_data);
        const questionData = JSON.parse(decryptedString);
        
        // Ensure options are properly formatted for the UI
        if (questionData.options) {
          if (typeof questionData.options === 'string') {
            try {
              questionData.options = JSON.parse(questionData.options);
            } catch (e) {
              console.warn(`Failed to parse options for question ${questionData.id}, setting to empty array`);
              questionData.options = [];
            }
          }
        } else {
          questionData.options = [];
        }
        
        return questionData;
      } catch (e) {
        console.error('Failed to parse question data:', e);
        return null;
      }
    }).filter(Boolean); // Remove any null values
  } catch (error) {
    console.error(`❌ Failed to get quiz questions for assessment ${assessmentId}:`, error);
    return [];
  }
};

export const downloadAllQuizQuestions = async (
  userEmail: string,
  apiInstance: any,
  onProgress?: (current: number, total: number, skipped?: number) => void,
  forceRefresh: boolean = false // NEW PARAMETER
): Promise<{ success: number, failed: number, skipped: number }> => {
  try {
    await initDb();
    const db = await getDb();
    
    // Get all quiz and exam type assessments
    const quizAssessments = await db.getAllAsync<{ id: number }>(
      `SELECT id FROM offline_assessments 
       WHERE user_email = ? AND (type = 'quiz' OR type = 'exam');`,
      [userEmail]
    );
    
    if (quizAssessments.length === 0) {
      console.log('No quiz/exam assessments found');
      return { success: 0, failed: 0, skipped: 0 };
    }
    
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    
    console.log(`Starting download of questions for ${quizAssessments.length} quiz/exam assessments`);
    
    for (let i = 0; i < quizAssessments.length; i++) {
      const assessment = quizAssessments[i];
      
      try {
        if (onProgress) {
          onProgress(i + 1, quizAssessments.length, skippedCount);
        }
        
        // MODIFIED: Skip check if force refresh is enabled
        if (!forceRefresh) {
          const hasQuestions = await hasQuizQuestionsSaved(assessment.id, userEmail);
          if (hasQuestions) {
            console.log(`Quiz questions for assessment ${assessment.id} already saved, skipping`);
            skippedCount++;
            continue;
          }
        } else {
          console.log(`Force refreshing questions for assessment ${assessment.id}`);
        }
        
        // Fetch quiz questions from API
        const response = await apiInstance.get(`/assessments/${assessment.id}/questions`);
        
        if (response.status === 200 && response.data?.questions) {
          // ALWAYS save (overwrite if force refresh)
          await saveQuizQuestionsToDb(assessment.id, userEmail, response.data.questions);
          successCount++;
          console.log(`${forceRefresh ? 'Refreshed' : 'Downloaded'} questions for assessment ${assessment.id}`);
        } else {
          console.warn(`No questions found for assessment ${assessment.id}`);
          failedCount++;
        }
        
      } catch (error) {
        console.error(`Failed to download questions for assessment ${assessment.id}:`, error);
        failedCount++;
      }
    }
    
    console.log(`Quiz questions download completed: ${successCount} successful, ${failedCount} failed, ${skippedCount} skipped`);
    return { success: successCount, failed: failedCount, skipped: skippedCount };
    
  } catch (error) {
    console.error('Quiz questions download failed:', error);
    throw error;
  }
};

export const startOfflineQuiz = async (
  assessmentId: number, 
  userEmail: string, 
  shuffledOrder: number[],
  serverSubmissionId?: number 
): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();

    await db.withTransactionAsync(async () => {
      // Check if an attempt for this quiz already exists
      const existingAttempt = await db.getFirstAsync(
        `SELECT * FROM offline_quiz_attempts WHERE assessment_id = ? AND user_email = ? AND is_completed = 0;`,
        [assessmentId, userEmail]
      );

      if (existingAttempt) {
        console.log(`Quiz attempt for assessment ${assessmentId} already in progress.`);
        return;
      }

      // Generate start time locally. 
      // We rely on serverSubmissionId for security linkage, not the timestamp.
      const startTime = new Date().toISOString();

      const encryptedEmptyAnswers = encryptData(JSON.stringify({}));
      
      await db.runAsync(
        `INSERT INTO offline_quiz_attempts (assessment_id, user_email, start_time, answers, is_completed, shuffled_order, server_submission_id)
         VALUES (?, ?, ?, ?, ?, ?, ?);`, 
        [
          assessmentId,
          userEmail,
          startTime,
          encryptedEmptyAnswers,
          0,
          JSON.stringify(shuffledOrder),
          serverSubmissionId || null // This is now the primary security link
        ]
      );
    });

    console.log(`✅ Started offline quiz for assessment ${assessmentId}. ServerID: ${serverSubmissionId}`);
  } catch (error) {
    console.error(`❌ Failed to start offline quiz: ${error}`);
    throw error;
  }
};
  

export const getOfflineAttemptCount = async (assessmentId: number, userEmail: string): Promise<{
  attempts_made: number;
  attempts_remaining: number | null;
}> => {
  try {
    const db = await getDb();
    
    const assessmentData = await db.getFirstAsync<AssessmentDataRow>(
      `SELECT data FROM offline_assessment_data 
       WHERE assessment_id = ? AND user_email = ?;`,
      [assessmentId, userEmail]
    );

    let storedAttemptStatus: any = null;
    if (assessmentData?.data) {
      try {
        // ✅ FIX: Decrypt first!
        const decryptedData = decryptData(assessmentData.data);
        const parsed = JSON.parse(decryptedData);
        storedAttemptStatus = parsed.attemptStatus;
      } catch (e) {
        console.warn('Failed to decrypt attempt status in getOfflineAttemptCount', e);
      }
    }

    // Get completed attempts count from offline_quiz_attempts
    const offlineAttempts = await db.getFirstAsync<CountRow>(
      `SELECT COUNT(*) as count FROM offline_quiz_attempts 
       WHERE assessment_id = ? AND user_email = ? AND is_completed = 1;`,
      [assessmentId, userEmail]
    );

    const offlineCount = offlineAttempts?.count || 0;
    
    // If we have stored attempt status, use it as base and add offline attempts
    if (storedAttemptStatus) {
      const totalAttempts = storedAttemptStatus.attempts_made + offlineCount;
      const maxAttempts = storedAttemptStatus.max_attempts;
      
      return {
        attempts_made: totalAttempts,
        attempts_remaining: maxAttempts !== null ? Math.max(0, maxAttempts - totalAttempts) : null
      };
    }

    // Fallback to just offline attempts if no stored status
    return {
      attempts_made: offlineCount,
      attempts_remaining: null
    };
  } catch (error) {
    console.error('Error getting offline attempt count:', error);
    return { attempts_made: 0, attempts_remaining: null };
  }
};

// localDb.ts

export const getOfflineQuizAnswers = async (assessmentId: number, userEmail: string): Promise < any > => {
  try {
    await initDb();
    const db = await getDb();
    const result = await db.getFirstAsync<{ answers: string | null }>(
      `SELECT answers FROM offline_quiz_attempts WHERE assessment_id = ? AND user_email = ? AND is_completed = 0;`,
      [assessmentId, userEmail]
    );
    if (result && result.answers) {
      // CHANGE: Decrypt before parsing
      const decryptedAnswers = decryptData(result.answers);
      return JSON.parse(decryptedAnswers);
    }
    return {};
  } catch (error) {
    console.error('❌ Failed to retrieve offline quiz answers:', error);
    return {};
  }
};

export const updateOfflineQuizAnswers = async (assessmentId: number, userEmail: string, answers: any): Promise < void > => {
  try {
    await initDb();
    const db = await getDb();
    
    // CHANGE: Encrypt the JSON string before saving
    const answersString = JSON.stringify(answers);
    const encryptedAnswers = encryptData(answersString);

    await db.runAsync(
      `UPDATE offline_quiz_attempts SET answers = ? WHERE assessment_id = ? AND user_email = ? AND is_completed = 0;`,
      [
        encryptedAnswers, // Save encrypted data
        assessmentId,
        userEmail
      ]
    );
    console.log(`✅ Updated answers for offline quiz ${assessmentId}.`);
  } catch (error) {
    console.error('❌ Failed to update offline quiz answers:', error);
    throw error;
  }
};

export const getOfflineQuizAttemptStatus = async (assessmentId: number, userEmail: string): Promise < string > => {
  try {
    await initDb();
    const db = await getDb();
    const result = await db.getFirstAsync<{ is_completed: number }>(
      `SELECT is_completed FROM offline_quiz_attempts WHERE assessment_id = ? AND user_email = ?;`,
      [assessmentId, userEmail]
    );
    if (result === undefined || result === null) {
      return 'not_started';
    } else if (result.is_completed === 0) {
      return 'in_progress';
    } else {
      return 'completed';
    }
  } catch (error) {
    console.error('❌ Failed to get quiz attempt status:', error);
    return 'error';
  }
};

export const submitOfflineQuiz = async (assessmentId: number, userEmail: string, answers: StudentAnswers): Promise<void> => {
  try {
    await initDb(); 
    const db = await getDb();
    const now = new Date().toISOString();
    
    console.log(`📝 Submitting offline quiz for assessment ${assessmentId}`);
    
    await db.withTransactionAsync(async () => {
      // 1. Get all original questions for this quiz
      const questions = await getQuizQuestionsFromDb(assessmentId, userEmail);
      const questionsMap: Record<number, any> = {};
      questions.forEach(q => {
        questionsMap[q.id] = q;
      });
      
      const encryptedAnswers = encryptData(JSON.stringify(answers));
      let attemptId: number;

      // 2. FIND EXISTING IN-PROGRESS ATTEMPT
      // We must update this record to preserve the original start_time
      const existingAttempt = await db.getFirstAsync(
        `SELECT attempt_id FROM offline_quiz_attempts WHERE assessment_id = ? AND user_email = ? AND is_completed = 0;`,
        [assessmentId, userEmail]
      );

      if (existingAttempt) {
        attemptId = (existingAttempt as any).attempt_id;
        console.log(`   - Found in-progress attempt ${attemptId}. Updating to completed.`);

        // UPDATE existing record
        await db.runAsync(
          `UPDATE offline_quiz_attempts 
           SET end_time = ?, answers = ?, is_completed = 1 
           WHERE attempt_id = ?;`,
          [
            now, 
            encryptedAnswers, // ✅ CORRECT: Encrypted
            attemptId
          ]
        );

        // CLEANUP: Delete any previous submission details for this attempt (just in case of retry/glitch)
        // to prevent duplicate key errors or ghost data before inserting fresh details.
        await db.runAsync(
          `DELETE FROM offline_quiz_option_selections 
           WHERE submission_id IN (SELECT submission_id FROM offline_quiz_question_submissions WHERE attempt_id = ?);`, 
          [attemptId]
        );
        await db.runAsync(
          `DELETE FROM offline_quiz_question_submissions WHERE attempt_id = ?;`, 
          [attemptId]
        );

      } else {
        // FALLBACK: Create new attempt if for some reason none exists
        // (This timestamp will be equal to end_time, which is the bug we are avoiding, but unavoidable here)
        console.log(`   - No in-progress attempt found. Creating new record.`);
        const attemptResult = await db.runAsync(
          `INSERT INTO offline_quiz_attempts (assessment_id, user_email, start_time, end_time, answers, is_completed) VALUES (?, ?, ?, ?, ?, ?);`,
          [
            assessmentId,
            userEmail,
            now,
            now,
            encryptedAnswers, 
            1
          ]
        );
        attemptId = attemptResult.lastInsertRowId;
      }

      if (!attemptId) throw new Error("Failed to resolve attempt ID.");
      
      // 3. Loop through answers
      for (const questionIdStr in answers) {
        if (!answers.hasOwnProperty(questionIdStr)) continue;
        
        const questionId = Number(questionIdStr);
        const studentAnswer = answers[questionId];
        const originalQuestion = questionsMap[questionId];
        
        if (!originalQuestion) continue;
        
        const maxPoints = originalQuestion.points ?? originalQuestion.max_points ?? 1;
        const encryptedStudentAnswer = encryptData(JSON.stringify(studentAnswer.answer));

        const questionSubmissionResult = await db.runAsync(
          `INSERT INTO offline_quiz_question_submissions (attempt_id, question_id, submitted_answer, max_points) VALUES (?, ?, ?, ?);`,
          [
            attemptId, 
            questionId, 
            encryptedStudentAnswer, // ✅ CORRECT: Encrypted
            maxPoints
          ]
        );
        const submissionId = questionSubmissionResult.lastInsertRowId;

        if (!submissionId) throw new Error(`Failed to create submission record.`);
        
        // 5. Securely save option selections
        if (studentAnswer.type === 'multiple_choice' || studentAnswer.type === 'true_false') {
          const selectedOptionIds: (string | number)[] = Array.isArray(studentAnswer.answer) ? studentAnswer.answer : [studentAnswer.answer];
          const originalOptions = originalQuestion.options || [];
          
          for (const option of originalOptions) {
            const isSelected = selectedOptionIds.includes(option.id);
            
            // 🔒 SECURITY FIX: Encrypt option text
            const encryptedOptionText = encryptData(option.option_text || '');

            // 🔒 SECURITY FIX: NEVER save 'isCorrect' as 1 in a plain text table.
            const isCorrectSafe = 0; 
            
            await db.runAsync(
              `INSERT INTO offline_quiz_option_selections (submission_id, option_id, option_text, is_selected, is_correct_option) VALUES (?, ?, ?, ?, ?);`,
              [
                submissionId, 
                option.id, 
                encryptedOptionText, // ✅ Now Encrypted
                isSelected ? 1 : 0, 
                isCorrectSafe 
              ]
            );
          }
        }
      }
    });
    
    console.log(`✅ Successfully submitted offline quiz for assessment ${assessmentId}`);
  } catch (error) {
    console.error(`❌ Failed to submit offline quiz: ${error}`);
    throw error;
  }
};


export const getCompletedOfflineQuizzes = async (userEmail: string): Promise<any[]> => {
  try {
    await initDb();
    const db = await getDb();
    
    const quizAttempts = await db.getAllAsync(
      `SELECT 
        attempt_id, 
        assessment_id, 
        user_email, 
        start_time, 
        end_time, 
        answers,
        server_submission_id 
       FROM offline_quiz_attempts 
       WHERE user_email = ? AND is_completed = 1 AND end_time IS NOT NULL;`,
      [userEmail]
    );
    
    const decryptedAttempts = quizAttempts.map((attempt: any) => {
      // 1. Decrypt the 'answers' string
      const decryptedAnswersJson = decryptData(attempt.answers);
      
      // 2. Return a new object with the decrypted answers
      // Note: We don't need to JSON.parse here because syncOfflineQuiz in api.ts 
      // expects a string and handles parsing itself via 'formatAnswersForSync'.
      return {
        ...attempt,
        answers: decryptedAnswersJson 
      };
    });

    console.log(`📊 Found ${quizAttempts.length} completed offline quizzes ready for sync`);
    return decryptedAttempts;
  } catch (error) {
    console.error('❌ Failed to get completed offline quizzes:', error);
    return [];
  }
};

export const getOfflineQuizAttempt = async (
  assessmentId: number,
  userEmail: string
): Promise<any | null> => {
  try {
    const db = await getDb();
    const result = await db.getFirstAsync(
      `SELECT *, shuffled_order FROM offline_quiz_attempts WHERE assessment_id = ? AND user_email = ? AND is_completed = 0;`, 
      [assessmentId, userEmail]
    );

    // 🔍 FIX START: Decrypt the answers if they exist
    if (result && (result as any).answers) {
      const decryptedAnswers = decryptData((result as any).answers);
      
      // We usually parse it here so the UI gets a clean Object
      try {
        (result as any).answers = JSON.parse(decryptedAnswers);
      } catch (e) {
        console.warn("⚠️ Could not parse decrypted answers JSON, returning as string.");
        (result as any).answers = decryptedAnswers;
      }
    }
    // 🔍 FIX END

    return result || null;
  } catch (error) {
    console.error('Error checking for offline quiz attempt:', error);
    return null;
  }
};

export const markAssessmentAsUnlocked = async (assessmentId: number, userEmail: string): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    console.log(`🔑 Unlocking assessment ${assessmentId} for user ${userEmail}`);
    await db.runAsync(
      `INSERT OR IGNORE INTO unlocked_assessments (assessment_id, user_email) VALUES (?, ?);`,
      [assessmentId, userEmail]
    );
  } catch (error) {
    console.error(`❌ Failed to mark assessment ${assessmentId} as unlocked:`, error);
  }
};

export const getUnlockedAssessmentIds = async (userEmail: string): Promise<Set<number>> => {
  try {
    await initDb();
    const db = await getDb();
    const results = await db.getAllAsync<{ assessment_id: number }>(
      `SELECT assessment_id FROM unlocked_assessments WHERE user_email = ?;`,
      [userEmail]
    );
    const idSet = new Set(results.map((row) => row.assessment_id));
    console.log(`🔓 Found ${idSet.size} unlocked assessments for user ${userEmail}`);
    return idSet;
  } catch (error) {
    console.error(`❌ Failed to get unlocked assessment IDs:`, error);
    return new Set<number>();
  }
};

export const deleteOfflineQuizAttempt = async (assessmentId: number, userEmail: string): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    console.log(`🗑️ Deleting IN-PROGRESS offline quiz attempt for assessment ${assessmentId} and user ${userEmail}`);

    await db.withTransactionAsync(async () => {
      // --- MODIFIED: Target the 'in_progress' (is_completed = 0) attempt ---
      const attempt = await db.getFirstAsync(
        `SELECT attempt_id FROM offline_quiz_attempts WHERE assessment_id = ? AND user_email = ? AND is_completed = 0;`,
        [assessmentId, userEmail]
      );

      if (attempt) {
        const attemptId = (attempt as any).attempt_id;
        console.log(`   - Found in-progress attempt with ID: ${attemptId}`);
        // Delete related submissions and options first
        await db.runAsync(`DELETE FROM offline_quiz_option_selections WHERE submission_id IN (SELECT submission_id FROM offline_quiz_question_submissions WHERE attempt_id = ?);`, [attemptId]);
        await db.runAsync(`DELETE FROM offline_quiz_question_submissions WHERE attempt_id = ?;`, [attemptId]);
        // Then, delete the attempt itself
        await db.runAsync(`DELETE FROM offline_quiz_attempts WHERE attempt_id = ?;`, [attemptId]);
        console.log(`✅ Deleted in-progress offline quiz attempt ${attemptId} and all related records.`);
      } else {
        console.log(`✅ No in-progress (is_completed = 0) offline quiz attempt found for assessment ${assessmentId}. Nothing to delete.`);
      }
    });

  } catch (error) {
    console.error('❌ Failed to delete in-progress offline quiz attempt:', error);
    throw error;
  }
};

export const deleteCompletedOfflineQuizAttempt = async (assessmentId: number, userEmail: string): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    console.log(`🗑️ Deleting COMPLETED offline quiz attempt for assessment ${assessmentId} and user ${userEmail}`);

    await db.withTransactionAsync(async () => {
      // --- Target the 'completed' (is_completed = 1) attempt ---
      const attempt = await db.getFirstAsync(
        `SELECT attempt_id FROM offline_quiz_attempts WHERE assessment_id = ? AND user_email = ? AND is_completed = 1;`,
        [assessmentId, userEmail]
      );

      if (attempt) {
        const attemptId = (attempt as any).attempt_id;
        console.log(`   - Found completed attempt with ID: ${attemptId}`);
        // Delete related submissions and options first
        await db.runAsync(`DELETE FROM offline_quiz_option_selections WHERE submission_id IN (SELECT submission_id FROM offline_quiz_question_submissions WHERE attempt_id = ?);`, [attemptId]);
        await db.runAsync(`DELETE FROM offline_quiz_question_submissions WHERE attempt_id = ?;`, [attemptId]);
        // Then, delete the attempt itself
        await db.runAsync(`DELETE FROM offline_quiz_attempts WHERE attempt_id = ?;`, [attemptId]);
        console.log(`✅ Deleted completed offline quiz attempt ${attemptId} and all related records.`);
      } else {
        console.log(`✅ No completed (is_completed = 1) offline quiz attempt found for assessment ${assessmentId}. Nothing to delete.`);
      }
    });
  } catch (error) {
    console.error('❌ Failed to delete completed offline quiz attempt:', error);
    throw error;
  }
};



export const getCurrentServerTime = async (userEmail: string): Promise<string> => {
  try {
    // First check for time manipulation
    const timeCheck = await detectTimeManipulation(userEmail);
    if (!timeCheck.isValid) {
      console.warn('âš ï¸ Time manipulation detected, using fallback time');
      return new Date().toISOString(); // Fallback to local time
    }

    // Get the calculated server time
    const serverTime = await getSavedServerTime(userEmail);
    if (serverTime) {
      console.log('ðŸ•’ Using calculated server time:', serverTime);
      return serverTime;
    } else {
      console.warn('âš ï¸ No server time data available, using local time');
      return new Date().toISOString();
    }
  } catch (error) {
    console.error('âŒ Error getting current server time:', error);
    return new Date().toISOString(); // Fallback to local time
  }
};

export const getUnsyncedSubmissions = async (userEmail: string) => {
  try {
    await initDb();
    const db = await getDb();
    const results = await db.getAllAsync(
      `SELECT * FROM offline_submissions WHERE user_email = ? AND submission_status = 'to sync';`,
      [userEmail]
    );

    // Decrypt the file_uri and files_json for every row
    const decryptedResults = results.map((row: any) => {
      const result: any = {
        ...row,
        file_uri: decryptData(row.file_uri)
      };
      
      // Decrypt and parse files_json if present (multiple files)
      if (row.files_json) {
        try {
          const decryptedJson = decryptData(row.files_json);
          result.files = JSON.parse(decryptedJson);
        } catch (e) {
          console.error('[Offline] Failed to parse files_json:', e);
          result.files = null;
        }
      }
      
      return result;
    });

    console.log(`Found ${decryptedResults.length} unsynced submissions`);
    return decryptedResults;
  } catch (error) {
    console.error('Failed to get unsynced submissions:', error);
    return [];
  }
};

export const deleteOfflineSubmission = async (id: number) => {
  try {
    await initDb();
    const db = await getDb();
    console.log(`ðŸ—‘ï¸ Deleting offline submission with ID: ${id}`);
    await db.runAsync(`DELETE FROM offline_submissions WHERE id = ?;`, [id]);
    console.log(`âœ… Offline submission ID ${id} deleted successfully.`);
  } catch (error) {
    console.error(`âŒ Failed to delete offline submission ID ${id}:`, error);
    throw error;
  }
};

export const clearAllData = async (): Promise<void> => {
  try {
    await initDb(); // Ensure DB is initialized
    const db = await getDb();
    
    console.log('ðŸ—‘ï¸ Clearing all local data...');
    
    // --- MODIFIED: Removed the now-obsolete `offline_users` table from the clear logic.
    await db.execAsync(`DELETE FROM offline_courses;`);
    await db.execAsync(`DELETE FROM offline_course_details;`);
    await db.execAsync(`DELETE FROM time_check_logs;`);
    
    console.log('âœ… All local data cleared.');
  } catch (error) {
    console.error('âŒ Failed to clear local data:', error);
    throw error;
  }
};

export const closeDatabase = async (): Promise<void> => {
  try {
    if (dbInstance) {
      await dbInstance.closeAsync();
      dbInstance = null;
      dbInitialized = false;
      initializationPromise = null;
      console.log('✅ Database closed successfully');
    }
  } catch (error) {
    console.error('❌ Failed to close database:', error);
  }
};


export const resetDatabaseState = (): void => {
  dbInstance = null;
  dbInitialized = false;
  initializationPromise = null;
  dbLock = false;
  console.log('🔄 Database state reset');
};


export const clearOfflineData = async (): Promise<void> => {
  try {
    const db = await getDb();
    console.log('🗑️ Clearing offline data (preserving pending syncs)...');

    await db.withTransactionAsync(async () => {
      // 1. Identify ALL Protected Assessments (across all courses)
      const protectedAssessments = await db.getAllAsync<{ assessment_id: number }>(
        `SELECT assessment_id FROM offline_submissions WHERE submission_status = 'to sync'
         UNION
         SELECT assessment_id FROM offline_quiz_attempts WHERE is_completed = 1`
      );
      
      const protectedIds = protectedAssessments.map(p => p.assessment_id);
      const protectedIdString = protectedIds.length > 0 ? protectedIds.join(',') : null;

      // 2. Delete Unprotected Assessments
      if (protectedIdString) {
        await db.runAsync(
          `DELETE FROM offline_assessments WHERE id NOT IN (${protectedIdString})`
        );
      } else {
        // No pending work at all, delete all assessments
        await db.runAsync(`DELETE FROM offline_assessments`);
      }

      // 3. Delete Unprotected Courses
      // We must keep courses that still have assessments (the protected ones)
      await db.runAsync(
        `DELETE FROM offline_courses WHERE id NOT IN (
           SELECT DISTINCT course_id FROM offline_assessments
         )`
      );

      // 4. Clear other tables completely as they don't affect sync
      await db.runAsync(`DELETE FROM offline_course_details;`);
      await db.runAsync(`DELETE FROM offline_materials;`);
      await db.runAsync(`DELETE FROM app_state;`); 
      await db.execAsync(`DELETE FROM offline_assessment_data;`);
    });

    console.log('✅ Offline data cleared (pending work preserved).');
  } catch (error) {
    console.error('❌ Error clearing offline data:', error);
  }
}

export const deleteAssessmentDetails = async (assessmentId: number, userEmail: string): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    
    console.log(`ðŸ—‘ï¸ Deleting detailed assessment data for assessment ID: ${assessmentId} and user: ${userEmail}`);

    await db.runAsync(
      `DELETE FROM offline_assessment_data WHERE assessment_id = ? AND user_email = ?;`,
      [assessmentId, userEmail]
    );
    await db.runAsync(
      `DELETE FROM offline_assessments WHERE id = ? AND user_email = ?;`,
      [assessmentId, userEmail]
    );

    console.log('âœ… Detailed assessment and base data deleted successfully.');
  } catch (error) {
    console.error('âŒ Failed to delete detailed assessment data:', error);
    throw error;
  }
};



{/* SERVER ONLY FOR OFFLINE USE */}


const MAX_OFFLINE_TIME = 7 * 24 * 60 * 60 * 1000; // 7 days
const ALLOWED_FORWARD_JUMP = 24 * 60 * 60 * 1000; // 24 hours
const BACKWARD_TIME_LIMIT = -2 * 60 * 1000;       // -2 minutes

export const saveServerTime = async (
  userEmail: string, 
  apiServerTime: string, 
  currentDeviceTime: string
): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();

    const serverTimeMs = new Date(apiServerTime).getTime();
    const deviceTimeMs = new Date(currentDeviceTime).getTime();
    const offset = serverTimeMs - deviceTimeMs;

    await db.runAsync(
      `INSERT OR REPLACE INTO app_state 
      (user_email, server_time, server_time_offset, last_time_check, time_check_sequence, last_online_sync, manipulation_detected) 
      VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [userEmail, apiServerTime, offset, deviceTimeMs, Date.now(), deviceTimeMs, 0]
    );
  } catch (error) {
    console.error('❌ Failed to save server time:', error);
    throw error;
  }
};

export const getSavedServerTime = async (userEmail: string): Promise<string | null> => {
  try {
    await initDb();
    const db = await getDb();
    const result = await db.getAllAsync<AppStateRow>(
      `SELECT * FROM app_state WHERE user_email = ?;`,
      [userEmail]
    );
    if (!result || result.length === 0) return null;
    const record = result[0];

    if (record.manipulation_detected === 1) return null;

    const currentDeviceTime = Date.now();
    const lastCheckTime = record.last_time_check;
    const lastOnlineSync = record.last_online_sync;
    const serverTimeOffset = record.server_time_offset;
    const timeDiff = currentDeviceTime - lastCheckTime;
    const timeSinceLastOnlineSync = currentDeviceTime - lastOnlineSync;

    // --- Manipulation Checks ---
    if (timeDiff < BACKWARD_TIME_LIMIT) {
      await flagTimeManipulation(userEmail, 'Backward time jump detected');
      return null;
    }
    if (timeDiff > ALLOWED_FORWARD_JUMP) {
      await flagTimeManipulation(userEmail, 'Forward time jump exceeded 24 hours');
      return null;
    }
    if (timeSinceLastOnlineSync > MAX_OFFLINE_TIME) {
      await flagTimeManipulation(userEmail, '7-day offline limit exceeded');
      return null;
    }

    // --- Update last check time ---
    await db.runAsync(
      `UPDATE app_state SET last_time_check = ? WHERE user_email = ?;`,
      [currentDeviceTime, userEmail]
    );
    // --- Return calculated server time ---
    return new Date(currentDeviceTime + serverTimeOffset).toISOString();
  } catch (error) {
    console.error('❌ Failed to get saved server time:', error);
    return null;
  }
};


export const resetTimeCheckData = async (userEmail: string): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    
    console.log('🔄 Resetting time check data for user:', userEmail);
    
    await db.runAsync(
      `DELETE FROM app_state WHERE user_email = ?;`,
      [userEmail]
    );
    
    console.log('✅ Time check data reset successfully');
  } catch (error) {
    console.error('❌ Failed to reset time check data:', error);
    throw error;
  }
};

export const detectTimeManipulation = async (
  userEmail: string
): Promise<{ isValid: boolean, reason?: string, requiresOnlineSync?: boolean }> => {
  try {
    await initDb();
    const db = await getDb();
    const result = await db.getAllAsync<AppStateRow>(
      `SELECT * FROM app_state WHERE user_email = ?;`,
      [userEmail]
    );
    if (!result || result.length === 0) return { isValid: true };

    const record = result[0];
    if (record.manipulation_detected === 1) {
      return { isValid: false, reason: 'Time manipulation was previously detected. Please connect to the internet to restore access.', requiresOnlineSync: true };
    }

    const currentDeviceTime = Date.now();
    const lastCheckTime = record.last_time_check;
    const lastOnlineSync = record.last_online_sync;
    const timeDiff = currentDeviceTime - lastCheckTime;
    const timeSinceLastOnlineSync = currentDeviceTime - lastOnlineSync;

    if (timeDiff < BACKWARD_TIME_LIMIT) {
      await flagTimeManipulation(userEmail, 'Backward time manipulation');
      return { isValid: false, reason: 'Device time was moved backward. Connect to the internet to restore access.', requiresOnlineSync: true };
    }
    if (timeDiff > ALLOWED_FORWARD_JUMP) {
      await flagTimeManipulation(userEmail, 'Forward time jump exceeded 24 hours');
      return { isValid: false, reason: 'Device time was moved forward more than 24 hours. Connect to the internet to restore access.', requiresOnlineSync: true };
    }
    if (timeSinceLastOnlineSync > MAX_OFFLINE_TIME) {
      await flagTimeManipulation(userEmail, '7-day offline limit exceeded');
      return { isValid: false, reason: 'Your 7-day offline access has expired. Please connect to the internet to reset it.', requiresOnlineSync: true };
    }

    return { isValid: true };
  } catch (error) {
    console.error('❌ Error in time manipulation detection:', error);
    return { isValid: true };
  }
};

export const getOfflineTimeStatus = async (userEmail: string): Promise<{
  remainingHours: number;
  totalHours: number;
  isBlocked: boolean;
} | null> => {
  try {
    const db = await getDb();
    const record = await db.getFirstAsync<AppStateRow>(
      `SELECT * FROM app_state WHERE user_email = ?;`,
      [userEmail]
    );
    if (!record) return null;
    if (record.manipulation_detected === 1) return { remainingHours: 0, totalHours: 168, isBlocked: true };

    const currentDeviceTime = Date.now();
    const timeSinceLastOnlineSync = currentDeviceTime - record.last_online_sync;
    if (timeSinceLastOnlineSync >= MAX_OFFLINE_TIME) {
      return { remainingHours: 0, totalHours: 168, isBlocked: true };
    }
    const remainingTimeMs = MAX_OFFLINE_TIME - timeSinceLastOnlineSync;
    const remainingHours = remainingTimeMs / 3600000;
    return {
      remainingHours: Math.max(0, remainingHours),
      totalHours: 168,
      isBlocked: false,
    };
  } catch (error) {
    console.error('❌ Failed to get offline time status:', error);
    return null;
  }
};

export const flagTimeManipulation = async (
  userEmail: string,
  reason: string
): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    await db.runAsync(
      `UPDATE app_state SET manipulation_detected = 1 WHERE user_email = ?;`,
      [userEmail]
    );
  } catch (error) {
    console.error('❌ Failed to flag time manipulation:', error);
  }
};

export const clearManipulationFlag = async (userEmail: string): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    await db.runAsync(
      `UPDATE app_state SET manipulation_detected = 0 WHERE user_email = ?;`,
      [userEmail]
    );
  } catch (error) {
    console.error('❌ Failed to clear manipulation flag:', error);
  }
};

export const updateOnlineSync = async (userEmail: string): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    
    const currentTime = Date.now();
    
    // Update online sync AND clear any manipulation flags
    await db.runAsync(
      `UPDATE app_state SET 
        last_time_check = ?,
        last_online_sync = ?,
        time_check_sequence = ?,
        manipulation_detected = 0
       WHERE user_email = ?;`,
      [currentTime, currentTime, currentTime, userEmail]
    );
    
    console.log('✅ Online sync updated and manipulation flag cleared');
  } catch (error) {
    console.error('❌ Failed to update online sync:', error);
  }
};

export const updateTimeSync = async (userEmail: string): Promise<void> => {
  try {
    await initDb();
    const db = await getDb();
    
    const currentTime = Date.now();
    
    await db.runAsync(
      `UPDATE app_state SET 
        last_time_check = ?,
        time_check_sequence = ?
       WHERE user_email = ?;`,
      [currentTime, currentTime, userEmail]
    );
    
    console.log('✅ Time sync updated');
  } catch (error) {
    console.error('❌ Failed to update time sync:', error);
  }
};

export const establishTimeBaseline = async (
  userEmail: string,
  serverTime: string
): Promise<void> => {
  try {
    const currentDeviceTime = new Date().toISOString();
    await saveServerTime(userEmail, serverTime, currentDeviceTime);
    console.log('✅ Time baseline established for offline usage');
  } catch (error) {
    console.error('❌ Failed to establish time baseline:', error);
    throw error;
  }
};

export const canAccessOfflineContent = async (userEmail: string): Promise<boolean> => {
  try {
    const timeCheck = await detectTimeManipulation(userEmail);
    return timeCheck.isValid;
  } catch (error) {
    console.error('❌ Error checking offline content access:', error);
    return false;
  }
};

export const checkManipulationHistory = async (userEmail: string): Promise<boolean> => {
  try {
    await initDb();
    const db = await getDb();
    
    const result = await db.getAllAsync<{ manipulation_detected: number }>(
      `SELECT manipulation_detected FROM app_state WHERE user_email = ?;`,
      [userEmail]
    );
    
    return result.length > 0 && result[0].manipulation_detected === 1;
  } catch (error) {
    console.error('❌ Failed to check manipulation history:', error);
    return false;
  }
};


// STORAGE


export const getUserStorageUsage = async (userEmail: string): Promise<string> => {
  try {
    await initDb();
    const db = await getDb();
    let totalBytes = 0;

    // ---------------------------------------------------------
    // 1. Calculate Database Internal Size (Text/JSON/Blobs)
    // ---------------------------------------------------------
    // We now sum the ACTUAL content columns, not just titles/descriptions
    const dbQueries = [
      `SELECT SUM(LENGTH(course_data)) as size FROM offline_course_details WHERE user_email = ?`,
      `SELECT SUM(LENGTH(content)) as size FROM offline_materials WHERE user_email = ?`,
      `SELECT SUM(LENGTH(data)) as size FROM offline_assessment_data WHERE user_email = ?`,
      `SELECT SUM(LENGTH(question_data)) as size FROM offline_quiz_questions WHERE user_email = ?`,
      `SELECT SUM(LENGTH(review_data)) as size FROM offline_assessment_reviews WHERE user_email = ?`
    ];

    for (const query of dbQueries) {
      const result = await db.getFirstAsync<{ size: number }>(query, [userEmail]);
      if (result && result.size) {
        totalBytes += result.size;
      }
    }

    // ---------------------------------------------------------
    // 2. Calculate Physical File Sizes (Materials)
    // ---------------------------------------------------------
    const materials = await db.getAllAsync<{ id: number, title: string, file_path: string }>(
      `SELECT id, title, file_path FROM offline_materials 
       WHERE user_email = ? AND file_path IS NOT NULL AND LENGTH(file_path) > 0`,
      [userEmail]
    );

    const materialSizePromises = materials.map(async (m) => {
      if (!m.file_path) return 0;
      try {
        const decryptedPath = decryptData(m.file_path);
        
        // Match the exact filename logic from [materialId].tsx
        const fileExtension = decryptedPath.split('.').pop();
        const sanitizedTitle = m.title.replace(/[^a-zA-Z0-9]/g, '_');
        // Logic: Title_ID.ext (Handles missing extension case gracefully)
        const fileName = `${sanitizedTitle}_${m.id}${fileExtension ? `.${fileExtension}` : ''}`;
        const localUri = FileSystem.documentDirectory + fileName;
        
        const fileInfo = await FileSystem.getInfoAsync(localUri);
        if (fileInfo.exists && !fileInfo.isDirectory) {
          return fileInfo.size;
        }
      } catch (e) {
        // File not downloaded yet
      }
      return 0;
    });

    // ---------------------------------------------------------
    // 3. Calculate Physical File Sizes (Assessment Instructions)
    // ---------------------------------------------------------
    const assessments = await db.getAllAsync<{ 
      id: number, 
      title: string, 
      assessment_file_path: string 
    }>(
      `SELECT id, title, assessment_file_path FROM offline_assessments 
       WHERE user_email = ? AND assessment_file_path IS NOT NULL`,
      [userEmail]
    );

    const assessmentSizePromises = assessments.map(async (a) => {
      if (!a.assessment_file_path) return 0;
      try {
        // Match the exact filename logic from [assessmentId].tsx
        // Default to 'pdf' if extension is missing, matching the downloader fallback
        const fileExtension = a.assessment_file_path.split('.').pop() || 'pdf';
        const sanitizedTitle = a.title.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `Assessment_${sanitizedTitle}_${a.id}.${fileExtension}`;
        const localUri = FileSystem.documentDirectory + fileName;

        const fileInfo = await FileSystem.getInfoAsync(localUri);
        if (fileInfo.exists && !fileInfo.isDirectory) {
          return fileInfo.size;
        }
      } catch (e) {
        // File not downloaded yet
      }
      return 0;
    });

    // ---------------------------------------------------------
    // 4. Calculate Pending Submission Files (User Uploads)
    // ---------------------------------------------------------
    const submissions = await db.getAllAsync<{ file_uri: string }>(
      `SELECT file_uri FROM offline_submissions WHERE user_email = ?`,
      [userEmail]
    );

    const submissionSizePromises = submissions.map(async (s) => {
      if (!s.file_uri) return 0;
      try {
        const cleanUri = decryptData(s.file_uri);
        // Only count if it's a file in our app's scope (not a web link)
        if (cleanUri.startsWith('file://') || cleanUri.startsWith('/')) {
            const fileInfo = await FileSystem.getInfoAsync(cleanUri);
            if (fileInfo.exists && !fileInfo.isDirectory) {
            return fileInfo.size;
            }
        }
      } catch (e) { }
      return 0;
    });

    // ---------------------------------------------------------
    // 5. Execute All Checks
    // ---------------------------------------------------------
    const allFileSizes = await Promise.all([
      ...materialSizePromises, 
      ...assessmentSizePromises,
      ...submissionSizePromises
    ]);

    const totalFileSize = allFileSizes.reduce((acc, size) => acc + size, 0);
    totalBytes += totalFileSize;

    // ---------------------------------------------------------
    // 6. Format Output
    // ---------------------------------------------------------
    if (totalBytes === 0) return '0 KB';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(totalBytes) / Math.log(k));
    const sizeIndex = Math.min(i, sizes.length - 1);
    
    return `${parseFloat((totalBytes / Math.pow(k, sizeIndex)).toFixed(2))} ${sizes[sizeIndex]}`;

  } catch (error) {
    console.error('Failed to calculate storage usage:', error);
    return 'Unknown';
  }
};


// PROGRESS FOR DATA SAVED IN LOCALDB

export const calculateOfflineProgress = async (userEmail: string): Promise<number> => {
  try {
    await initDb();
    const db = await getDb();

    // 1. Get what we SHOULD have (these are INDEPENDENT units of work)
    const courses = await db.getAllAsync(
      `SELECT id FROM offline_courses WHERE user_email = ?`, 
      [userEmail]
    );
    
    const assessments = await db.getAllAsync(
      `SELECT id, type FROM offline_assessments WHERE user_email = ?`, 
      [userEmail]
    );

    // Count downloadable units:
    // - Course details: 1 per course
    // - Assessment details: 1 per assessment (regardless of type)
    // - Quiz questions: 1 EXTRA per quiz/exam (on top of assessment details)
    const quizCount = assessments.filter((a: any) => 
      a.type === 'quiz' || a.type === 'exam'
    ).length;

    const totalUnits = courses.length + assessments.length + quizCount;

    if (totalUnits === 0) return 100; // Nothing to download

    // 2. Get what we ACTUALLY have

    // A. Course Details (JSON blob)
    const savedCourses = await db.getAllAsync(
      `SELECT course_id FROM offline_course_details WHERE user_email = ?`, 
      [userEmail]
    );

    // B. Assessment Details (attempt status/submissions)
    const savedAssessments = await db.getAllAsync(
      `SELECT assessment_id FROM offline_assessment_data WHERE user_email = ?`, 
      [userEmail]
    );

    // C. Quiz Questions (only for quiz/exam types)
    const savedQuizzes = await db.getAllAsync(
      `SELECT DISTINCT assessment_id FROM offline_quiz_questions WHERE user_email = ?`,
      [userEmail]
    );

    const completedUnits = savedCourses.length + savedAssessments.length + savedQuizzes.length;

    // Calculate percentage
    const percentage = Math.floor((completedUnits / totalUnits) * 100);
    return Math.min(100, Math.max(0, percentage));

  } catch (error) {
    console.error('Failed to calculate offline progress:', error);
    return 0;
  }
};

