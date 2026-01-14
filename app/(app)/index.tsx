import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, FlatList, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useNetworkStatus } from '../../context/NetworkContext';
import api, {
    clearAuthToken, getAuthToken,
    getProfile,
    getServerTime, getUserData, hasCompletedTutorial, setTutorialCompleted, // <--- Add this
    storeUserData,
    syncOfflineQuiz, syncOfflineSubmission,
} from '../../lib/api';
import {
    deleteCompletedOfflineQuizAttempt,
    deleteOfflineSubmission,
    downloadAllQuizQuestions,
    getCompletedOfflineQuizzes,
    getDb,
    getEnrolledCoursesFromDb,
    getOfflineTimeStatus,
    getUnsyncedSubmissions,
    getUserStorageUsage,
    saveCourseDetailsToDb,
    saveCourseToDb,
    saveServerTime,
    syncAllAssessmentDetails,
    updateTimeSync
} from '../../lib/localDb';
import { showOfflineModeGuide } from '../../lib/offlineWarning';
const { width, height } = Dimensions.get('window');

// Responsive design helper
const isTablet = width >= 768;
const isLargeTablet = width >= 1024;
const contentMaxWidth = isLargeTablet ? 900 : isTablet ? 700 : width;

interface Course {
  id: number;
  title: string;
  course_code: string;
  description: string;
  credits: number;
  status: string; // Added status field
  program: {
    id: number;
    name: string;
  };
  instructor: {
    id: number;
    name: string;
    given_name: string;
  };
}

interface EnrolledCourse extends Course {
  pivot?: {
    status: string;
    enrollment_date: string;
  };
}

// 1. UPDATED TUTORIAL STEPS ARRAY
const tutorialSteps = [
  {
    image: require('@/assets/images/dashboard.jpg'),
    title: 'Welcome to Your Dashboard!',
    text: 'This is your central hub. It gives you an overview of your progress and key application features.'
  },
  {
    image: require('@/assets/images/Discover-courses.jpg'),
    title: 'Discover New Courses',
    text: 'Tap the "Discover new courses" button to search for and enroll in new classes. This feature requires an active internet connection.'
  },
  {
    image: require('@/assets/images/Settings.jpg'),
    title: 'Manage Your Settings',
    text: 'Access your profile to update your information, manage notification preferences, and view privacy details.'
  },
  {
    image: require('@/assets/images/Course-details.jpg'),
    title: 'Course Details',
    text: 'Tap on any enrolled course to view detailed information, including course materials, topics, and assessments.'
  },
  {
    image: require('@/assets/images/Assigned.jpg'),
    title: 'Assigned Tasks',
    text: 'Keep track of all your assigned assessments, exams, and upcoming deadlines in this section.'
  },
  {
    image: require('@/assets/images/Missing.jpg'),
    title: 'Missing Submissions',
    text: 'Don\'t fall behind! This tab helps you quickly identify and submit any missing or overdue assignments.'
  },
  {
    image: require('@/assets/images/To-sync.jpg'),
    title: 'Offline Sync Status',
    text: 'When you go back online, submissions and quiz attempts completed offline will be sent to the server. Check here for unsynced items.'
  },
  {
    image: require('@/assets/images/Done.jpg'),
    title: 'Completed Work',
    text: 'View all your successfully completed assignments and track your overall academic progress.'
  },
  {
    image: require('@/assets/images/My-courses.jpg'),
    title: 'My Courses Overview',
    text: 'Your enrolled courses are displayed here. Swipe horizontally to view them all, and tap one to start learning!'
  }
];

