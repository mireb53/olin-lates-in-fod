import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useNetworkStatus } from '../context/NetworkContext';
import api, { getServerTime, getUserData, syncOfflineQuiz, syncOfflineSubmission } from '../lib/api';
import {
  clearManipulationFlag,
  deleteCompletedOfflineQuizAttempt,
  deleteOfflineSubmission,
  downloadAllQuizQuestions,
  getCompletedOfflineQuizzes,
  getDb,
  getUnsyncedSubmissions,
  resetTimeCheckData,
  saveAssessmentDetailsToDb,
  saveAssessmentSyncTimestamp, // ADDED: Required to update local status after sync
  saveCourseDetailsToDb,
  saveServerTime,
  syncAllAssessmentDetails,
  updateOnlineSync
} from '../lib/localDb';

// Type definitions
interface UnsyncedSubmission {
  id: number;
  assessment_id: number;
  file_uri: string;
  original_filename: string;
  submitted_at: string;
}

interface UnsyncedQuiz {
  assessment_id: number;
  answers: string;
  start_time: string;
  end_time: string;
  server_submission_id?: number;
}

interface EnrolledCourse {
  id: number;
  title: string;
  course_code: string;
  description: string;
  program?: {
    id: number;
    name: string;
  };
  instructor?: {
    id: number;
    name: string;
    given_name?: string;
  };
  status?: string;
  topics?: any[];
  materials?: any[];
  assessments?: any[];
}

interface SyncMetadata {
  last_full_sync: number;
  last_course_sync: number;
  last_assessment_sync: number;
  last_quiz_sync: number;
}

// ADDED: Interface for latest assignment submission (used in post-sync refresh)
interface LatestAssignmentSubmission {
  has_submitted_file: boolean;
  submitted_file_path: string | null;
  submitted_file_url: string | null;
  submitted_file_name: string | null;
  original_filename: string | null;
  submitted_at: string | null;
  status: string | null;
}

const SYNC_CONFIG = {
  COOLDOWN: 5000,              // 5 seconds between sync attempts
  COURSE_FRESHNESS: 300000,    // ✅ 5 minutes (was 10) - catch course changes faster
  ASSESSMENT_FRESHNESS: 180000, // ✅ 3 minutes (was 5) - catch assessment changes faster
  QUIZ_FRESHNESS: 300000,      // ✅ 5 minutes (was 10) - catch quiz edits faster
  SUBMISSION_ALWAYS_SYNC: true,
  SILENT_SUCCESS: true
};

/**
 * Enhanced automatic sync hook with silent background updates
 */