export default function HomeScreen() {
  const router = useRouter();
  const { isNewUser } = useLocalSearchParams();
  const [userName, setUserName] = useState<string>('Guest');
  const [isSearchModalVisible, setSearchModalVisible] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Course[]>([]);
  const [isLoadingSearch, setIsLoadingSearch] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [enrolledCourses, setEnrolledCourses] = useState<EnrolledCourse[]>([]);
  const [isLoadingEnrolledCourses, setIsLoadingEnrolledCourses] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isAdVisible, setIsAdVisible] = useState<boolean>(false);
  const adContentHeight = 80;
  const {isConnected, netInfo } = useNetworkStatus();
  const enrolledCoursesFlatListRef = useRef<FlatList<EnrolledCourse>>(null);
  const [offlineStatus, setOfflineStatus] = useState<{ remainingHours: number; totalHours: number } | null>(null);
  const [isTutorialModalVisible, setIsTutorialModalVisible] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const tutorialFadeAnim = useRef(new Animated.Value(0)).current;

  const tutorialScaleAnim = useRef(new Animated.Value(0.9)).current;

  // NEW: State for enrollment modal
  const [isEnrollModalVisible, setIsEnrollModalVisible] = useState<boolean>(false);
  const [courseToEnroll, setCourseToEnroll] = useState<Course | null>(null);
  const [enrollmentCode, setEnrollmentCode] = useState<string>('');
  const [isEnrolling, setIsEnrolling] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isSyncModalVisible, setSyncModalVisible] = useState(false);
  const [syncProgressValue, setSyncProgressValue] = useState(0);
  const [syncMessage, setSyncMessage] = useState('');
  const [storageUsage, setStorageUsage] = useState<string>('0 KB');
  // Utility function for retry logic with exponential backoff
  const retryWithBackoff = async (fn: Function, maxRetries = 3, baseDelay = 1000) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        const delay = baseDelay * Math.pow(2, i);
        console.log(`Retry attempt ${i + 1}/${maxRetries} in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  // Check if data is stale
  const isDataStale = (lastSync: string | null, maxAge: number = 3600000) => { // 1 hour default
    if (!lastSync) return true;
    return Date.now() - new Date(lastSync).getTime() > maxAge;
  };
  useEffect(() => {
    
    setIsInitialized(true); 
  }, []);

//   useEffect(() => {
//   let isMounted = true;
//   const initialize = async () => {
//     try {
//       console.log('Initializing home screen...');
      
//       // Add retry logic for initialization
//       let retryCount = 0;
//       const maxRetries = 3;
      
//       while (retryCount < maxRetries && isMounted) {
//         try {
//           await initDb();
//           console.log('Home screen database initialized');
//           if (isMounted) {
//             setIsInitialized(true);
//           }
//           break; // Success, exit retry loop
//         } catch (initError) {
//           retryCount++;
//           console.error(`Home screen initialization error (attempt ${retryCount}):`, initError);
          
//           if (retryCount < maxRetries) {
//             // Wait before retrying
//             await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
//           } else {
//             throw initError;
//           }
//         }
//       }
//     } catch (error) {
//       console.error('Final home screen initialization error:', error);
//       if (isMounted) {
//         Alert.alert(
//           'Initialization Error',
//           'Failed to initialize the app. Please restart the application.',
//           [{ text: 'OK' }]
//         );
//       }
//     }
//   };
//   initialize();
//   return () => { 
//     isMounted = false;
//   };
// }, []);

useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const updateStats = async () => {
      if (!isInitialized) return;
      try {
        const userData = await getUserData();
        if (userData?.email) {
          // 1. Always update storage usage
          const usage = await getUserStorageUsage(userData.email);
          setStorageUsage(usage);

          // 2. REMOVED Progress Percentage calculation
        }
      } catch (e) {
        console.error('Stats update failed:', e);
      }
    };

    updateStats();

    if (netInfo?.isInternetReachable) {
      intervalId = setInterval(updateStats, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isInitialized, netInfo?.isInternetReachable, isRefreshing]);

  useEffect(() => {
    const updateOfflineStatus = async () => {
      if (netInfo?.isInternetReachable === false && isInitialized) {
        try {
          const userData = await getUserData();
          if (userData?.email) {
            const status = await getOfflineTimeStatus(userData.email);
            if (status && !status.isBlocked) {
              setOfflineStatus({
                remainingHours: status.remainingHours,
                totalHours: status.totalHours,
              });
            } else {
              setOfflineStatus({ remainingHours: 0, totalHours: 168 }); // Show 0 if blocked
            }
          }
        } catch (e) {
          console.error('Failed to update offline status', e);
          setOfflineStatus(null);
        }
      } else {
        // Clear status when online
        setOfflineStatus(null);
      }
    };

    updateOfflineStatus();
  }, [netInfo?.isInternetReachable, isInitialized, isRefreshing]);

  const autoDownloadAssessmentData = async (userEmail: string, forceRefresh: boolean = false) => {
    if (!netInfo?.isInternetReachable) {
      console.log('No internet connection - skipping smart sync');
      setSyncStatus('Offline - sync skipped');
      return { success: true, downloaded: 0, failed: 0 };
    }

    if (!forceRefresh && !isDataStale(lastSyncTime)) {
      console.log('Data is fresh, skipping sync');
      setSyncStatus('Data is up to date');
      return { success: true, downloaded: 0, failed: 0 };
    }

    try {
      console.log('Starting comprehensive offline data sync...');
      setSyncStatus('Preparing offline data...');

      let totalSuccess = 0;
      let totalFailed = 0;

      // PHASE 1: Sync assessment details (attempt status & submissions)
      setSyncStatus('Syncing assessment status...');
      const syncResult = await retryWithBackoff(async () => {
        return await syncAllAssessmentDetails(
          userEmail,
          api,
          (current, total, type) => {
            setSyncStatus(`${type}: ${current}/${total} assessments`);
          }
        );
      }, 3, 2000);

      totalSuccess += syncResult.success;
      totalFailed += syncResult.failed;

      // PHASE 2: Download quiz questions (THE MISSING PIECE!)
      setSyncStatus('Downloading quiz questions...');
      const quizResult = await retryWithBackoff(async () => {
        return await downloadAllQuizQuestions(
          userEmail,
          api,
          (current, total, skipped = 0) => {
            setSyncStatus(`Quiz questions: ${current}/${total} (${skipped} skipped)`);
          },
          forceRefresh
        );
      }, 2, 1500);

      totalSuccess += quizResult.success;
      totalFailed += quizResult.failed;

      // PHASE 3: Update sync timestamp
      if (totalSuccess > 0) {
        const now = new Date().toISOString();
        setLastSyncTime(now);
        setSyncStatus(`Synced ${totalSuccess} items successfully`);
      }

      if (totalFailed > 0) {
        console.warn(`Some downloads failed: ${totalFailed} items`);
        setSyncStatus(`${totalFailed} items failed`);
      }

      return { success: true, downloaded: totalSuccess, failed: totalFailed };

    } catch (error) {
      console.error('Comprehensive sync failed:', error);
      setSyncStatus('Sync failed - offline data preserved');
      return { success: false, downloaded: 0, failed: 1 };
    } finally {
      setTimeout(() => setSyncStatus(''), 3000);
    }
  };

  function formatRemainingTime(remainingHours: number): string {
    const totalMinutes = Math.floor(remainingHours * 60);
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    let parts = [];
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    return parts.join(', ');
  }

  // ... imports

  useEffect(() => {
    const syncSubmissions = async () => {
      if (!isInitialized) return;
      const hasRealInternet = netInfo?.isInternetReachable === true;
      
      if (hasRealInternet) {
        const user = await getUserData(); 
        if (!user || !user.email) return;

        const unsyncedAssignments = await getUnsyncedSubmissions(user.email); 
        const completedOfflineQuizzes = await getCompletedOfflineQuizzes(user.email); 

        if (unsyncedAssignments.length === 0 && completedOfflineQuizzes.length === 0) {
          return;
        }

        // 🟢 START SYNC UI
        setSyncModalVisible(true);
        setSyncProgressValue(0);
        setSyncMessage('Preparing to sync...');

        let syncedCount = 0; 
        let failedCount = 0;
        let errorMessages: string[] = [];
        const totalItems = unsyncedAssignments.length + completedOfflineQuizzes.length;
        let currentItemIndex = 0;

        try {
          // --- A. Sync Assignments ---
          for (let i = 0; i < unsyncedAssignments.length; i++) {
            // ... (Assignment sync logic remains the same)
            const submission = unsyncedAssignments[i];
            currentItemIndex++;
            setSyncMessage(`Syncing item ${currentItemIndex} of ${totalItems}\n(Uploading File...)`);
            setSyncProgressValue(0); 

            const result = await syncOfflineSubmission(
              submission.assessment_id,
              submission.file_uri,
              submission.original_filename,
              submission.submitted_at,
              (percent) => {
                  const visualPercent = Math.min(percent, 95);
                  setSyncProgressValue(visualPercent);
              }
            );

            if (result.status === 'success') {
              setSyncProgressValue(100);
              await deleteOfflineSubmission(submission.id);
              syncedCount++;
            } else if (result.status === 'locked') {
              console.log(`Item ${submission.id} is locked (syncing in background).`);
              setSyncMessage(`Item ${currentItemIndex} is syncing in background...`);
              await new Promise(r => setTimeout(r, 1000));
            } else {
              failedCount++;
              errorMessages.push(`File Upload: ${result.message || 'Failed'}`);
            }
          }

          for (const quizAttempt of completedOfflineQuizzes) {
            
            currentItemIndex++;
            setSyncMessage(`Syncing item ${currentItemIndex} of ${totalItems}\n(Uploading Quiz...)`);
            setSyncProgressValue(95);

            const result = await syncOfflineQuiz(
              quizAttempt.assessment_id,
              quizAttempt.answers,
              quizAttempt.start_time,
              quizAttempt.end_time,
              quizAttempt.server_submission_id
            );

            if (result.status === 'success') {
              setSyncProgressValue(100);
              // 1. FIX: Use deleteCompleted... not deleteOffline...
              await deleteCompletedOfflineQuizAttempt(quizAttempt.assessment_id, user.email);
              syncedCount++;
            } 
            else if (result.status === 'invalid') {
               console.log(`🗑️ [Home Sync] Deleting invalid/conflict quiz attempt ${quizAttempt.assessment_id}`);
               
               // 2. FIX: Use deleteCompleted... here too!
               // The attempt waiting to be synced is in the 'completed' state (is_completed=1).
               // Using deleteOfflineQuizAttempt (is_completed=0) would fail to find/delete it.
               await deleteCompletedOfflineQuizAttempt(quizAttempt.assessment_id, user.email);
               
               failedCount++;
               errorMessages.push(`Quiz ${quizAttempt.assessment_id}: Removed invalid attempt (Conflict).`);
            }
            else if (result.status === 'locked') {
               console.log(`Assessment ${quizAttempt.assessment_id} is locked.`);
               setSyncMessage(`Assessment is syncing in background...`);
               await new Promise(r => setTimeout(r, 1000));
            } 
            else {
              failedCount++;
              errorMessages.push(`Assessment: ${result.message || 'Failed'}`);
            }
          }
          
          // ... (Rest of error handling logic remains the same)
          const showDetailedError = (title: string, errors: string[]) => {
             const uniqueErrors = [...new Set(errors)];
             const errorList = uniqueErrors.slice(0, 3).join('\n• ');
             const moreCount = uniqueErrors.length - 3;
             const moreText = moreCount > 0 ? `\n...and ${moreCount} more.` : '';
             
             let suggestion = "\n\n💡 Try checking your internet connection or restarting the app.";
             if (errors.some(e => e.includes('413') || e.includes('Large'))) {
               suggestion = "\n\n💡 One or more files may be too large (Max 100MB).";
             }

             setTimeout(() => {
                Alert.alert(
                  title, 
                  `Issues encountered:\n\n• ${errorList}${moreText}${suggestion}`,
                  [{ text: 'OK' }]
                );
             }, 500);
          };

          if (syncedCount > 0) {
             console.log(`✅ [Home Sync] Successfully uploaded ${syncedCount} items.`);
             fetchCourses();
             if (failedCount > 0) {
                showDetailedError('Partial Sync Complete', errorMessages);
             }
          } else if (failedCount > 0) {
             showDetailedError('Sync Failed', errorMessages);
          }

        } catch (error) {
          console.error("Sync error in Home Screen:", error);
        } finally {
          setSyncModalVisible(false);
        }
      }
    };

    syncSubmissions();
  }, [netInfo?.isInternetReachable, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return; // Wait for app to be ready

    const checkTutorial = async () => {
      const alreadyCompleted = await hasCompletedTutorial();

      if (isNewUser === 'true' && !alreadyCompleted) {
        // Reset animations
        tutorialFadeAnim.setValue(0);
        tutorialScaleAnim.setValue(0.9); // Start slightly small
        
        setIsTutorialModalVisible(true);
        setTutorialStep(0);
        
        // Run animations in parallel
        Animated.parallel([
          Animated.spring(tutorialScaleAnim, {
            toValue: 1,
            friction: 6, // Gives it a slight bounce
            useNativeDriver: true,
          }),
          Animated.timing(tutorialFadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          })
        ]).start();
      }
    };

    checkTutorial();
  }, [isInitialized, isNewUser]);

  // // MODIFICATION: Updated the offline warning check
  // useEffect(() => {
  //   const checkOfflineWarning = async () => {
  //     // This now strictly checks if the network is "false" (explicitly offline)
  //     // and will no longer fire if netInfo is null or undefined.
  //     if (netInfo?.isInternetReachable === false) {
  //       await showOfflineModeWarningIfNeeded();
  //     }
  //   };
    
  //   checkOfflineWarning();
  // }, [netInfo?.isInternetReachable]);
  // // END MODIFICATION

  const fetchAndSaveCompleteCoursesData = async (courses: EnrolledCourse[], userEmail: string) => {
    console.log('Starting to fetch complete course data in parallel...');

    // Create an array of all fetch-and-save promises
    const allPromises = courses.map(async (course) => {
      try {
        const courseId = typeof course.id === 'string' ? parseInt(course.id, 10) : course.id;

        if (!courseId || isNaN(courseId) || courseId <= 0) {
          console.error('⚠️ Invalid course ID detected:', course.id);
          return; // Skip this one
        }

        const courseDetailResponse = await api.get(`/courses/${courseId}`);
        
        if (courseDetailResponse.status === 200) {
          const detailedCourse = courseDetailResponse.data.course;
          if (!detailedCourse.id) {
            detailedCourse.id = courseId;
          }
          await saveCourseDetailsToDb(detailedCourse, userEmail);
          console.log(`Successfully saved detailed data for course: ${detailedCourse.title}`);
        } else {
          console.warn(`Failed to fetch detailed data for course ${courseId}: Status ${courseDetailResponse.status}`);
        }
      } catch (saveError: any) {
        console.error(`Failed to fetch/save complete data for course ${course.title}:`, saveError.message || saveError);
      }
    });

    // Wait for all promises to either succeed or fail
    await Promise.allSettled(allPromises);

    console.log('Completed fetching and saving all course data in parallel.');
  };

  const fetchCourses = async () => {
    if (!isInitialized || netInfo === null) return;

    let userEmail = '';
    try {
      const userData = await getUserData();
      if (userData && userData.name && userData.email) {
        setUserName(userData.given_name || userData.name || 'Guest');
        userEmail = userData.email;

        const usage = await getUserStorageUsage(userEmail);
        setStorageUsage(usage);
        
      } else {
        console.warn('User data or name not found in local storage. Redirecting to login.');
        await clearAuthToken();
        router.replace('/login');
        return;
      }
    } catch (error) {
      console.error('Error getting user data:', error);
      router.replace('/login');
      return;
    }

    setIsLoadingEnrolledCourses(true);

    try {
      const hasRealInternet = netInfo?.isInternetReachable === true;
      
      if (hasRealInternet) {
        const token = await getAuthToken();
        if (!token) {
          Alert.alert(
            "Session Expired",
            "You were logged in offline. Please log in again to sync your data.",
            [{ text: "OK", onPress: () => router.replace('/login') }]
          );
          setIsLoadingEnrolledCourses(false);
          return;
        }
        
        // await resetTimeCheckData(userEmail);
        
        try {
          const apiServerTime = await getServerTime();
          if (apiServerTime) {
            const currentDeviceTime = new Date().toISOString();
            await saveServerTime(userEmail, apiServerTime, currentDeviceTime);
            console.log('Server time synced and saved locally.');
          }
        } catch (timeError) {
          console.error('Failed to fetch or save server time:', timeError);
          console.log('Server time sync failed, falling back to offline mode...');
          
          // We can proceed to load cached courses
          const offlineCourses = await getEnrolledCoursesFromDb(userEmail);
          setEnrolledCourses(offlineCourses as EnrolledCourse[]);
          setIsLoadingEnrolledCourses(false);
          setIsRefreshing(false);
          return;
        }

        console.log('Online: Fetching courses from API.');
        const response = await api.get('/my-courses');
        const courses = response.data.courses || [];
        setEnrolledCourses(courses);

        // Save basic course info to local DB
        for (const course of courses) {
          try {
            await saveCourseToDb(course, userEmail);
          } catch (saveError) {
            console.error(' ❌ Failed to save basic course to DB:', saveError);
          }
        }
        console.log('Basic course info synced to local DB.');

        // Fetch and save complete course details including materials and assessments
        await fetchAndSaveCompleteCoursesData(courses, userEmail);

        // ✅ Enhanced: Auto-download assessment data with smart logic
        if (courses.length > 0) {
          setSyncStatus('Auto-syncing assessment data...');
          await autoDownloadAssessmentData(userEmail);
        }

      } else {
        console.log('⚠️ Offline or no internet reachability: Fetching courses from local DB.');
        const offlineCourses = await getEnrolledCoursesFromDb(userEmail);
        setEnrolledCourses(offlineCourses as EnrolledCourse[]);
      }
    } catch (error: any) {
      console.error('Error fetching enrolled courses:', error.response?.data || error.message);

      const hasRealInternet = netInfo?.isInternetReachable === true;
      if (hasRealInternet) {
        console.log('🔄 API failed, falling back to local DB...');
        try {
          const offlineCourses = await getEnrolledCoursesFromDb(userEmail);
          setEnrolledCourses(offlineCourses as EnrolledCourse[]);
        } catch (localError) {
          console.error('❌ Local DB fallback also failed:', localError);
          // Alert.alert('Error', 'Failed to load your enrolled courses.'); <--- REMOVED (Prevents Double Alert)
        }
      } else {
         // Keep offline specific alert if you want, or remove it too to be purely silent
         // Alert.alert('Error', 'Failed to load your enrolled courses from local storage.'); <--- REMOVED (Optional, cleaner UI)
      }
    } finally {
      setIsLoadingEnrolledCourses(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, [netInfo?.isInternetReachable, netInfo, isInitialized]);

  useEffect(() => {
    const hasRealInternet = netInfo?.isInternetReachable === true;
    
    if (!hasRealInternet || !isInitialized) return;

    const timeSyncInterval = setInterval(async () => {
      try {
        const userData = await getUserData();
        if (userData && userData.email) {
          await updateTimeSync(userData.email);
          
          const now = Date.now();
          
          const db = await getDb();
          const result = await db.getFirstAsync(
            `SELECT last_time_check FROM app_state WHERE user_email = ?;`,
            [userData.email]
          ) as any;
          
          const lastSync = result?.last_time_check;
          if (!lastSync || (now - lastSync) > 600000) {
            try {
              const apiServerTime = await getServerTime();
              if (apiServerTime) {
                await saveServerTime(userData.email, apiServerTime, new Date().toISOString());
              }
            } catch (timeError) {
              console.error('⚠️ Periodic server time sync failed:', timeError);
            }
          }
        }
      } catch (error) {
        console.error('❌ Periodic time sync error:', error);
      }
    }, 60000);

    return () => clearInterval(timeSyncInterval);
  }, [netInfo?.isInternetReachable, isInitialized]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setSyncStatus('Starting refresh...');

    if (!netInfo?.isInternetReachable) {
      Alert.alert(
        'Offline',
        'Please check your internet connection to refresh data.',
        [{ text: 'OK' }]
      );
      setIsRefreshing(false);
      setSyncStatus('');
      return;
    }

    try {

      try {
        console.log('🔄 Refreshing user profile data...');
        const latestProfile = await getProfile();
        
        if (latestProfile) {
          // Get existing data (to preserve fields not returned by profile endpoint, if any)
          const currentLocalData = await getUserData();
          
          // Merge and Save to SecureStore
          const updatedUserData = { ...currentLocalData, ...latestProfile };
          await storeUserData(updatedUserData);

          // Update the UI immediately
          setUserName(updatedUserData.given_name || updatedUserData.name || 'Guest');
          console.log('✅ Local user data updated successfully');
        }
      } catch (profileError) {
        console.warn('⚠️ Failed to update profile name during refresh:', profileError);
        // We continue execution so course loading isn't blocked by a profile error
      }
      
      const userData = await getUserData();

      if (userData) {
        setUserName(userData.given_name || userData.name || 'Guest');
      }
      
      if (!userData?.email) {
        Alert.alert('Error', 'User data not found. Please log in again.');
        setIsRefreshing(false);
        setSyncStatus('');
        return;
      }

      console.log('🔄 Starting enhanced refresh with incremental updates...');
      setSyncStatus('Fetching course updates...');
      
      let refreshSuccessful = false;
      try {
        // Use retry logic for API calls
        const response = await retryWithBackoff(async () => {
          setSyncStatus('Connecting to server...');
          return await api.get('/my-courses');
        }, 3, 1000);
        
        const courses = response.data.courses || [];
        
        // Check if course data has actually changed
        const hasChanges = JSON.stringify(courses) !== JSON.stringify(enrolledCourses);
        
        if (hasChanges) {
          setSyncStatus('Updating course data...');
          setEnrolledCourses(courses);
          
          // Chunked processing for better performance
          const chunkSize = 3;
          for (let i = 0; i < courses.length; i += chunkSize) {
            const chunk = courses.slice(i, i + chunkSize);
            setSyncStatus(`Saving courses ${i + 1}-${Math.min(i + chunkSize, courses.length)} of ${courses.length}`);
            
            await Promise.all(chunk.map(async (course) => {
              try {
                await saveCourseToDb(course, userData.email);
              } catch (saveError) {
                console.error('Failed to save course to DB:', saveError);
              }
            }));
            
            // Small delay to prevent overwhelming the system
            if (i + chunkSize < courses.length) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
          
          setSyncStatus('Updating course details...');
          await fetchAndSaveCompleteCoursesData(courses, userData.email);
        } else {
          setSyncStatus('No course changes detected');
        }
        
        // Force refresh assessment data
        setSyncStatus('Syncing assessment data...');
        const syncResult = await autoDownloadAssessmentData(userData.email, true);
        refreshSuccessful = syncResult.success;
        
        if (refreshSuccessful) {
          setSyncStatus('✅ Refresh completed successfully');
          console.log('✅ Enhanced refresh completed successfully');
        }
        
      } catch (downloadError) {
        console.warn('⚠️ Refresh failed, keeping existing offline data:', downloadError);
        setSyncStatus('⚠️ Refresh failed, using offline data');
        // Fallback to existing data
        try {
          await fetchCourses();
        } catch (fallbackError) {
          console.error('❌ Fallback fetch also failed:', fallbackError);
        }
      }

      const message = refreshSuccessful 
        ? 'Your course list has been updated successfully!' 
        : 'Refresh completed with some limitations. Offline data preserved.';
        
      Alert.alert('Refresh Complete', message, [{ text: 'OK' }]);

    } catch (error) {
      console.error('❌ Enhanced refresh failed:', error);
      setSyncStatus('❌ Refresh failed');
      Alert.alert('Error', 'Failed to refresh data. Please try again.');
    } finally {
      setIsRefreshing(false);
      // Clear status after delay
      setTimeout(() => setSyncStatus(''), 3000);
    }
  };

  const handleSearchPress = () => {
    setSearchModalVisible(true);
    setSearchResults([]);
    setSearchQuery('');
    setHasSearched(false);
  };

  const handleSearchSubmit = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    if (!netInfo?.isInternetReachable) {
      Alert.alert('Offline', 'You must be connected to the internet to search for courses.');
      return;
    }

    setIsLoadingSearch(true);
    setHasSearched(true);
    try {
      const response = await api.get(`/courses/search?query=${encodeURIComponent(searchQuery)}`);
      setSearchResults(response.data.courses || []);
      console.log('Search Results:', response.data.courses);
    } catch (error: any) {
      console.error('Error searching courses:', error);
      Alert.alert('Search Error', 'Failed to fetch search results. Please try again.');
      setSearchResults([]);
    } finally {
      setIsLoadingSearch(false);
    }
  };

  // NEW: Function to initiate enrollment process
  const startEnrollment = (course: Course) => {
    setCourseToEnroll(course);
    setEnrollmentCode('');
    setIsEnrollModalVisible(true);
  };
  
  const confirmEnrollment = async () => {
    if (!netInfo?.isInternetReachable) {
      Alert.alert('Offline', 'You must be connected to the internet to enroll in a course.');
      return;
    }

    if (!courseToEnroll || !enrollmentCode.trim()) {
      Alert.alert('Error', 'Enrollment key is required.');
      return;
    }
    
    setIsEnrolling(true);

    let userEmail = '';
    try {
      const userData = await getUserData();
      if (userData && userData.email) {
        userEmail = userData.email;
      } else {
        Alert.alert('Error', 'User data not found. Please log in again.');
        router.replace('/login');
        setIsEnrolling(false);
        return;
      }
    } catch (error) {
      console.error('❌ Error getting user data:', error);
      Alert.alert('Error', 'User data not found. Please log in again.');
      router.replace('/login');
      setIsEnrolling(false);
      return;
    }

    try {
      // Pass both course_id and course_code to the API
      const response = await api.post('/enroll', { 
        course_id: courseToEnroll.id, 
        course_code: enrollmentCode.trim() 
      });
      Alert.alert('Success', response.data.message || `Successfully enrolled in ${courseToEnroll.title}`);

      // --- REMOVED Redundant save logic ---
      // The logic below will handle all saving and downloading.

      setIsEnrollModalVisible(false);
      setSearchModalVisible(false);
      setSearchQuery('');
      setSearchResults([]);
      setHasSearched(false);

      const newCourse = response.data.course as EnrolledCourse;
      if (newCourse) {
        setEnrolledCourses(prevCourses => [newCourse, ...prevCourses]);
      }

      // 2. Surgically save and download data for *only* the new course
      try {
        setSyncStatus('Saving new course data...');
        // Save the basic course info
        await saveCourseToDb(newCourse, userEmail);

        // Fetch and save details for *just* the new course
        const detailResponse = await api.get(`/courses/${newCourse.id}`);
        if (detailResponse.status === 200) {
          await saveCourseDetailsToDb(detailResponse.data.course, userEmail);
        }

        setSyncStatus('Downloading assessment data...');
        // Manually trigger a download *only* for the new assessments
        // (This assumes you have a function to do this, or you can just run the full sync)
        
        // For simplicity, running the full sync with "force" is also fine here,
        // as your `autoDownloadAssessmentData` is smart and will only fetch what's missing.
        await autoDownloadAssessmentData(userEmail, true); 

        setSyncStatus('✅ Enrollment complete!');
      } catch (syncError) {
        console.error('Error syncing new course data:', syncError);
        setSyncStatus('⚠️ Error syncing new course.');
        // If this fails, just trigger a full refresh
        await handleRefresh();
      } finally {
        setIsLoadingEnrolledCourses(false);
        // Clear status after a delay
        setTimeout(() => setSyncStatus(''), 3000);
      }
    } catch (error: any) {
      console.error('Enrollment error:', error.response?.data || error.message);

      // --- 💡 THIS IS THE FIX 💡 ---
      // We read the specific message from the server's error response.
      // This will now show "You are already enrolled in this course."
      // or "Invalid enrollment key" correctly.
      const errorMessage = error.response?.data?.message || 'Invalid enrollment key or an unknown error occurred.';
      
      Alert.alert('Enrollment Failed', errorMessage);
      // --- END OF FIX ---
      
    } finally {
      setIsEnrolling(false);
    }
  };

  const renderCourseItem = ({ item }: { item: Course }) => (
    <View style={styles.courseResultCard}>
      <Text style={styles.courseResultTitle}>{item.title}</Text>
      <Text style={styles.courseResultCode}>Description: {item.description}</Text>
      <Text style={styles.courseResultDetails}>Program: {item.program?.name || 'N/A'}</Text>
      <Text style={styles.courseResultDetails}>Instructor: {item.instructor?.name || 'N/A'}</Text>

      <TouchableOpacity
        testID={`search-enroll-button-${item.id}`}
        style={[
          styles.enrollButton,
          !netInfo?.isInternetReachable && styles.disabledButton
        ]}
        onPress={() => startEnrollment(item)}
        disabled={!netInfo?.isInternetReachable}
      >
        <Text style={styles.enrollButtonText}>Enroll Course</Text>
      </TouchableOpacity>
    </View>
  );

  const renderEnrolledCourseCard = ({ item }: { item: EnrolledCourse }) => (
    <TouchableOpacity
      style={styles.enrolledCourseCard}
      onPress={() => {
        console.log('Viewing enrolled course:', item.title);
        router.navigate({
          pathname: '/courses',
          params: { courseId: item.id.toString() },
        });
      }}
      activeOpacity={0.7}
    >
      <View style={styles.enrolledCourseCardHeader}>
        <Ionicons name="book-outline" size={28} color="#1967d2" />
      </View>
      <View style={styles.enrolledCourseCardBody}>
        <Text style={styles.enrolledCourseCardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.enrolledCourseCardCode} numberOfLines={1}>{item.course_code}</Text>
        {item.pivot && (
          <View style={styles.statusBadge}>
            <Text style={styles.enrolledCourseCardStatus}>{item.pivot.status}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const scrollEnrolledCoursesRight = () => {
    if (enrolledCoursesFlatListRef.current) {
      enrolledCoursesFlatListRef.current.scrollToEnd({ animated: true });
    }
  };

  const scrollEnrolledCoursesLeft = () => {
    if (enrolledCoursesFlatListRef.current) {
      enrolledCoursesFlatListRef.current.scrollToOffset({ offset: 0, animated: true });
    }
  };

  const toggleAd = () => {
    setIsAdVisible(!isAdVisible);
  };

  const handleTutorialNext = () => {
    if (tutorialStep < tutorialSteps.length - 1) {
      Animated.timing(tutorialFadeAnim, {
        toValue: 0,
        duration: 150, // Fast fade out
        useNativeDriver: true,
      }).start(() => {
        setTutorialStep(prev => prev + 1);
        Animated.timing(tutorialFadeAnim, {
          toValue: 1,
          duration: 150, // Fast fade in
          useNativeDriver: true,
        }).start();
      });
    }
  };

  const handleTutorialPrev = () => {
    if (tutorialStep > 0) {
      Animated.timing(tutorialFadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setTutorialStep(prev => prev - 1);
        Animated.timing(tutorialFadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start();
      });
    }
  };

  const handleTutorialFinish = async () => {
    Animated.parallel([
      Animated.timing(tutorialFadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(tutorialScaleAnim, {
        toValue: 0.9,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start(async () => {
      setIsTutorialModalVisible(false);
      await setTutorialCompleted(); // Save that the user finished
    });
  };

  if (!isInitialized) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#1967d2" />
        <Text style={styles.loadingText}>Initializing...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#667eea"
            colors={['#667eea', '#764ba2']}
            enabled={netInfo?.isInternetReachable ?? false}
          />
        }
      >
        {/* LMS-Style Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.welcomeText}>Welcome</Text>
            <Text testID="dashboard-username" style={styles.userNameText}>{userName}</Text>
            <Text style={styles.subText}>Ready to continue your learning journey?</Text>

            {syncStatus && (
              <View style={styles.downloadIndicator}>
                <ActivityIndicator size="small" color="#1967d2" />
                <Text style={styles.downloadText}>{syncStatus}</Text>
              </View>
            )}

            {!netInfo?.isInternetReachable && (
              <TouchableOpacity 
                style={styles.offlineGuideButton} 
                onPress={() => showOfflineModeGuide()}
                activeOpacity={0.7}
              >
                <Ionicons name="information-circle" size={20} color="#1967d2" />
                <Text style={styles.offlineGuideButtonText}>View Offline Mode Guide</Text>
              </TouchableOpacity>
            )}

            {offlineStatus && !netInfo?.isInternetReachable && (
              <View style={styles.offlineTimerContainer}>
                <Text style={styles.offlineTimerText}>
                  Offline Time: {formatRemainingTime(offlineStatus.remainingHours)} left
                </Text>
                <View style={styles.progressBarBackground}>
                  <View
                    style={[
                      styles.progressBarForeground,
                      { width: `${(offlineStatus.remainingHours / offlineStatus.totalHours) * 100}%` },
                    ]}
                  />
                </View>
              </View>
            )}

          </View>
        </View>

        {/* LMS-Style Search Button */}
        <TouchableOpacity
          testID="discover-courses-button"
          style={[
            styles.searchButton,
            !netInfo?.isInternetReachable && styles.disabledButton
          ]}
          onPress={handleSearchPress}
          disabled={!netInfo?.isInternetReachable}
        >
          <Ionicons name="search" size={20} color="#fff" style={styles.searchIcon} />
          <Text style={styles.searchButtonText}>Discover new courses</Text>
        </TouchableOpacity>

        <View style={styles.statsSection}>
          
          {/* 1. Enrolled Courses Card */}
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <View style={[styles.iconBadge, { backgroundColor: '#e8f0fe' }]}>
                <Ionicons name="book" size={18} color="#1967d2" />
              </View>
              <Text style={styles.statTitle}>Courses</Text>
            </View>
            <Text style={styles.statMainValue}>{enrolledCourses.length}</Text>
            <Text style={styles.statSubtext}>Active enrollments</Text>
          </View>

          {/* 2. Redesigned Storage Card */}
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <View style={[styles.iconBadge, { backgroundColor: '#e6f4ea' }]}>
                <Ionicons name="server" size={18} color="#137333" />
              </View>
              <Text style={styles.statTitle}>Storage</Text>
            </View>
            
            <Text style={styles.statMainValue}>{storageUsage}</Text>
            
            {/* Visual Storage Bar */}
            <View style={styles.storageBarContainer}>
              <View 
                style={[
                  styles.storageBarFill, 
                  { 
                    // Dynamic width/color based on usage unit (Visual approximation)
                    width: storageUsage.includes('GB') ? '90%' : (storageUsage.includes('MB') ? '60%' : '15%'),
                    backgroundColor: storageUsage.includes('GB') ? '#d93025' : (storageUsage.includes('MB') ? '#f9ab00' : '#137333')
                  }
                ]} 
              />
            </View>
            <Text style={styles.statSubtext}>Used on device</Text>
          </View>
        </View>

        {/* LMS-Style Download Section */}
        <View style={styles.adContainer}>
          {isAdVisible && (
            <View style={styles.adContent}>
              <View style={styles.adButtonContainer}>
                {/* The Update Button */}
                <TouchableOpacity
                  style={[
                    styles.adButton,
                    isRefreshing && styles.adButtonDownloading, 
                    !netInfo?.isInternetReachable && styles.disabledButton,
                    styles.flex1
                  ]}
                  onPress={handleRefresh}
                  disabled={isRefreshing || !netInfo?.isInternetReachable} 
                >
                  {isRefreshing ? (
                    <View style={styles.downloadProgressContainer}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={styles.adButtonText}>Updating...</Text>
                    </View>
                  ) : (
                    <View style={styles.adButtonInnerContainer}>
                      <Ionicons name="sync-circle" size={20} color="#fff" />
                      <Text style={styles.adButtonText}>Update All</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
          <TouchableOpacity style={styles.adToggle} onPress={toggleAd}>
            <Ionicons
              name={isAdVisible ? 'chevron-up' : 'chevron-down'}
              size={24}
              color="#1967d2"
            />
          </TouchableOpacity>
        </View>

        {/* Enhanced Courses Section */}
        <View style={styles.coursesSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Courses</Text>
          </View>
          
          {isLoadingEnrolledCourses ? (
            <View style={styles.loadingCoursesContainer}>
              <ActivityIndicator size="large" color="#667eea" />
              <Text style={styles.loadingCoursesText}>Loading your courses...</Text>
            </View>
          ) : enrolledCourses.length > 0 ? (
            <FlatList
              ref={enrolledCoursesFlatListRef}
              data={enrolledCourses}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderEnrolledCourseCard}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalFlatListContent}
            />
          ) : (
            <View style={styles.noCoursesContainer}>
              <Ionicons name="school-outline" size={64} color="#ccc" />
              <Text style={styles.noCoursesText}>No courses enrolled yet</Text>
              <Text style={styles.noCoursesSubText}>
                {netInfo?.isInternetReachable
                  ? 'Search for courses above to get started!'
                  : 'Connect to the internet to enroll in new courses.'
                }
              </Text>
            </View>
          )}
        </View>

        <Modal
          animationType="slide"
          transparent={true}
          visible={isSearchModalVisible}
          onRequestClose={() => {
            setSearchModalVisible(false);
            setHasSearched(false);
            setSearchQuery('');
            setSearchResults([]);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <TouchableOpacity onPress={() => {
                setSearchModalVisible(false);
                setHasSearched(false);
                setSearchQuery('');
                setSearchResults([]);
              }} style={styles.closeButton}>
                <Ionicons name="close-circle-outline" size={30} color="#6c757d" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Search Courses</Text>
              <TextInput
                testID="search-modal-input"
                style={styles.searchInput}
                placeholder="Enter course title"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearchSubmit}
                returnKeyType="search"
                editable={netInfo?.isInternetReachable ?? false}
              />
              <TouchableOpacity
                testID="search-modal-button"
                style={[
                  styles.modalSearchButton,
                  !netInfo?.isInternetReachable && styles.disabledButton
                ]}
                onPress={handleSearchSubmit}
                disabled={isLoadingSearch || !netInfo?.isInternetReachable}
              >
                {isLoadingSearch ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSearchButtonText}>Search</Text>
                )}
              </TouchableOpacity>
              {!netInfo?.isInternetReachable && (
                <Text style={styles.offlineModalHint}>
                  You must be online to search for new courses.
                </Text>
              )}

              {/* Loading State */}
              {isLoadingSearch && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#667eea" />
                  <Text style={styles.loadingText}>Searching...</Text>
                </View>
              )}

              {/* Search Results - Only show after search is complete */}
              {!isLoadingSearch && hasSearched && (
                <View style={styles.searchResultsContainer}>
                  {searchResults.length > 0 ? (
                    <ScrollView style={{maxHeight: height * 0.45}} contentContainerStyle={styles.flatListContent}>
                      <Text style={styles.searchResultsTitle}>Matching Courses ({searchResults.length}):</Text>
                      {searchResults.map((item) => (
                        <View key={item.id.toString()}>{renderCourseItem({item})}</View>
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={styles.noResultsContainer}>
                      <Ionicons name="search-outline" size={48} color="#ccc" />
                      <Text style={styles.noResultsText}>No courses found for "{searchQuery}"</Text>
                      <Text style={[styles.noResultsText, { fontSize: 12, marginTop: 8 }]}>
                        Try searching with a different course title or code
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* NEW: Enrollment Confirmation Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={isEnrollModalVisible}
          onRequestClose={() => setIsEnrollModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.enrollmentModalContent}>
              <Text style={styles.modalTitle}>Confirm Enrollment</Text>
              {courseToEnroll && (
                <>
                  <Text style={styles.enrollmentText}>
                    To enroll in **{courseToEnroll.title}**, please enter the Enrollment Key.
                  </Text>
                </>
              )}
              <TextInput
                testID="enrollment-key-input"
                style={styles.searchInput}
                placeholder="Enter enrollment key"
                value={enrollmentCode}
                onChangeText={setEnrollmentCode}
                autoCapitalize="none"
              />
              <TouchableOpacity
                testID="confirm-enroll-button"
                style={[
                  styles.modalSearchButton,
                  isEnrolling && styles.disabledButton
                ]}
                onPress={confirmEnrollment}
                disabled={isEnrolling}
              >
                {isEnrolling ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSearchButtonText}>Confirm</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setIsEnrollModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent={true}
        visible={isTutorialModalVisible}
        onRequestClose={handleTutorialFinish} // Allow closing with back button
      >
        <View style={styles.tutorialModalOverlay}>
          <Animated.View style={[styles.tutorialModalContent, { opacity: tutorialFadeAnim }]}>
            <View style={styles.tutorialIconContainer}>
              {/* This renders an icon OR an image based on your config array */}
              {tutorialSteps[tutorialStep].icon ? (
                <Ionicons 
                  name={tutorialSteps[tutorialStep].icon as any} 
                  size={80} 
                  color="#1967d2" 
                />
              ) : (
                <Image 
                  source={tutorialSteps[tutorialStep].image} 
                  style={styles.tutorialImage} // <--- Using the updated style
                />
              )}
            </View>

            <Text style={styles.tutorialTitle}> 
              {tutorialSteps[tutorialStep].title}
            </Text>
            <Text style={styles.tutorialText}> 
              {tutorialSteps[tutorialStep].text}
            </Text>

            {/* Step Indicators */}
            <View style={styles.tutorialStepIndicatorContainer}>
              {tutorialSteps.map((_, index) => (
                <View 
                  key={index} 
                  style={[
                    styles.tutorialStepDot,
                    index === tutorialStep ? styles.tutorialStepDotActive : {}
                  ]} 
                />
              ))}
            </View>

            {/* Button Container */}
            <View style={styles.tutorialButtonContainer}>
              {tutorialStep > 0 && (
                <TouchableOpacity 
                  style={styles.tutorialButtonPrev} 
                  onPress={handleTutorialPrev}
                >
                  <Text style={styles.tutorialButtonPrevText}>Previous</Text>
                </TouchableOpacity>
              )}

              {tutorialStep < tutorialSteps.length - 1 ? (
                <TouchableOpacity 
                  style={styles.tutorialButtonNext} 
                  onPress={handleTutorialNext}
                >
                  <Text style={styles.tutorialButtonNextText}>Next</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  testID="tutorial-finish-button"
                  style={styles.tutorialButtonNext} 
                  onPress={handleTutorialFinish}
                >
                  <Text style={styles.tutorialButtonNextText}>Get Started!</Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        </View>
      </Modal>
      <Modal
        transparent={true}
        animationType="fade"
        visible={isSyncModalVisible}
        onRequestClose={() => {
          // Allow Android back button to minimize
          setSyncModalVisible(false);
        }} 
      >
        <View style={styles.modalOverlay}>
          <View style={styles.syncModalContent}>
            <ActivityIndicator size="large" color="#1967d2" />
            <Text style={styles.syncModalTitle}>Syncing Offline Work</Text>
            <Text style={styles.syncModalText}>
              {syncProgressValue >= 95 ? 'Finalizing submission...' : syncMessage}
            </Text>
            
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${syncProgressValue}%` }]} />
            </View>
            <Text style={styles.progressText}>{syncProgressValue}%</Text>
            
            <Text style={styles.syncWarningText}>Please do not close the app.</Text>

            {/* NEW: MINIMIZE BUTTON */}
            <TouchableOpacity 
              style={{ marginTop: 20, padding: 10 }}
              onPress={() => setSyncModalVisible(false)}
            >
              <Text style={{ color: '#5f6368', fontSize: 14, textDecorationLine: 'underline' }}>
                Hide and sync in background
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Responsive Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    alignItems: isTablet ? 'center' : 'stretch',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: isTablet ? 18 : 16,
    color: '#5f6368',
  },
  scrollView: {
    flex: 1,
    width: isTablet ? contentMaxWidth : '100%',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: isTablet ? 32 : 24,
    paddingHorizontal: isTablet ? 28 : 20,
    paddingBottom: isTablet ? 32 : 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    width: '100%',
  },
  headerContent: {
    gap: isTablet ? 12 : 8,
  },
  welcomeText: {
    fontSize: isTablet ? 22 : 18,
    color: '#5f6368',
  },
  userNameText: {
    fontSize: isTablet ? 26 : 20,
    fontWeight: '600',
    color: '#202124',
  },
  subText: {
    fontSize: isTablet ? 16 : 14,
    color: '#5f6368',
    marginTop: 4,
  },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: isTablet ? 16 : 12,
    paddingVertical: isTablet ? 8 : 6,
    backgroundColor: '#f1f3f4',
    borderRadius: 16,
    marginTop: isTablet ? 16 : 12,
  },
  offlineText: {
    fontSize: isTablet ? 14 : 12,
    color: '#5f6368',
    marginLeft: 6,
    fontWeight: '500',
  },
  offlineGuideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: isTablet ? 16 : 12,
    paddingVertical: isTablet ? 10 : 8,
    backgroundColor: '#e8f0fe',
    borderRadius: 8,
    marginTop: isTablet ? 16 : 12,
    borderWidth: 1,
    borderColor: '#1967d2',
  },
  offlineGuideButtonText: {
    fontSize: isTablet ? 15 : 13,
    color: '#1967d2',
    marginLeft: 6,
    fontWeight: '600',
  },
  offlineTimerContainer: {
    marginTop: isTablet ? 16 : 12,
    padding: isTablet ? 16 : 12,
    backgroundColor: '#fef7e0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fce8b2',
  },
  offlineTimerText: {
    fontSize: isTablet ? 15 : 13,
    color: '#b7791f',
    marginBottom: 8,
  },
  progressBarBackground: {
    height: isTablet ? 8 : 6,
    backgroundColor: '#fce8b2',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarForeground: {
    height: '100%',
    backgroundColor: '#e37400',
    borderRadius: 3,
  },
  downloadIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: isTablet ? 16 : 12,
    padding: isTablet ? 16 : 12,
    backgroundColor: '#e8f0fe',
    borderRadius: 8,
  },
  downloadText: {
    fontSize: isTablet ? 15 : 13,
    color: '#1967d2',
    marginLeft: 8,
  },
  searchButton: {
    marginHorizontal: isTablet ? 24 : 16,
    marginTop: isTablet ? 20 : 16,
    marginBottom: isTablet ? 12 : 8,
    backgroundColor: '#1967d2',
    borderRadius: isTablet ? 10 : 8,
    paddingVertical: isTablet ? 18 : 14,
    paddingHorizontal: isTablet ? 28 : 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchIcon: {
    marginRight: isTablet ? 10 : 8,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: isTablet ? 18 : 16,
    fontWeight: '500',
  },
  disabledButton: {
    opacity: 0.5,
    backgroundColor: '#dadce0',
  },
  statsSection: {
    flexDirection: 'row',
    paddingHorizontal: isTablet ? 24 : 16,
    paddingVertical: isTablet ? 20 : 16,
    gap: isTablet ? 16 : 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: isTablet ? 20 : 16,
    borderRadius: isTablet ? 14 : 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    justifyContent: 'space-between',
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: isTablet ? 16 : 12,
    gap: isTablet ? 10 : 8,
  },
  iconBadge: {
    width: isTablet ? 40 : 32,
    height: isTablet ? 40 : 32,
    borderRadius: isTablet ? 20 : 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statTitle: {
    fontSize: isTablet ? 16 : 14,
    fontWeight: '600',
    color: '#5f6368',
  },
  statMainValue: {
    fontSize: isTablet ? 28 : 24,
    fontWeight: '700',
    color: '#202124',
    marginBottom: isTablet ? 10 : 8,
  },
  statSubtext: {
    fontSize: isTablet ? 13 : 11,
    color: '#80868b',
  },
  
  // Storage Bar Styles
  storageBarContainer: {
    height: isTablet ? 8 : 6,
    backgroundColor: '#f1f3f4',
    borderRadius: 3,
    width: '100%',
    marginBottom: isTablet ? 8 : 6,
    overflow: 'hidden',
  },
  storageBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  adContainer: {
    marginHorizontal: isTablet ? 24 : 16,
    marginBottom: isTablet ? 20 : 16,
    backgroundColor: '#fff',
    borderRadius: isTablet ? 10 : 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  adContent: {
    padding: 12,
  },
  adButtonContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  adButton: {
    flex: 1,
    backgroundColor: '#137333',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adButtonDownloading: {
    backgroundColor: '#5f6368',
  },
  flex1: {
    flex: 1,
  },
  downloadProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adButtonInnerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  adToggle: {
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  coursesSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#202124',
  },
  loadingCoursesContainer: {
    padding: 32,
    alignItems: 'center',
  },
  loadingCoursesText: {
    marginTop: 16,
    fontSize: 14,
    color: '#5f6368',
  },
  horizontalFlatListContent: {
    paddingRight: 16,
  },
  enrolledCourseCard: {
    width: 200,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  enrolledCourseCardHeader: {
    height: 100,
    backgroundColor: '#1967d2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enrolledCourseCardBody: {
    padding: 12,
  },
  enrolledCourseCardTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#202124',
    marginBottom: 4,
    minHeight: 40,
  },
  enrolledCourseCardCode: {
    fontSize: 12,
    color: '#5f6368',
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8f0fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 4,
  },
  enrolledCourseCardStatus: {
    fontSize: 11,
    color: '#1967d2',
    fontWeight: '500',
  },
  noCoursesContainer: {
    padding: 48,
    alignItems: 'center',
  },
  noCoursesText: {
    fontSize: 18,
    fontWeight: '400',
    color: '#5f6368',
    marginTop: 16,
  },
  noCoursesSubText: {
    fontSize: 14,
    color: '#80868b',
    textAlign: 'center',
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: width * 0.9,
    maxHeight: height * 0.8,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#202124',
    marginBottom: 20,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#dadce0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#f8f9fa',
  },
  modalSearchButton: {
    backgroundColor: '#1967d2',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  modalSearchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  offlineModalHint: {
    fontSize: 13,
    color: '#d93025',
    textAlign: 'center',
    marginTop: 8,
  },
  searchResultsContainer: {
    marginTop: 16,
    minHeight: 100,
  },
  searchResultsTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#202124',
    marginBottom: 12,
  },
  flatListContent: {
    paddingBottom: 16,
  },
  courseResultCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  courseResultTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#202124',
    marginBottom: 8,
  },
  courseResultCode: {
    fontSize: 14,
    color: '#5f6368',
    marginBottom: 4,
  },
  courseResultDetails: {
    fontSize: 13,
    color: '#5f6368',
    marginTop: 4,
  },
  enrollButton: {
    backgroundColor: '#1967d2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  enrollButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  noResultsContainer: {
    padding: 32,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 14,
    color: '#5f6368',
    textAlign: 'center',
  },
  enrollmentModalContent: {
    width: width * 0.85,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  enrollmentText: {
    fontSize: 14,
    color: '#5f6368',
    marginBottom: 16,
    lineHeight: 20,
  },
  cancelButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: '#5f6368',
    fontSize: 14,
    fontWeight: '500',
  },
  tutorialModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  tutorialModalContent: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  tutorialIconContainer: {
    // Increased size to make the container larger for a larger image
    width: width * 0.7, 
    height: width * 0.7 * 0.7, // Maintain a specific aspect ratio (e.g., 70% of width, then adjust height)
    backgroundColor: '#e8f0fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderRadius: 12, // More squared corners for images
    overflow: 'hidden',
  },
  // 2. INCREASED IMAGE SIZE FOR TUTORIAL MODAL
  tutorialImage: {
    width: '100%', // Fills the container
    height: '100%', // Fills the container
    resizeMode: 'contain', // Ensure the image fits within the container while maintaining aspect ratio
  },
  // DECREASED TITLE AND TEXT SIZE
  tutorialTitle: {
    fontSize: 20, // Reduced from 22
    fontWeight: '600',
    color: '#202124',
    textAlign: 'center',
    marginBottom: 12, // Reduced margin
  },
  tutorialText: {
    fontSize: 14, // Reduced from 16
    color: '#5f6368',
    textAlign: 'center',
    marginBottom: 20, // Reduced margin
    lineHeight: 20, // Adjusted line height
    minHeight: 60, // Reduced minHeight to save space
  },
  tutorialStepIndicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 25,
  },
  tutorialStepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#dadce0',
    marginHorizontal: 4,
  },
  tutorialStepDotActive: {
    backgroundColor: '#1967d2',
    width: 12, // Make the active one slightly wider
  },
  tutorialButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  tutorialButtonPrev: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 5, // Space between buttons
  },
  tutorialButtonPrevText: {
    color: '#5f6368',
    fontSize: 16,
    fontWeight: '500',
  },
  tutorialButtonNext: {
    flex: 1,
    backgroundColor: '#1967d2',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginLeft: 5, // Space between buttons
  },
  tutorialButtonNextText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  syncModalContent: {
    width: width * 0.8,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    elevation: 10,
  },
  syncModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  syncModalText: {
    fontSize: 14,
    color: '#5f6368',
    marginBottom: 16,
    textAlign: 'center',
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#1967d2',
  },
  progressText: {
    fontSize: 12,
    color: '#1967d2',
    fontWeight: '600',
    marginBottom: 16,
  },
  syncWarningText: {
    fontSize: 12,
    color: '#d93025',
    fontStyle: 'italic',
  },
  onlineProgressContainer: {
    flexDirection: 'column',
    width: 200, // Fixed width for the bar
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storageTextSmall: {
    fontSize: 10,
    color: '#80868b',
    marginLeft: 4,
  },
  miniProgressBarBg: {
    height: 4,
    backgroundColor: '#e8f0fe',
    borderRadius: 2,
    marginTop: 6,
    width: '100%',
    overflow: 'hidden',
  },
  miniProgressBarFill: {
    height: '100%',
    backgroundColor: '#1967d2',
    borderRadius: 2,
  },
  fileWarningText: {
    fontSize: 10,
    color: '#d93025', // Use a reddish color to make it a clear "warning" or notice
    marginLeft: 22,   // Align with the text above (skipping the icon)
    marginTop: 2,
    fontWeight: '500',
    fontStyle: 'italic',
  },
});