export const useNetworkSync = (onSyncStateChange?: (isSyncing: boolean) => void) => {
  const { netInfo, isBackendReachable } = useNetworkStatus();
  const isInternetReachable = netInfo?.isInternetReachable;
  const previousConnectionState = useRef<boolean | null | undefined>(null);
  const isSyncing = useRef(false);
  const lastSyncAttempt = useRef(0);

  useEffect(() => {
    const performSmartSync = async () => {
      const isNowOnline = isBackendReachable === true;
      const now = Date.now();
      const timeSinceLastSync = now - lastSyncAttempt.current;

      if (isNowOnline && !isSyncing.current && timeSinceLastSync > SYNC_CONFIG.COOLDOWN) {
        
        console.log('🔄 [Smart Sync] Online. Analyzing what needs updating...');
        isSyncing.current = true;
        lastSyncAttempt.current = now;
        
        // 1. CAPTURE START TIME (For Blue Pill visibility)
        const startTime = Date.now();
        
        // 🟢 NOTIFY LAYOUT: SYNC STARTED
        if (onSyncStateChange) onSyncStateChange(true);

        try {
          const userData = await getUserData();
          if (!userData?.email) {
            // We handle the early exit in the finally block
            return;
          }

          const userEmail = userData.email;
          const syncMeta = await getSyncMetadata(userEmail);
          
          let syncResults = {
            assessmentsSubmitted: 0,
            quizzesSynced: 0,
            coursesUpdated: 0,
            assessmentDetailsUpdated: 0,
            quizQuestionsDownloaded: 0,
            skipped: [] as string[],
            errors: [] as string[]
          };

          // ============================================
          // PHASE 1: TIME & APP STATE SYNCHRONIZATION (Always, Silent)
          // ============================================
          try {
            await resetTimeCheckData(userEmail);
            const apiServerTime = await getServerTime();
            if (apiServerTime) {
              const currentDeviceTime = new Date().toISOString();
              await saveServerTime(userEmail, apiServerTime, currentDeviceTime);
              await updateOnlineSync(userEmail);
              await clearManipulationFlag(userEmail);
            }
          } catch (timeError) {
            console.error('❌ [Smart Sync] Server time sync failed:', timeError);
            // Non-critical, don't stop the sync
          }

          // ============================================
          // PHASE 2: SYNC OFFLINE SUBMISSIONS (The Critical Part)
          // ============================================
          const unsyncedSubmissions = (await getUnsyncedSubmissions(userEmail)) as UnsyncedSubmission[];
          const unsyncedQuizzes = (await getCompletedOfflineQuizzes(userEmail)) as UnsyncedQuiz[];

          if (unsyncedSubmissions.length > 0 || unsyncedQuizzes.length > 0) {
            console.log(`📤 [Smart Sync] Syncing ${unsyncedSubmissions.length} submissions & ${unsyncedQuizzes.length} quizzes...`);

            // Track IDs that need a status refresh after upload
            const submittedAssessmentIds = new Set<number>();

            // --- A. SYNC ASSIGNMENTS ---
            for (const submission of unsyncedSubmissions) {
              try {
                const result = await syncOfflineSubmission(
                  submission.assessment_id,
                  submission.file_uri,
                  submission.original_filename,
                  submission.submitted_at
                );

                if (result.status === 'success') {
                  // Optimistic update
                  await deleteOfflineSubmission(submission.id);
                  syncResults.assessmentsSubmitted++;
                  // Add to set for refresh
                  submittedAssessmentIds.add(submission.assessment_id);
                } else if (result.status === 'error') {
                  syncResults.errors.push(`Assessment: ${result.message || 'Upload failed'}`);                }
              } catch (error) {
                syncResults.errors.push(`Assessment: ${error.message || 'Unknown error'}`);
              }
            }

            // --- B. SYNC QUIZZES ---
            for (const quiz of unsyncedQuizzes) {
              try {
                if (!quiz.answers || !quiz.start_time || !quiz.end_time) continue;

                const result = await syncOfflineQuiz(
                  quiz.assessment_id,
                  quiz.answers,
                  quiz.start_time,
                  quiz.end_time,
                  quiz.server_submission_id
                );

                if (result.status === 'success') {
                  await deleteCompletedOfflineQuizAttempt(quiz.assessment_id, userEmail);
                  syncResults.quizzesSynced++;
                  submittedAssessmentIds.add(quiz.assessment_id);
                } 
                else if (result.status === 'invalid') {
                  // 🚨 Security: The server rejected this because another submission exists
                  console.warn(`🗑️ Deleting invalid offline quiz attempt for ${quiz.assessment_id}`);
                  await deleteCompletedOfflineQuizAttempt(quiz.assessment_id, userEmail);
                  
                  // Add to errors to notify user
                  syncResults.errors.push(`Quiz: ${result.message || 'Already submitted from another device.'}`);
                }
                // NEW LOGIC END
                else if (result.status === 'error') {
                  syncResults.errors.push(`Assessment: ${result.message || 'Upload failed'}`);
                }
                // If 'locked', ignore.
              } catch (error) {
                syncResults.errors.push(`Quiz: ${error.message || 'Unknown error'}`);
              }
            }

            // --- C. REFRESH STATUS (The "To Sync" -> "Done" Update) ---
            if (submittedAssessmentIds.size > 0) {
              console.log(`📡 [Smart Sync] Refreshing status for ${submittedAssessmentIds.size} items...`);
              const db = await getDb();

              for (const assessmentId of submittedAssessmentIds) {
                try {
                  let latestSubmission: LatestAssignmentSubmission | null = null;
                  let attemptStatus: any = null;

                  // Determine type to know which endpoint to hit
                  const assessment = await db.getFirstAsync<{ type: string }>(
                    `SELECT type FROM offline_assessments WHERE id = ? AND user_email = ?;`,
                    [assessmentId, userEmail]
                  );
                  const assessmentType = assessment?.type;

                  if (assessmentType === 'quiz' || assessmentType === 'exam') {
                    try {
                        const attemptResponse = await api.get(`/assessments/${assessmentId}/attempt-status`);
                        if (attemptResponse.status === 200) attemptStatus = attemptResponse.data;
                    } catch (e) {}
                  } else if (['assignment', 'project', 'activity'].includes(assessmentType || '')) {
                    try {
                        const latestResponse = await api.get(`/assessments/${assessmentId}/latest-assignment-submission`);
                        if (latestResponse.status === 200) latestSubmission = latestResponse.data as LatestAssignmentSubmission;
                    } catch (e) {}
                  }

                  // Save new status
                  await saveAssessmentDetailsToDb(assessmentId, userEmail, attemptStatus, latestSubmission);
                  await saveAssessmentSyncTimestamp(assessmentId, userEmail, new Date().toISOString());
                  
                  syncResults.assessmentDetailsUpdated++; 

                } catch (statusError) {
                   // 🔴 SILENT FAILURE: If this fails, do NOT add to syncResults.errors.
                   // The upload succeeded, so we don't want to scare the user.
                   console.warn(`⚠️ [Smart Sync] Status refresh failed for ${assessmentId}. Ignoring.`);
                }
              }
            }
          }

          // ============================================
          // PHASE 3: COURSES (Silent Background)
          // ============================================
          if (isDataStale(syncMeta.last_course_sync, SYNC_CONFIG.COURSE_FRESHNESS)) {
            try {
              console.log('🔄 [Smart Sync] Refreshing materials for all courses...');
              
              const db = await getDb();
              const allCourses = await db.getAllAsync(
                `SELECT id FROM offline_courses WHERE user_email = ?;`,
                [userEmail]
              );
              
              for (const course of allCourses) {
                try {
                  const { refreshAllMaterialsForCourse } = await import('../lib/localDb');
                  await refreshAllMaterialsForCourse(course.id, userEmail, api);
                } catch (e) {
                  console.warn(`Failed to refresh materials for course ${course.id}`);
                }
              }
            } catch (e) {
              console.log('Background material refresh failed');
            }
          }

          // ============================================
          // PHASE 4: ASSESSMENT DETAILS (Silent Background)
          // ============================================
          if (isDataStale(syncMeta.last_assessment_sync, SYNC_CONFIG.ASSESSMENT_FRESHNESS)) {
            try {
              const res = await syncAllAssessmentDetails(userEmail, api);
              if (res.success > 0) {
                await updateSyncTimestamp(userEmail, 'assessment');
                syncResults.assessmentDetailsUpdated += res.success;
              }
            } catch (e) { console.log('Background assessment sync failed'); }
          }

          // ============================================
          // PHASE 5: QUIZ QUESTIONS (Silent Background)
          // ============================================
          if (isDataStale(syncMeta.last_quiz_sync, SYNC_CONFIG.QUIZ_FRESHNESS)) {
            try {
                console.log('🔄 [Smart Sync] Checking for quiz question updates...');
                
                // ALWAYS force refresh to catch instructor edits
                const res = await downloadAllQuizQuestions(
                  userEmail, 
                  api, 
                  undefined, 
                  true  // ✅ ALWAYS force refresh in background sync
                );
                
                if (res.success > 0) {
                  await updateSyncTimestamp(userEmail, 'quiz');
                  syncResults.quizQuestionsDownloaded = res.success;
                  console.log(`✅ [Smart Sync] Refreshed ${res.success} quiz question sets`);
                }
            } catch (e) { 
                console.log('Background quiz sync failed:', e); 
            }
          }

          console.log('📊 [Smart Sync] Completed:', syncResults);
          
          const totalSynced = syncResults.assessmentsSubmitted + syncResults.quizzesSynced;
          const hasCriticalErrors = syncResults.errors.length > 0;
          
          if (totalSynced > 0) {
            // SUCCESS: Silent (No Alert)
            console.log(`✅ [Smart Sync] Uploaded ${totalSynced} items successfully.`);

            if (hasCriticalErrors) {
              // PARTIAL SUCCESS: Alert about errors
              const uniqueErrors = [...new Set(syncResults.errors)];
              const errorText = uniqueErrors.slice(0, 2).join('\n• ');
              
              Alert.alert(
                'Partial Sync', 
                `Your work was uploaded, but some items failed:\n\n• ${errorText}\n\n💡 Please check your connection for the remaining items.`,
                [{ text: 'OK' }]
              );
            }
            
          } else if (hasCriticalErrors) {
             // TOTAL FAILURE: Detailed Alert
             const uniqueErrors = [...new Set(syncResults.errors)]; // Remove duplicates
             const errorDetails = uniqueErrors.slice(0, 3).join('\n• '); // Show top 3
             const moreCount = uniqueErrors.length - 3;
             const moreText = moreCount > 0 ? `\n...and ${moreCount} more` : '';

             // Add helpful advice based on error type
             let advice = "\n\n💡 Suggestions:\n- Check your Wi-Fi or data connection.\n- Restart the app if the issue persists.";
             if (uniqueErrors.some(e => e.includes('413') || e.includes('Large'))) {
                advice = "\n\n💡 File size limit exceeded (Max 50MB). Please compress your file.";
             } else if (uniqueErrors.some(e => e.includes('timeout'))) {
                advice = "\n\n💡 The request timed out. Your connection might be too slow.";
             }

             Alert.alert(
               'Sync Failed', 
               `We couldn't sync your data:\n\n• ${errorDetails}${moreText}${advice}`, 
               [{ text: 'OK' }]
             );
          }

        } catch (error) {
          console.error('❌ [Smart Sync] Critical error:', error);
        } finally {
          // =========================================================
          // 2. ENFORCE MINIMUM DISPLAY TIME (The Blue Pill Fix)
          // =========================================================
          const elapsed = Date.now() - startTime;
          const MIN_DISPLAY_TIME = 1500; // 1.5 seconds
          
          if (elapsed < MIN_DISPLAY_TIME) {
            // Wait the remaining time
            await new Promise(resolve => setTimeout(resolve, MIN_DISPLAY_TIME - elapsed));
          }

          isSyncing.current = false;
          // 🔴 NOTIFY LAYOUT: SYNC FINISHED (Blue pill disappears now)
          if (onSyncStateChange) onSyncStateChange(false);
        }
      } else if (isNowOnline && timeSinceLastSync <= SYNC_CONFIG.COOLDOWN) {
          // Cooldown logic...
      }

      previousConnectionState.current = isBackendReachable;
    };

    performSmartSync();
  }, [isBackendReachable]);
};

// ============================================
// HELPER FUNCTIONS (These remain unchanged)
// ============================================

/**
 * Check if data is stale based on last sync time
 */
const isDataStale = (lastSync: number, maxAge: number): boolean => {
  if (!lastSync || lastSync === 0) return true;
  return Date.now() - lastSync > maxAge;
};

/**
 * Get sync metadata for staleness detection
 */
const getSyncMetadata = async (userEmail: string): Promise<SyncMetadata> => {
  try {
    const db = await getDb();
    
    const result = await db.getFirstAsync(
      `SELECT * FROM sync_metadata WHERE user_email = ?;`,
      [userEmail]
    ) as any;

    if (result) {
      return {
        last_full_sync: result.last_full_sync || 0,
        last_course_sync: result.last_course_sync || 0,
        last_assessment_sync: result.last_assessment_sync || 0,
        last_quiz_sync: result.last_quiz_sync || 0,
      };
    }

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        user_email TEXT PRIMARY KEY,
        last_full_sync INTEGER DEFAULT 0,
        last_course_sync INTEGER DEFAULT 0,
        last_assessment_sync INTEGER DEFAULT 0,
        last_quiz_sync INTEGER DEFAULT 0
      );
    `);

    return {
      last_full_sync: 0,
      last_course_sync: 0,
      last_assessment_sync: 0,
      last_quiz_sync: 0,
    };
  } catch (error) {
    console.error('❌ Failed to get sync metadata:', error);
    return {
      last_full_sync: 0,
      last_course_sync: 0,
      last_assessment_sync: 0,
      last_quiz_sync: 0,
    };
  }
};

/**
 * Update sync timestamp for a specific data type
 */
const updateSyncTimestamp = async (
  userEmail: string, 
  type: 'course' | 'assessment' | 'quiz'
): Promise<void> => {
  try {
    const db = await getDb();
    const now = Date.now();
    
    await db.runAsync(
      `INSERT OR IGNORE INTO sync_metadata 
       (user_email, last_full_sync, last_course_sync, last_assessment_sync, last_quiz_sync)
       VALUES (?, 0, 0, 0, 0);`,
      [userEmail]
    );

    const column = `last_${type}_sync`;
    await db.runAsync(
      `UPDATE sync_metadata SET ${column} = ?, last_full_sync = ? WHERE user_email = ?;`,
      [now, now, userEmail]
    );
    
    console.log(`✅ Updated ${type} sync timestamp to ${now} (silent)`);
  } catch (error) {
    console.error('❌ Failed to update sync timestamp:', error);
  }
};

/**
 * Helper function to fetch and save complete course data
 */
const fetchAndSaveCompleteCoursesData = async (
  courses: EnrolledCourse[], 
  userEmail: string
): Promise<void> => {
  for (const course of courses) {
    try {
      const courseId = typeof course.id === 'string' ? parseInt(course.id, 10) : course.id;
      
      if (!courseId || isNaN(courseId) || courseId <= 0) {
        console.error('❌ Invalid course ID:', course.id);
        continue;
      }

      const courseDetailResponse = await api.get(`/courses/${courseId}`);
      
      if (courseDetailResponse.status === 200) {
        const detailedCourse = courseDetailResponse.data.course;
        if (!detailedCourse.id) {
          detailedCourse.id = courseId;
        }
        
        await saveCourseDetailsToDb(detailedCourse, userEmail);
      }
    } catch (saveError: any) {
      console.error(`❌ Failed to save course ${course.title}:`, saveError.message);
    }
  }
};