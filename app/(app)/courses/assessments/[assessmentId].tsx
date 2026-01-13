// [assessmentId].tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as MediaLibrary from 'expo-media-library';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import UI components
import FileViewer, { detectFileType } from '../../../../components/FileViewer';
import { SubmittedFileCard } from '../../../../components/ui';

// Responsive design helper
const { width: screenWidth } = Dimensions.get('window');
const isTablet = screenWidth >= 768;
const isLargeTablet = screenWidth >= 1024;
const contentMaxWidth = isLargeTablet ? 900 : isTablet ? 700 : screenWidth;

import { usePendingSyncNotification } from '@/hooks/usePendingSyncNotification';
import { useNetworkStatus } from '../../../../context/NetworkContext';
import api, { getUserData } from '../../../../lib/api';
import {
    checkIfAssessmentNeedsDetails,
    deleteOfflineQuizAttempt,
    getAssessmentDetailsFromDb,
    getCompletedOfflineQuizzes,
    getCurrentServerTime,
    getOfflineAttemptCount,
    getOfflineQuizAttempt,
    getQuizQuestionsFromDb, // ADDED: Required for shuffling questions before start
    getUnsyncedSubmissions,
    hasAssessmentReviewSaved,
    saveAssessmentDetailsToDb,
    saveAssessmentReviewToDb,
    saveAssessmentsToDb,
    saveOfflineSubmission,
    startOfflineQuiz
} from '../../../../lib/localDb';

// File item in the files array (for assessments)
interface AssessmentFile {
  path: string;
  original_name: string;
  size: number;
  type: string;
  extension: string;
}

// Link item in the links array (for assessments)
interface AssessmentLink {
  url: string;
  title?: string;
}

// Interface definitions (These should match your existing definitions)
interface AssessmentDetail {
  id: number;
  course_id: number;
  topic_id?: number; // Made optional as per typical data structure
  title: string;
  type: 'quiz' | 'exam' | 'assignment' | 'project' | 'activity';
  description: string;
  assessment_file_path: string | null;
  duration_minutes: number | null;
  available_at: string | null;
  unavailable_at: string | null;
  created_by?: number; // Made optional
  max_attempts: number | null;
  total_points: number | null;
  assessment_file_url?: string;
  allow_answer_review: boolean;
  // Multiple files and links support
  files?: AssessmentFile[];
  links?: AssessmentLink[];
}

interface AttemptStatus {
  max_attempts: number | null;
  attempts_made: number;
  attempts_remaining: number | null;
  can_start_new_attempt: boolean;
  has_in_progress_attempt: boolean;
  in_progress_submitted_assessment_id: number | null;
}

// Interface for individual submitted file
interface SubmittedFileItem {
  path: string;
  name: string;
  size?: number;
  type?: string;
  url?: string;
}

interface LatestAssignmentSubmission {
  has_submitted_file: boolean;
  submitted_file_path: string | null;
  submitted_file_url: string | null;
  submitted_file_name: string | null;
  original_filename: string | null;
  submitted_at: string | null;
  status: string | null;
  submitted_files?: SubmittedFileItem[]; // New: Array of submitted files
}

// Helper to parse multiple filenames (may be JSON array or single string)
const parseFilenames = (filename: string | null): string[] => {
  if (!filename) return [];
  try {
    // Try to parse as JSON array
    const parsed = JSON.parse(filename);
    if (Array.isArray(parsed)) {
      return parsed.filter((f): f is string => typeof f === 'string' && f.length > 0);
    }
    return [filename];
  } catch {
    // Not JSON, return as single file
    return [filename];
  }
};

// Helper to parse multiple file URLs (may be JSON array or single string)  
const parseFileUrls = (url: string | null): string[] => {
  if (!url) return [];
  try {
    // Try to parse as JSON array
    const parsed = JSON.parse(url);
    if (Array.isArray(parsed)) {
      return parsed.filter((u): u is string => typeof u === 'string' && u.length > 0);
    }
    return [url];
  } catch {
    // Not JSON, return as single URL
    return [url];
  }
};

interface SubmittedAssessment {
  id: number; 
  score: number | null;
  status: string;
}

interface SubmittedQuestion {
  id: number;
  submitted_assessment_id?: number;
  question_id?: number;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'essay' | 'identification' | 'enumeration';
  max_points: number;
  submitted_answer: string | null;
  submitted_answers?: string[]; // For enumeration questions
  is_correct: boolean | null;
  score_earned: number | null;
  // Handle both snake_case and camelCase from Laravel API
  submitted_options?: any[];
  submittedOptions?: any[];
  original_question?: any;
  enumeration_answers?: string[];
  is_order_sensitive?: boolean;
}

const getMimeType = (filePath: string): string => {
  const extension = filePath.split('.').pop()?.toLowerCase();
  const mimeMap: { [key: string]: string } = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'xml': 'application/xml',
    'php': 'application/x-php',
    'py': 'text/x-python',
    'java': 'text/x-java-source',
    'c': 'text/x-c',
    'cpp': 'text/x-c++',
  };
  return mimeMap[extension || ''] || 'application/octet-stream';
};

const getFileType = (filePath: string) => {
  if (!filePath) return 'other';
  const extension = filePath.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension || '')) return 'image';
  if (['pdf'].includes(extension || '')) return 'pdf';
  if (['doc', 'docx', 'txt', 'rtf', 'odt', 'ppt', 'pptx', 'xls', 'xlsx'].includes(extension || '')) return 'document';
  return 'other';
};

const getFileIcon = (fileType: string) => {
  switch (fileType) {
    case 'image': return 'image';
    case 'pdf': return 'document-text';
    case 'document': return 'document';
    default: return 'attach';
  }
};

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Enhanced file icon by extension - more specific icons
const getFileIconByExtension = (extension: string): string => {
  const ext = extension?.toLowerCase() || '';
  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)) return 'image';
  // Documents
  if (['pdf'].includes(ext)) return 'document-text';
  if (['doc', 'docx'].includes(ext)) return 'document';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'grid';
  if (['ppt', 'pptx'].includes(ext)) return 'easel';
  if (['txt', 'rtf', 'odt'].includes(ext)) return 'reader';
  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return 'musical-notes';
  // Video
  if (['mp4', 'avi', 'mov', 'mkv', 'wmv', 'webm'].includes(ext)) return 'videocam';
  // Code
  if (['html', 'css', 'js', 'ts', 'json', 'xml', 'php', 'py', 'java', 'c', 'cpp'].includes(ext)) return 'code-slash';
  return 'document-attach';
};

// Get color by extension for more visual variety
const getFileColorByExtension = (extension: string): string => {
  const ext = extension?.toLowerCase() || '';
  // Images - Blue
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)) return '#4285f4';
  // PDF - Red
  if (['pdf'].includes(ext)) return '#ea4335';
  // Word docs - Blue
  if (['doc', 'docx'].includes(ext)) return '#4285f4';
  // Excel - Green
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '#34a853';
  // PowerPoint - Orange
  if (['ppt', 'pptx'].includes(ext)) return '#ff6d00';
  // Text - Gray
  if (['txt', 'rtf', 'odt'].includes(ext)) return '#5f6368';
  // Archives - Yellow
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '#fbbc05';
  // Audio - Purple
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return '#a855f7';
  // Video - Red
  if (['mp4', 'avi', 'mov', 'mkv', 'wmv', 'webm'].includes(ext)) return '#ef4444';
  // Code - Teal
  if (['html', 'css', 'js', 'ts', 'json', 'xml', 'php', 'py', 'java', 'c', 'cpp'].includes(ext)) return '#14b8a6';
  return '#6b7280';
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// --- UTILITY FUNCTION: Fisher-Yates shuffle algorithm ---
// NOTE: This utility needs to be here to shuffle questions before saving.
const shuffleArray = (array: SubmittedQuestion[]): SubmittedQuestion[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};
// --- END UTILITY FUNCTION ---


export default function AssessmentDetailsScreen() {
  const { id: courseId, assessmentId } = useLocalSearchParams();
  const router = useRouter();
  const { isConnected, netInfo } = useNetworkStatus();
  const [assessmentDetail, setAssessmentDetail] = useState<AssessmentDetail | null>(null);
  const [attemptStatus, setAttemptStatus] = useState<AttemptStatus | null>(null);
  const [latestAssignmentSubmission, setLatestAssignmentSubmission] = useState<LatestAssignmentSubmission | null>(null);
  const [submittedAssessment, setSubmittedAssessment] = useState<SubmittedAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasOfflineAttempt, setHasOfflineAttempt] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const [isStartingAttempt, setIsStartingAttempt] = useState(false); 
  const [hasDetailedData, setHasDetailedData] = useState<boolean>(false);
  const [hasOfflineAssignment, setHasOfflineAssignment] = useState<boolean>(false);
  const [isSubmissionModalVisible, setSubmissionModalVisible] = useState(false);
  const [submissionType, setSubmissionType] = useState<'file' | 'link' | null>(null);
  // Updated: Support multiple files
  const [selectedFiles, setSelectedFiles] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [submissionLink, setSubmissionLink] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [hasLocalReview, setHasLocalReview] = useState(false);
  const [downloadingReview, setDownloadingReview] = useState(false);
  // NEW: Delete/Remove submission modal
  const [isRemoveModalVisible, setRemoveModalVisible] = useState(false);
  const [isDeletingSubmission, setDeletingSubmission] = useState(false);
  const [selectedFilesToDelete, setSelectedFilesToDelete] = useState<Set<number>>(new Set());

  const navigation = useNavigation();

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadedFileUri, setDownloadedFileUri] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadDate, setDownloadDate] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for multiple downloaded files and in-app file viewer
  interface DownloadedFileInfo {
    uri: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    downloadDate: string;
    assessmentFileIndex?: number;
  }
  const [downloadedFiles, setDownloadedFiles] = useState<DownloadedFileInfo[]>([]);
  const [activeFileViewerUri, setActiveFileViewerUri] = useState<string | null>(null);
  const [activeFileViewerName, setActiveFileViewerName] = useState<string>('');
  const [showFileViewer, setShowFileViewer] = useState(false);
  const [currentDownloadingFileIndex, setCurrentDownloadingFileIndex] = useState<number | null>(null);

  usePendingSyncNotification(netInfo?.isInternetReachable ?? null, 'assessment-details');

  React.useEffect(() => {
    if (assessmentDetail?.assessment_file_path) {
      checkIfFileDownloaded(assessmentDetail);
    }
  }, [assessmentDetail]);

  // 5. Add Download & File Management Functions
  const checkIfFileDownloaded = async (assessment: AssessmentDetail) => {
    if (!assessment.assessment_file_path || !assessment.id) return;

    // Construct filename: Title_ID.ext
    const fileExtension = assessment.assessment_file_path.split('.').pop();
    const sanitizedTitle = assessment.title.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Assessment_${sanitizedTitle}_${assessment.id}.${fileExtension}`;
    const localUri = FileSystem.documentDirectory + fileName;

    try {
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists && 'size' in fileInfo && fileInfo.size > 0) {
        setDownloadedFileUri(localUri);
        setFileSize(formatBytes(fileInfo.size));
        // Safely handle modificationTime which may be undefined
        const modTime = 'modificationTime' in fileInfo && fileInfo.modificationTime 
          ? new Date(fileInfo.modificationTime * 1000).toLocaleDateString()
          : 'Recently';
        setDownloadDate(modTime);
      }
    } catch (error) {
      console.log('Error checking downloaded file:', error);
    }
  };

  // Handle opening a file from the multiple files list
  const handleOpenFileFromList = async (file: AssessmentFile, fileIndex: number) => {
    if (!netInfo?.isInternetReachable) {
      Alert.alert('Offline Mode', 'Internet connection required to download this file.');
      return;
    }

    // Check if file is already downloaded
    const existingDownload = downloadedFiles.find(d => d.assessmentFileIndex === fileIndex);
    if (existingDownload) {
      // Open in FileViewer
      setActiveFileViewerUri(existingDownload.uri);
      setActiveFileViewerName(existingDownload.fileName);
      setShowFileViewer(true);
      return;
    }

    // Download the file first
    setCurrentDownloadingFileIndex(fileIndex);
    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      const downloadUrl = `${api.defaults.baseURL}/assessments/${assessmentDetail?.id}/file/${fileIndex}`;
      const fileExtension = file.extension;
      const sanitizedName = file.original_name.replace(/[^a-zA-Z0-9.]/g, '_');
      const fileName = `${sanitizedName}_${assessmentDetail?.id}_${fileIndex}${fileExtension ? `.${fileExtension}` : ''}`;
      const localUri = FileSystem.documentDirectory + fileName;

      console.log('Downloading assessment file from list:', downloadUrl);

      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        localUri,
        {}, // May need auth headers if protected
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            const progress = totalBytesWritten / totalBytesExpectedToWrite;
            setDownloadProgress(Math.round(progress * 100));
          }
        }
      );

      const result = await downloadResumable.downloadAsync();

      if (result?.uri) {
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        
        if (fileInfo.exists && 'size' in fileInfo && fileInfo.size > 0) {
          // Add to downloaded files list
          const newDownloadedFile: DownloadedFileInfo = {
            uri: result.uri,
            fileName: file.original_name,
            fileSize: fileInfo.size,
            fileType: detectFileType(file.original_name) || 'other',
            downloadDate: new Date().toLocaleDateString(),
            assessmentFileIndex: fileIndex,
          };
          
          setDownloadedFiles(prev => [...prev, newDownloadedFile]);
          
          console.log('File downloaded successfully:', result.uri);
          
          // Open in FileViewer
          setTimeout(() => {
            setActiveFileViewerUri(result.uri);
            setActiveFileViewerName(file.original_name);
            setShowFileViewer(true);
          }, 500);
        } else {
          throw new Error('Downloaded file is corrupted or empty.');
        }
      } else {
        throw new Error('Download failed - no result URI.');
      }
    } catch (error: any) {
      console.error('Error downloading assessment file from list:', error);
      Alert.alert('Download Failed', error?.message || 'Failed to download file. Please try again.');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setCurrentDownloadingFileIndex(null);
    }
  };

  const promptDownloadOptions = () => {
    if (!netInfo?.isInternetReachable) {
      Alert.alert('Offline Mode', 'File downloading requires an internet connection.');
      return;
    }

    Alert.alert(
      'Download Assessment File',
      'Choose where you want to save the instructions file:',
      [
        { text: 'Download in the app', onPress: downloadToAppStorage },
        { text: 'Download in device', onPress: downloadToDeviceExternal },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const downloadToAppStorage = async () => {
    if (!assessmentDetail?.assessment_file_url || !assessmentDetail?.id) {
      console.log('Download cancelled: Missing assessment_file_url or id');
      return;
    }
    if (downloadedFileUri) {
      console.log('Download cancelled: File already downloaded');
      return;
    }

    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      // Use the assessment_file_path to determine extension
      const fileExtension = assessmentDetail.assessment_file_path?.split('.').pop() || 'pdf';
      const sanitizedTitle = assessmentDetail.title.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `Assessment_${sanitizedTitle}_${assessmentDetail.id}.${fileExtension}`;
      const localUri = FileSystem.documentDirectory + fileName;

      console.log('Starting download to:', localUri);

      const downloadResumable = FileSystem.createDownloadResumable(
        assessmentDetail.assessment_file_url,
        localUri,
        {}, // Headers (if needed)
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            const progress = totalBytesWritten / totalBytesExpectedToWrite;
            setDownloadProgress(Math.round(progress * 100));
          }
        }
      );

      const result = await downloadResumable.downloadAsync();

      if (result?.uri) {
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        if (fileInfo.exists && 'size' in fileInfo && fileInfo.size > 0) {
          setDownloadedFileUri(result.uri);
          setFileSize(formatBytes(fileInfo.size));
          // Safely handle modificationTime which may be undefined
          const modTime = 'modificationTime' in fileInfo && fileInfo.modificationTime 
            ? new Date(fileInfo.modificationTime * 1000).toLocaleDateString()
            : new Date().toLocaleDateString();
          setDownloadDate(modTime);
          console.log('Download complete:', result.uri);
          Alert.alert('Download Complete!', 'Instructions available for offline viewing.');
        } else {
          throw new Error('Downloaded file is corrupted or empty.');
        }
      } else {
        throw new Error('Download failed - no result URI.');
      }
    } catch (err: any) {
      console.error('Download error:', err);
      Alert.alert(
        'Download Failed', 
        err?.message || 'Could not download the file. Please try again.'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadToDeviceExternal = async () => {
    if (!assessmentDetail?.assessment_file_url) {
      console.log('Save to Device cancelled: Missing assessment_file_url');
      return;
    }
    
    // Show progress
    setIsDownloading(true);
    setDownloadProgress(0);

    // Prep File Details
    const fileExtension = assessmentDetail.assessment_file_path?.split('.').pop() || 'pdf';
    const sanitizedTitle = assessmentDetail.title.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Assessment_${sanitizedTitle}_${assessmentDetail.id}.${fileExtension}`;
    
    try {
      // Request storage permission (for Android)
      if (Platform.OS === 'android') {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          setIsDownloading(false);
          Alert.alert('Permission Required', 'Storage permission is needed to save files to your device.');
          return;
        }
      }

      // Download to cache first
      const tempUri = FileSystem.cacheDirectory + fileName;
      console.log('Downloading to temp file:', tempUri);

      const downloadResumable = FileSystem.createDownloadResumable(
        assessmentDetail.assessment_file_url,
        tempUri,
        {},
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            const progress = totalBytesWritten / totalBytesExpectedToWrite;
            setDownloadProgress(Math.round(progress * 100));
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result || result.status !== 200) {
        throw new Error('Download failed, server returned status ' + result?.status);
      }

      console.log('Temp download complete:', result.uri);

      // Save to device's Downloads folder using MediaLibrary
      const asset = await MediaLibrary.createAssetAsync(result.uri);
      
      // Clean up the temp file
      await FileSystem.deleteAsync(tempUri, { idempotent: true });

      console.log('File saved to device:', asset.uri);
      Alert.alert(
        'Download Complete', 
        `"${assessmentDetail.title}" has been saved to your device's Downloads folder.`
      );

    } catch (err: any) {
      console.error('Failed to download or save file:', err);
      Alert.alert(
        'Download Failed', 
        err?.message || 'Could not save the file. Please try again.'
      );
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleOpenFile = async () => {
    if (!downloadedFileUri) return;

    if (Platform.OS === 'android') {
      try {
        const contentUri = await FileSystem.getContentUriAsync(downloadedFileUri);
        const mimeType = getMimeType(downloadedFileUri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1,
          type: mimeType,
        });
      } catch (e) {
        Alert.alert('Error', 'No app found to open this file.');
      }
    } else {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloadedFileUri);
      }
    }
  };

  const handleDeleteDownload = async () => {
    if (!downloadedFileUri) return;
    Alert.alert('Remove Download', 'Delete this file from the app?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setIsDeleting(true);
          try {
            await FileSystem.deleteAsync(downloadedFileUri);
            setDownloadedFileUri(null);
          } catch (e) {
            Alert.alert('Error', 'Could not delete file.');
          } finally {
            setIsDeleting(false);
          }
        }
      }
    ]);
  };
  
  const fetchAssessmentDetailsAndAttemptStatus = useCallback(async () => {
    if (!assessmentId) return;

    if (!assessmentDetail) {
      setLoading(true);
    }
    setError(null);

    const user = await getUserData();
    const userEmail = user?.email;
    if (!userEmail) {
      setError('User not logged in.');
      setLoading(false);
      return;
    }

    try {
      // Check for pending offline assignment submissions first
      const unsyncedSubmissions = await getUnsyncedSubmissions(userEmail);
      const pendingOfflineAssignment = unsyncedSubmissions.find(
        (sub: any) => sub.assessment_id === parseInt(assessmentId as string)
      );
      setHasOfflineAssignment(!!pendingOfflineAssignment);

      if (netInfo?.isInternetReachable) {
        // ============================================================
        // 🌐 ONLINE MODE
        // ============================================================
        console.log('✅ Online: Fetching all assessment data from API.');

        const assessmentResponse = await api.get(`/assessments/${assessmentId}`);
        if (assessmentResponse.status !== 200) throw new Error('Failed to fetch assessment details.');

        const fetchedAssessment = assessmentResponse.data.assessment;
        setAssessmentDetail(fetchedAssessment);

        let newAttemptStatus: AttemptStatus | null = null;
        let newLatestSubmission: LatestAssignmentSubmission | null = null;
        let fetchedSubmittedAssessment: SubmittedAssessment | null = null;

        // 1. Get Submission Status (Completed/Graded/In-Progress)
        try {
          const submittedAssessmentResponse = await api.get(`/assessments/${assessmentId}/submitted-assessment`);
          if (submittedAssessmentResponse.status === 200) {
            fetchedSubmittedAssessment = submittedAssessmentResponse.data.submitted_assessment;
            setSubmittedAssessment(fetchedSubmittedAssessment);
          }
        } catch (error: any) {
          if (error.response?.status === 404) {
            setSubmittedAssessment({ id: 0, score: null, status: 'not_started' });
          } else {
            console.error('Failed to fetch submission summary:', error);
          }
        }

        // 2. Get Attempt Status (for Quizzes/Exams)
        if (fetchedAssessment.type === 'quiz' || fetchedAssessment.type === 'exam') {
          const attemptStatusResponse = await api.get(`/assessments/${assessmentId}/attempt-status`);
          if (attemptStatusResponse.status === 200) {
            newAttemptStatus = attemptStatusResponse.data;
            
            // Adjust attempts count if there's a completed offline quiz waiting to sync
            if (newAttemptStatus) {
              const completedOfflineQuizzes = await getCompletedOfflineQuizzes(userEmail);
              const pendingOfflineQuiz = completedOfflineQuizzes.find(
                (q: any) => q.assessment_id === parseInt(assessmentId as string)
              );
              
              if (pendingOfflineQuiz) {
                const localAttemptCount = await getOfflineAttemptCount(parseInt(assessmentId as string), userEmail);
                console.log(`⚠️ Found pending offline quiz. Server attempts: ${newAttemptStatus.attempts_made}, Local attempts: ${localAttemptCount.attempts_made}`);
                
                newAttemptStatus.attempts_made = Math.max(newAttemptStatus.attempts_made, localAttemptCount.attempts_made);
                
                if (newAttemptStatus.max_attempts !== null) {
                  newAttemptStatus.attempts_remaining = Math.max(0, newAttemptStatus.max_attempts - newAttemptStatus.attempts_made);
                }
              }
            }
            setAttemptStatus(newAttemptStatus);
          }
        } 
        // 3. Get Latest Submission (for Assignments)
        else if (['assignment', 'activity', 'project'].includes(fetchedAssessment.type)) {
          const assignmentSubmissionResponse = await api.get(`/assessments/${assessmentId}/latest-assignment-submission`);
          if (assignmentSubmissionResponse.status === 200) {
            newLatestSubmission = assignmentSubmissionResponse.data;
            setLatestAssignmentSubmission(newLatestSubmission);
          }
        }

        // 4. Save Everything to Local DB (for future offline use)
        const validCourseId = courseId ? (typeof courseId === 'string' ? parseInt(courseId, 10) : Number(courseId)) : fetchedAssessment.course_id;
        await saveAssessmentsToDb([fetchedAssessment], validCourseId, userEmail);
        await saveAssessmentDetailsToDb(fetchedAssessment.id, userEmail, newAttemptStatus, newLatestSubmission);

        const needsDetails = await checkIfAssessmentNeedsDetails(fetchedAssessment.id, userEmail);
        setHasDetailedData(!needsDetails);

        // ------------------------------------------------------------------
        // 🚨 CLEANUP LOGIC: Handle Stale Local Attempts 🚨
        // ------------------------------------------------------------------
        // If the server says the assessment is 'completed' or 'graded', but we still have an 
        // 'in_progress' attempt saved locally (from a previous session or device switch),
        // we must DELETE the local attempt so the "Resume" button disappears.
        if (fetchedSubmittedAssessment && (fetchedSubmittedAssessment.status === 'completed' || fetchedSubmittedAssessment.status === 'graded')) {
            console.log("🧹 Assessment completed on server. Checking for stale local data...");
            const staleAttempt = await getOfflineQuizAttempt(parseInt(assessmentId as string), userEmail);
            
            if (staleAttempt) {
                console.log("🗑️ Deleting stale local attempt to prevent false resume.");
                await deleteOfflineQuizAttempt(parseInt(assessmentId as string), userEmail);
            }
            setHasOfflineAttempt(false);
        } else {
            // Otherwise, check normally if we have a valid offline attempt to resume
            const offlineAttempt = await getOfflineQuizAttempt(parseInt(assessmentId as string), userEmail);
            setHasOfflineAttempt(!!offlineAttempt);
        }
        // ------------------------------------------------------------------

      } else {
        // ============================================================
        // 📵 OFFLINE MODE
        // ============================================================
        console.log('⚠️ Offline: Fetching assessment details from local DB.');
        const offlineAssessment = await getAssessmentDetailsFromDb(assessmentId as string, userEmail);
        const offlineAttempt = await getOfflineQuizAttempt(parseInt(assessmentId as string), userEmail);

        if (offlineAssessment) {
          const offlineAttemptCount = await getOfflineAttemptCount(parseInt(assessmentId as string), userEmail);
          
          const updatedAttemptStatus = {
            ...offlineAssessment.attemptStatus,
            attempts_made: offlineAttemptCount.attempts_made,
            attempts_remaining: offlineAttemptCount.attempts_remaining,
            has_in_progress_attempt: !!offlineAttempt,
            can_start_new_attempt: offlineAttemptCount.attempts_remaining === null || offlineAttemptCount.attempts_remaining > 0,
          };
          
          setAssessmentDetail(offlineAssessment);
          setAttemptStatus(updatedAttemptStatus);
          setHasDetailedData(true);
          setHasOfflineAttempt(!!offlineAttempt);

          // If there is a pending assignment submission waiting to sync, show it as the status
          if (pendingOfflineAssignment) {
            console.log('✅ Offline: Found pending assignment submission. Displaying it.');
            setLatestAssignmentSubmission({
              has_submitted_file: true,
              submitted_file_path: pendingOfflineAssignment.file_uri,
              submitted_file_url: null,
              submitted_file_name: pendingOfflineAssignment.original_filename,
              original_filename: pendingOfflineAssignment.original_filename,
              submitted_at: pendingOfflineAssignment.submitted_at,
              status: 'to sync',
            });
          } else {
            setLatestAssignmentSubmission(offlineAssessment.latestSubmission);
          }

        } else {
          setError('Assessment details not available offline.');
          setHasDetailedData(false);
        }
      }

      // Check for saved review data (for "View Answers" button)
      const localReviewExists = await hasAssessmentReviewSaved(parseInt(assessmentId as string), userEmail);
      setHasLocalReview(localReviewExists);

    } catch (err: any) {
      console.error('Failed to fetch details:', err.response?.data || err.message);
      setError('Network error or unable to load assessment details.');
    } finally {
      setLoading(false);
    }
  }, [assessmentId, courseId, netInfo?.isInternetReachable]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return 'checkmark-circle';
      case 'graded':
        return 'checkmark-done-circle';
      case 'in_progress':
        return 'time';
      case 'submitted':
        return 'cloud-done';
      default:
        return 'help-circle';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#27ae60';
      case 'graded':
        return '#2ecc71';
      case 'in_progress':
        return '#f39c12';
      case 'submitted':
        return '#3498db';
      default:
        return '#7f8c8d';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'graded':
        return 'Graded';
      case 'in_progress':
        return 'In Progress';
      case 'submitted':
        return 'Submitted';
      case 'not_started':
        return 'Not yet taken';
      default:
        return 'Unknown';
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchAssessmentDetailsAndAttemptStatus();
    }, [fetchAssessmentDetailsAndAttemptStatus])
  );

  // useEffect(() => {
  //   const syncSubmissions = async () => {
  //     if (netInfo?.isInternetReachable) {
  //       console.log('Network is back online. Checking for unsynced submissions...');
  //       const user = await getUserData();
  //       if (!user || !user.email) return;

  //       const unsyncedSubmissions = await getUnsyncedSubmissions(user.email);
  //       if (unsyncedSubmissions.length > 0) {
  //         Alert.alert('Synchronization', `Found ${unsyncedSubmissions.length} offline submission(s) to sync.`, [{ text: 'OK' }]);

  //         for (const submission of unsyncedSubmissions) {
  //           const success = await syncOfflineSubmission(
  //             submission.assessment_id,
  //             submission.file_uri,
  //             submission.original_filename,
  //             submission.submitted_at
  //           );

  //           if (success) {
  //             await deleteOfflineSubmission(submission.id);
  //           }
  //         }

  //         fetchAssessmentDetailsAndAttemptStatus();
  //       }
  //     }
  //   };

  //   syncSubmissions();
  // }, [netInfo?.isInternetReachable]);

  const isAssessmentOpen = (assessment: AssessmentDetail) => {
    const now = new Date().getTime();
    if (assessment.available_at && now < new Date(assessment.available_at).getTime()) return false;
    if (assessment.unavailable_at && now > new Date(assessment.unavailable_at).getTime()) return false;
    return true;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    
    // Create the date object from the string.
    const date = new Date(dateString);
    
    // --- THIS LINE IS NOW REMOVED ---
    // date.setHours(date.getHours() + 8);
    
    // Format the date in the user's local timezone
    return date.toLocaleDateString(undefined, options);
  };
  
  const formatUTCDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    
    // Create the date object from the string
    const date = new Date(dateString);
    
    // Manually add 8 hours
    date.setHours(date.getHours() + 8);
    
    // Format the newly adjusted date
    return date.toLocaleDateString(undefined, options);
  };

  // Updated: Support multiple file selection
  const handlePickDocument = async (addMore = false) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true, // Enable multiple file selection
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newFiles = result.assets;
        
        // Calculate total size including existing files
        const existingSize = selectedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
        const newFilesSize = newFiles.reduce((sum, f) => sum + (f.size || 0), 0);
        const totalSize = existingSize + newFilesSize;
        
        if (totalSize > MAX_FILE_SIZE) {
          Alert.alert(
            'Total Size Exceeded', 
            `The total size of all files exceeds 50MB.\n\nCurrent: ${formatBytes(existingSize)}\nNew files: ${formatBytes(newFilesSize)}\nLimit: 50MB`,
            [{ text: 'OK' }]
          );
          return;
        }
        
        // Check individual file sizes
        const oversizedFile = newFiles.find(f => f.size && f.size > MAX_FILE_SIZE);
        if (oversizedFile) {
          Alert.alert('File Too Large', `"${oversizedFile.name}" exceeds the 50MB limit.`);
          return;
        }
        
        if (addMore) {
          setSelectedFiles(prev => [...prev, ...newFiles]);
        } else {
          setSelectedFiles(newFiles);
        }
        setSubmissionLink('');
        setSubmissionType('file');
      }
    } catch (err) {
      console.error('Document picking error:', err);
      Alert.alert('Error', 'Failed to pick document.');
    }
  };

  // NEW: Remove a specific file from the selection
  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) {
        setSubmissionType(null);
      }
      return updated;
    });
  };

  // NEW: Calculate total file size
  const getTotalFileSize = () => {
    return selectedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
  };

  // NEW: Delete submission handler
  const handleDeleteSubmission = async () => {
    if (!assessmentDetail || !netInfo?.isInternetReachable) {
      Alert.alert('Offline', 'You must be online to delete a submission.');
      return;
    }

    Alert.alert(
      'Delete Submission',
      'Are you sure you want to delete your submission? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingSubmission(true);
            try {
              const response = await api.delete(`/assessments/${assessmentDetail.id}/delete-submission`);
              if (response.status === 200) {
                Alert.alert('Success', 'Your submission has been deleted.');
                setLatestAssignmentSubmission(null);
                setRemoveModalVisible(false);
                await fetchAssessmentDetailsAndAttemptStatus();
              } else {
                Alert.alert('Error', response.data?.message || 'Failed to delete submission.');
              }
            } catch (err: any) {
              console.error('Delete submission error:', err);
              Alert.alert('Error', err.response?.data?.message || 'Failed to delete submission.');
            } finally {
              setDeletingSubmission(false);
            }
          },
        },
      ]
    );
  };

  const handleDownloadSubmittedFile = async (fileUrl: string) => {
    try {
      await Linking.openURL(fileUrl);
    } catch (error) {
      Alert.alert('NOTE', 'The submitted file cannot be downloaded.');
    }
  };

  const handleDownloadAssessmentFile = async (fileUrl: string) => {
    try {
      await Linking.openURL(fileUrl);
    } catch (error) {
      Alert.alert('Error', 'Could not open the assessment file.');
    }
  };


  const handleStartQuizAttempt = async () => {
    if (!assessmentDetail) return;

    setIsStartingAttempt(true); 

    const user = await getUserData();
    const userEmail = user?.email;
    const assessmentType = assessmentDetail.type || 'assessment';
    const assessmentTypeCapitalized = assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1);

    if (!userEmail) {
      Alert.alert('Error', `User not found. Cannot start ${assessmentType}.`);
      setIsStartingAttempt(false);
      return;
    }

    Alert.alert(
      'Important Notice',
      `Please read carefully:\n\n` +
        `1. You must complete the ${assessmentType} in one session.\n` +
        `2. Do not leave or close the page before submitting.\n` +
        `3. Make sure you have enough time (${assessmentDetail.duration_minutes} minutes).\n\n` +
        `Are you ready to start?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setIsStartingAttempt(false) },
        {
          text: `Start ${assessmentTypeCapitalized}`,
          onPress: async () => {
            try {
              // 1. Fetch questions to get the list for shuffling
              const rawQuestions = await getQuizQuestionsFromDb(assessmentDetail.id, userEmail);
              
              // 2. Generate a new shuffled order of question objects
              const shuffledQuestionObjects = shuffleArray(rawQuestions as SubmittedQuestion[]); 
              
              // 3. Extract the ID array for persistent storage
              const shuffledOrderIds = shuffledQuestionObjects.map(q => q.id);
              
              let submittedAssessmentId: number | undefined = undefined;

              // If ONLINE, notify server immediately to create the 'in_progress' record
              if (netInfo?.isInternetReachable) {
                try {
                  console.log('🌐 Online: Starting attempt on server...');
                  
                  // 🚨 FIX: Changed '/start' to '/start-quiz-attempt' to match your api.php
                  const response = await api.post(`/assessments/${assessmentDetail.id}/start-quiz-attempt`);
                  
                  if (response.status === 201 || response.status === 200) {
                    // Capture ONLY the ID for security binding
                    submittedAssessmentId = response.data.submitted_assessment.id;
                    console.log('✅ Server attempt ID:', submittedAssessmentId);
                  }
                } catch (serverError: any) {
                  // Now this should only happen if the server is actually down, not because of a typo
                  console.error('⚠️ Failed to start attempt on server:', serverError.message);
                }
              }

              // 4. Save the new attempt locally 
              await startOfflineQuiz(
                assessmentDetail.id, 
                userEmail, 
                shuffledOrderIds, 
                submittedAssessmentId // Passing the ID ensures the submission will be valid later
              );
              
              Alert.alert(`${assessmentTypeCapitalized} Started`, `Good luck!`, [
                {
                  text: 'OK',
                  onPress: () =>
                    router.replace({
                      pathname: '/courses/assessments/[assessmentId]/attempt-quiz',
                      params: { assessmentId: assessmentDetail.id.toString(), userEmail, isOffline: 'true' },
                    }),
                },
              ]);
            } catch (error) {
              console.error('Error starting attempt locally:', error);
              Alert.alert('Error', `Failed to start attempt locally.`);
            } finally {
              setIsStartingAttempt(false);
            }
          },
        },
      ]
    );
  };

  const handleDownloadReviewData = async () => {
    if (!netInfo?.isInternetReachable) {
      Alert.alert('Offline', 'You must be online to download review data.');
      return;
    }
    if (!assessmentDetail) {
      Alert.alert('Error', 'Assessment details not loaded yet.');
      return;
    }

    setDownloadingReview(true);
    let userEmail: string | undefined;

    try {
      const user = await getUserData();
      userEmail = user?.email;
      if (!userEmail) {
        throw new Error('User not found');
      }

      console.log(`📊 Fetching latest completed submission details for assessment ${assessmentDetail.id}...`);

      const reviewResponse = await api.get(`/assessments/${assessmentDetail.id}/latest-completed-submission`);

      if (reviewResponse.status === 200 && reviewResponse.data.submitted_assessment) {
        const reviewData = reviewResponse.data.submitted_assessment;

        if (!reviewData.submitted_questions) {
            throw new Error('Your answer data received from server is incomplete (missing questions).');
        }

        console.log(`✅ Answer data fetched: ${reviewData.submitted_questions.length} questions`);

        await saveAssessmentReviewToDb(assessmentDetail.id, userEmail, reviewData);
        console.log(`💾 Answer data saved to offline_assessment_reviews table`);

        setHasLocalReview(true);

        Alert.alert(
          'Success',
          'Your answer data is downloaded successfully! You can now view your answers even when offline.',
          [{ text: 'OK' }]
        );

        try {
            const attemptResponse = await api.get(`/assessments/${assessmentDetail.id}/attempt-status`);
            if (attemptResponse.status === 200) {
                await saveAssessmentDetailsToDb(assessmentDetail.id, userEmail, attemptResponse.data, latestAssignmentSubmission);
                setAttemptStatus(attemptResponse.data); 
            }
        } catch(attemptError){
            console.warn("Could not refresh attempt status after download, but review saved.");
        }

      } else {
        throw new Error('Failed to fetch review data from the server (unexpected response).');
      }
    } catch (error: any) {
      console.error('❌ Error downloading review data:', error);

      let alertMessage = 'Could not download the review data. Please try again.'; 

      if (error.response?.status === 404) {
        alertMessage = error.response.data?.message || 'No completed submission was found for this assessment.';
        Alert.alert('Not Found', alertMessage);
      } else if (error.message?.includes('incomplete')) {
        alertMessage = 'The review data from the server seems incomplete. Please contact support.';
        Alert.alert('Data Error', alertMessage);
      } else if (error.response) {
        const status = error.response.status;
        const backendMessage = error.response.data?.message;
        alertMessage = `Server error (${status}): ${backendMessage || 'Please try again later.'}`;
        Alert.alert('Download Error', alertMessage);
      } else if (error.request) {
        alertMessage = 'Network error. Please check your connection and try again.';
        Alert.alert('Network Error', alertMessage);
      } else if (error.message?.includes('User not found')) {
        alertMessage = 'Could not verify user. Please log out and log back in.';
        Alert.alert('Authentication Error', alertMessage);
      } else {
        alertMessage = `An unexpected error occurred: ${error.message || 'Please try again.'}`;
        Alert.alert('Error', alertMessage);
      }

    } finally {
      setDownloadingReview(false);
    }
  };

  const handleSubmitAssignment = async () => {
    if (!assessmentDetail) return;
    if (!isAssessmentOpen(assessmentDetail)) {
      Alert.alert('Assessment Unavailable', `This assessment is not currently available.`);
      return;
    }
    
    const hasFiles = selectedFiles.length > 0;
    const hasLink = submissionLink.trim() !== '';
    
    if (!hasFiles && !hasLink) {
      Alert.alert(`No Submission`, `Please select a file or enter a link to submit.`);
      return;
    }

    setSubmissionLoading(true);
    setUploadProgress(0); // Reset progress

    try {
      if (netInfo?.isInternetReachable) {
        const formData = new FormData();
        if (hasLink) {
          formData.append('submission_link', submissionLink.trim());
        } else if (hasFiles) {
          // Support multiple files - append each with array notation
          selectedFiles.forEach((file, index) => {
            formData.append('assignment_files[]', {
              uri: file.uri,
              name: file.name,
              type: file.mimeType || 'application/octet-stream',
            } as any);
          });
        }

        const response = await api.post(`/assessments/${assessmentDetail.id}/submit-assignment`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000, // 5 minutes timeout for multiple files
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              let percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              if (percent > 100) percent = 100;
              setUploadProgress(percent);
            }
          },
        });

        if (response.status === 200) {
          Alert.alert('Success', response.data.message || 'Submission successful!');
          setSelectedFiles([]);
          setSubmissionLink('');
          setSubmissionType(null);
          await fetchAssessmentDetailsAndAttemptStatus();
        } else {
          Alert.alert('Error', response.data.message || 'Failed to submit.');
        }
      } else {
        // Offline logic - now supports multiple files
        const user = await getUserData();
        if (user && user.email) {
          const serverSubmissionTime = await getCurrentServerTime(user.email);
          
          if (hasLink) {
            // For links, use single file save
            const actualSubmissionTime = await saveOfflineSubmission(
              user.email,
              assessmentDetail.id,
              submissionLink.trim(),
              submissionLink.trim(),
              serverSubmissionTime
            );
            Alert.alert('Submission Saved Offline', 'Your link has been saved and will be submitted once you are online.');
            setLatestAssignmentSubmission({
              has_submitted_file: true,
              submitted_file_path: submissionLink.trim(),
              submitted_file_url: null,
              submitted_file_name: submissionLink.trim(),
              original_filename: submissionLink.trim(),
              submitted_at: actualSubmissionTime,
              status: 'to sync',
            });
          } else if (hasFiles) {
            // For multiple files, use saveOfflineSubmissionMultiple
            const { saveOfflineSubmissionMultiple } = await import('@/lib/localDb');
            const filesToSave = selectedFiles.map(file => ({
              uri: file.uri,
              name: file.name,
              type: file.mimeType || 'application/octet-stream',
              size: file.size || 0,
            }));
            
            const actualSubmissionTime = await saveOfflineSubmissionMultiple(
              user.email,
              assessmentDetail.id,
              filesToSave,
              serverSubmissionTime
            );
            
            Alert.alert('Submission Saved Offline', `Your ${selectedFiles.length} file(s) have been saved and will be submitted once you are online.`);
            setLatestAssignmentSubmission({
              has_submitted_file: true,
              submitted_file_path: selectedFiles[0]?.uri || '',
              submitted_file_url: null,
              submitted_file_name: selectedFiles[0]?.name || '',
              original_filename: selectedFiles[0]?.name || '',
              submitted_at: actualSubmissionTime,
              status: 'to sync',
              submitted_files: filesToSave.map(f => ({
                path: f.uri,
                name: f.name,
                type: f.type,
                size: f.size,
              })),
            });
          }
          
          setSelectedFiles([]);
          setSubmissionLink('');
          setSubmissionType(null);
        } else {
          Alert.alert('Error', 'User not found. Cannot save offline submission.');
        }
      }
    } catch (err: any) {
      console.error('Error submitting assignment:', err.response?.data || err.message);
      if (err.code === 'ECONNABORTED') {
        Alert.alert('Timeout Error', 'The upload took too long. Your internet connection might be too slow for this file size.');
      } else {
        Alert.alert('Submission Error', err.response?.data?.message || 'Failed to submit due to a network error.');
      }
    } finally {
      setSubmissionLoading(false);
      setSubmissionModalVisible(false);
      setUploadProgress(0);
    }
  };

  const getAssessmentIcon = (type: string) => {
    switch (type) {
      case 'quiz':
        return 'help-circle';
      case 'exam':
        return 'school';
      case 'assignment':
        return 'document-text';
      case 'project':
        return 'folder';
      case 'activity':
        return 'play-circle';
      default:
        return 'clipboard';
    }
  };
  const getAssessmentColor = (type: string) => {
    switch (type) {
      case 'quiz':
        return '#8e24aa';
      case 'exam':
        return '#d32f2f';
      case 'assignment':
        return '#1976d2';
      case 'project':
        return '#388e3c';
      case 'activity':
        return '#f57c00';
      default:
        return '#616161';
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1967d2" />
        </View>
      </View>
    );
  }
  if (error || !assessmentDetail) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#d93025" />
          <Text style={styles.errorText}>{error || 'Assessment not found.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchAssessmentDetailsAndAttemptStatus}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isAssessmentCurrentlyOpen = isAssessmentOpen(assessmentDetail);
  const isAssignmentType = ['assignment', 'activity', 'project'].includes(assessmentDetail.type);
  const isQuizOrExamType = ['quiz', 'exam'].includes(assessmentDetail.type);

  let isQuizAttemptButtonDisabled = false;
  const assessmentType = assessmentDetail?.type || 'assessment';
  const assessmentTypeCapitalized = assessmentType.charAt(0).toUpperCase() + assessmentType.slice(1);
  
  // --- UPDATED VARS for Assignment Button (Delete/Remove flow) ---
  const hasSubmittedAssignment = (latestAssignmentSubmission?.has_submitted_file || hasOfflineAssignment);
  const assignmentButtonText = !isAssessmentCurrentlyOpen
    ? 'Assessment Unavailable'
    : hasSubmittedAssignment
    ? 'Remove Submission'  // Changed from 'Edit Submission'
    : 'Submit Assessment';
  const assignmentButtonIcon = hasSubmittedAssignment ? 'trash-outline' : 'add-circle';  // Changed icon

  let quizButtonText = `Start ${assessmentTypeCapitalized}`;
  
  // Logic for the quiz button text and disabled state
  if (assessmentDetail && (assessmentDetail.type === 'quiz' || assessmentDetail.type === 'exam')) {
    if (hasOfflineAttempt) {
      quizButtonText = `Resume ${assessmentTypeCapitalized} (Offline)`;
      isQuizAttemptButtonDisabled = false;
    } else if (!isAssessmentCurrentlyOpen) {
      isQuizAttemptButtonDisabled = true;
      quizButtonText = 'Assessment Unavailable';
    } else if (attemptStatus) {
      if (attemptStatus.has_in_progress_attempt) {
        quizButtonText = `Resume ${assessmentTypeCapitalized}`;
        isQuizAttemptButtonDisabled = isStartingAttempt; 
      } else if (attemptStatus.attempts_remaining !== null && attemptStatus.attempts_remaining <= 0) {
        quizButtonText = 'Attempt Limit Reached';
        isQuizAttemptButtonDisabled = true;
      } else if (!netInfo?.isInternetReachable && !hasDetailedData) {
        // Must be checked specifically for offline starts
        isQuizAttemptButtonDisabled = true;
        quizButtonText = 'Download Assessment Details First';
      }
    }
  } else if (!isAssessmentCurrentlyOpen) {
    isQuizAttemptButtonDisabled = true;
    quizButtonText = 'Assessment Unavailable';
  }
  
  // Final check for offline access conditions
  if (!netInfo?.isInternetReachable) {
    if (assessmentDetail?.type === 'quiz' || assessmentDetail?.type === 'exam') {
      if (hasOfflineAttempt) {
        isQuizAttemptButtonDisabled = false;
        quizButtonText = 'Resume Assessment (Offline)';
      } else if (!hasDetailedData) {
        isQuizAttemptButtonDisabled = true;
        quizButtonText = 'Download Assessment Details First (Offline)';
      } else if (attemptStatus && attemptStatus.attempts_remaining !== null && attemptStatus.attempts_remaining <= 0) {
        isQuizAttemptButtonDisabled = true;
        quizButtonText = 'Attempt Limit Reached (Offline)';
      } else if (!isAssessmentCurrentlyOpen) {
        isQuizAttemptButtonDisabled = true;
        quizButtonText = 'Assessment Unavailable (Offline)';
      } else if (hasDetailedData && isAssessmentCurrentlyOpen) {
        isQuizAttemptButtonDisabled = false;
        quizButtonText = 'Start Assessment (Offline)';
      } else {
        isQuizAttemptButtonDisabled = true;
        quizButtonText = 'Requires Online Details';
      }
    } else if (isAssignmentType) {
        // Allow submission modal to open, but actual submit is handled inside handleSubmitAssignment
        isQuizAttemptButtonDisabled = false; // The button in the JSX is for submission modal
    }
  }

  const resolveGradeAndStatus = () => {
    let displayStatus = 'not_started';
    let displayScore = '-';
    const totalPoints = assessmentDetail?.total_points || 0;

    // 1. Determine Status
    if (submittedAssessment && submittedAssessment.status) {
      displayStatus = submittedAssessment.status;
    } else if (latestAssignmentSubmission && latestAssignmentSubmission.status) {
      displayStatus = latestAssignmentSubmission.status;
    }

    // 2. Determine Score Display
    if (displayStatus === 'not_started') {
      displayScore = 'Not yet taken';
    } else if (displayStatus === 'in_progress') {
      displayScore = 'Pending';
    } else if (displayStatus === 'submitted' || displayStatus === 'to sync') {
      // Submitted but not yet graded (Assignments/Essays)
      displayScore = '?'; 
    } else if (displayStatus === 'completed' || displayStatus === 'graded') {
      
      // --- MODIFIED SECTION START ---
      const isQuizOrExam = ['quiz', 'exam'].includes(assessmentDetail.type);
      const now = new Date().getTime();
      
      const isPastDueDate = assessmentDetail.unavailable_at 
        ? now > new Date(assessmentDetail.unavailable_at).getTime() 
        : false; 

      // If it's a quiz/exam and it is NOT past the due date yet (or has no due date), hide the score
      if (isQuizOrExam && !isPastDueDate) {
        displayScore = '?';
      } else {
        // Otherwise show the score (Assignments, or Quizzes after due date)
        const score = Math.round(submittedAssessment?.score ?? 0);
        displayScore = `${score} / ${totalPoints}`;
      }

    }

    return { displayStatus, displayScore };
  };

  const { displayStatus, displayScore } = resolveGradeAndStatus();

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: assessmentDetail.title || 'Assessment Details' }} />
      <ScrollView contentContainerStyle={styles.scrollViewContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.assessmentTitle}>{assessmentDetail.title}</Text>
            <View style={[styles.assessmentTypeBadge, { backgroundColor: getAssessmentColor(assessmentDetail.type) }]}>
              <Ionicons name={getAssessmentIcon(assessmentDetail.type)} size={16} color="#fff" />
              <Text style={styles.assessmentTypeText}>{assessmentDetail.type?.toUpperCase()}</Text>
            </View>
          </View>
          {assessmentDetail.description && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.assessmentDescription}>{assessmentDetail.description}</Text>
            </View>
          )}
          {!netInfo?.isInternetReachable && (
            <View style={styles.offlineNotice}>
              <Ionicons name="cloud-offline" size={14} color="#5f6368" />
              <Text style={styles.offlineText}>Working offline</Text>
            </View>
          )}
        </View>

        {netInfo?.isInternetReachable && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeader}>Grade & Status</Text>
            <View style={styles.gradeCard}>
              <View style={styles.gradeRow}>
                <Text style={styles.gradeLabel}>Current Status</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(displayStatus) }]}>
                  <Text style={styles.statusText}>
                    {displayStatus === 'not_started' ? 'NOT TAKEN' : displayStatus.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
              </View>
              
              <View style={styles.divider} />

              <View style={styles.gradeRow}>
                <Text style={styles.gradeLabel}>Grade</Text>
                <Text style={[
                  styles.gradeValue, 
                  displayStatus === 'not_started' && { fontSize: 14, color: '#5f6368' },
                  displayScore === '?' && { color: '#f39c12', fontWeight: 'bold' }
                ]}>
                  {displayScore}
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeader}>Assessment Details</Text>
          <View style={styles.detailsGrid}>
            {isQuizOrExamType && (
              <View style={styles.detailCard}>
                <View style={styles.detailIconContainer}>
                  <Ionicons name="timer" size={20} color="#3498db" />
                </View>
                <Text style={styles.detailLabel}>Duration</Text>
                <Text style={styles.detailValue}>{assessmentDetail.duration_minutes ? `${assessmentDetail.duration_minutes} min` : 'N/A'}</Text>
              </View>
            )}
            {isQuizOrExamType && (
              <View style={styles.detailCard}>
                <View style={styles.detailIconContainer}>
                  <Ionicons name="repeat" size={20} color="#9b59b6" />
                </View>
                <Text style={styles.detailLabel}>Max Attempts</Text>
                <Text style={styles.detailValue}>{assessmentDetail.max_attempts ?? 'Unlimited'}</Text>
              </View>
            )}
            {isQuizOrExamType && (
              <View style={styles.detailCard}>
                <View style={styles.detailIconContainer}>
                  <Ionicons name="star" size={20} color="#f39c12" />
                </View>
                <Text style={styles.detailLabel}>Total Points</Text>
                <Text style={styles.detailValue}>{assessmentDetail.total_points ?? 'N/A'}</Text>
              </View>
            )}
            {isQuizOrExamType && attemptStatus && (
              <View style={styles.detailCard}>
                <View style={styles.detailIconContainer}>
                  <Ionicons name="checkmark-done" size={20} color="#27ae60" />
                </View>
                <Text style={styles.detailLabel}>Attempts Made</Text>
                <Text style={styles.detailValue}>{attemptStatus.attempts_made}</Text>
              </View>
            )}
          </View>
          <View style={styles.availabilityContainer}>
            <View style={styles.availabilityItem}>
              <Ionicons name="calendar" size={16} color="#7f8c8d" />
              <Text style={styles.availabilityLabel}>Available From:</Text>
              <Text style={styles.availabilityValue}>{formatDate(assessmentDetail.available_at ?? undefined)}</Text>
            </View>
            {assessmentDetail.unavailable_at && (
              <View style={styles.availabilityItem}>
                <Ionicons name="calendar-outline" size={16} color="#e74c3c" />
                <Text style={styles.availabilityLabel}>Available Until:</Text>
                <Text style={styles.availabilityValue}>{formatDate(assessmentDetail.unavailable_at ?? undefined)}</Text>
              </View>
            )}
          </View>
        </View>
        {isAssignmentType && assessmentDetail.assessment_file_url && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeader}>Assignment Instructions</Text>
            
            {!downloadedFileUri ? (
              // NOT DOWNLOADED STATE (Show Download Action Card)
              <TouchableOpacity
                onPress={promptDownloadOptions}
                style={[styles.actionCard, !netInfo?.isInternetReachable && styles.actionCardDisabled]}
                disabled={!netInfo?.isInternetReachable || isDownloading}
              >
                <View style={styles.actionCardContent}>
                  <View style={styles.actionCardIcon}>
                    {isDownloading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Ionicons name="download" size={24} color={netInfo?.isInternetReachable ? '#fff' : '#ccc'} />
                    )}
                  </View>
                  <View style={styles.actionCardText}>
                    <Text style={[styles.actionCardTitle, !netInfo?.isInternetReachable && styles.disabledText]}>
                      {isDownloading ? `Downloading ${downloadProgress}%` : 'Download Instructions'}
                    </Text>
                    <Text style={[styles.actionCardSubtitle, !netInfo?.isInternetReachable && styles.disabledText]}>
                      {isDownloading ? 'Please wait...' : 'Get the assignment file'}
                    </Text>
                  </View>
                </View>
                {!netInfo?.isInternetReachable && <Text style={styles.offlineWarning}>Must be online to download</Text>}
              </TouchableOpacity>
            ) : (
              // DOWNLOADED STATE (Show File Card similar to Material)
              <View style={styles.inlineViewerContainer}>
                <View style={styles.viewerHeader}>
                  <Text style={styles.viewerTitle}>File Downloaded</Text>
                  <TouchableOpacity style={styles.actionButton} onPress={handleDeleteDownload} disabled={isDeleting}>
                    {isDeleting ? <ActivityIndicator size="small" color="#d93025" /> : <Ionicons name="trash-outline" size={20} color="#d93025" />}
                  </TouchableOpacity>
                </View>
                <View style={styles.genericFileContainer}>
                  <Ionicons name={getFileIcon(getFileType(assessmentDetail.assessment_file_path || ''))} size={64} color="#4285f4" />
                  <Text style={styles.genericFileName}>Instructions File</Text>
                  <TouchableOpacity style={styles.openFileButton} onPress={handleOpenFile}>
                    <Text style={styles.openFileButtonText}>Open in...</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.downloadedIndicator}>
                  <Ionicons name="checkmark-circle" size={16} color="#137333" />
                  <Text style={styles.downloadedText}>{`Downloaded on ${downloadDate} • ${fileSize}`}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Multiple Assessment Files Section */}
        {isAssignmentType && assessmentDetail.files && assessmentDetail.files.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.filesSectionHeader}>
              <View style={styles.filesSectionTitleRow}>
                <Ionicons name="documents" size={18} color="#4285f4" />
                <Text style={styles.sectionHeaderText}>Assessment Files ({assessmentDetail.files.length})</Text>
              </View>
              {downloadedFiles.length > 0 && (
                <View style={styles.downloadedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                  <Text style={styles.downloadedBadgeText}>
                    {downloadedFiles.length} downloaded
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.filesListContainer}>
              {assessmentDetail.files.map((file, index) => {
                const isDownloaded = downloadedFiles.some(d => d.assessmentFileIndex === index);
                const isCurrentlyDownloading = currentDownloadingFileIndex === index;
                
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.assessmentFileCard,
                      isDownloaded && styles.assessmentFileCardDownloaded,
                    ]}
                    onPress={() => {
                      if (isDownloaded) {
                        // Open in FileViewer
                        const downloadedFile = downloadedFiles.find(d => d.assessmentFileIndex === index);
                        if (downloadedFile) {
                          setActiveFileViewerUri(downloadedFile.uri);
                          setActiveFileViewerName(downloadedFile.fileName);
                          setShowFileViewer(true);
                        }
                      } else if (netInfo?.isInternetReachable && assessmentDetail.id) {
                        handleOpenFileFromList(file, index);
                      } else {
                        Alert.alert('Offline', 'You need to be online to download this file.');
                      }
                    }}
                    disabled={isCurrentlyDownloading}
                  >
                    <View style={[
                      styles.assessmentFileIconContainer, 
                      { backgroundColor: isDownloaded ? '#dcfce720' : getFileColorByExtension(file.extension) + '20' }
                    ]}>
                      <Ionicons 
                        name={getFileIconByExtension(file.extension) as any} 
                        size={28} 
                        color={isDownloaded ? '#16a34a' : getFileColorByExtension(file.extension)} 
                      />
                    </View>
                    <View style={styles.assessmentFileInfoContainer}>
                      <Text style={styles.assessmentFileNameText} numberOfLines={2}>{file.original_name}</Text>
                      <View style={styles.fileItemMetaRow}>
                        <Text style={styles.assessmentFileSizeText}>
                          {formatBytes(file.size)} • {file.extension?.toUpperCase() || 'FILE'}
                        </Text>
                        {isDownloaded && (
                          <View style={styles.offlineAvailableBadge}>
                            <Ionicons name="cloud-done" size={12} color="#16a34a" />
                            <Text style={styles.offlineAvailableText}>Offline</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {isCurrentlyDownloading ? (
                      <ActivityIndicator size="small" color="#4285f4" />
                    ) : isDownloaded ? (
                      <Ionicons name="eye-outline" size={22} color="#16a34a" />
                    ) : (
                      <Ionicons 
                        name="download-outline" 
                        size={20} 
                        color={netInfo?.isInternetReachable ? '#4285f4' : '#9ca3af'} 
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Multiple Assessment Links Section */}
        {isAssignmentType && assessmentDetail.links && assessmentDetail.links.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeader}>Assessment Links ({assessmentDetail.links.length})</Text>
            <View style={styles.linksListContainer}>
              {assessmentDetail.links.map((link, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.assessmentLinkCard, !netInfo?.isInternetReachable && styles.assessmentLinkCardDisabled]}
                  onPress={() => {
                    if (netInfo?.isInternetReachable) {
                      Linking.openURL(link.url).catch(() => {
                        Alert.alert('Error', 'Could not open the link.');
                      });
                    } else {
                      Alert.alert('Offline', 'You need to be online to open this link.');
                    }
                  }}
                  disabled={!netInfo?.isInternetReachable}
                >
                  <View style={styles.assessmentLinkIconContainer}>
                    <Ionicons name="link" size={24} color="#6366f1" />
                  </View>
                  <View style={styles.assessmentLinkInfoContainer}>
                    <Text style={styles.assessmentLinkTitleText} numberOfLines={1}>
                      {link.title || 'External Link'}
                    </Text>
                    <Text style={styles.assessmentLinkUrlText} numberOfLines={1}>{link.url}</Text>
                  </View>
                  <Ionicons 
                    name="open-outline" 
                    size={20} 
                    color={netInfo?.isInternetReachable ? '#6366f1' : '#9ca3af'} 
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {isAssignmentType && latestAssignmentSubmission?.has_submitted_file && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeader}>Previous Submission</Text>
            <View style={styles.submissionCard}>
              {/* Build files array from new submitted_files or legacy format */}
              {(() => {
                const files: { name: string; url?: string; type: string }[] = [];
                
                if (latestAssignmentSubmission.submitted_files && latestAssignmentSubmission.submitted_files.length > 0) {
                  // New format - multiple files array
                  latestAssignmentSubmission.submitted_files.forEach(f => {
                    files.push({
                      name: f.name,
                      url: f.url,
                      type: f.type === 'link' ? 'link' : getFileType(f.name),
                    });
                  });
                } else {
                  // Legacy format - parse from original_filename
                  const filenames = parseFilenames(latestAssignmentSubmission.original_filename);
                  const fileUrls = parseFileUrls(latestAssignmentSubmission.submitted_file_url);
                  filenames.forEach((filename, index) => {
                    files.push({
                      name: filename,
                      url: fileUrls[index] || undefined,
                      type: getFileType(filename),
                    });
                  });
                }
                
                return (
                  <>
                    <View style={styles.submissionHeader}>
                      <View style={styles.submissionIconContainer}>
                        <Ionicons name="document-text" size={20} color="#27ae60" />
                      </View>
                      <View style={styles.submissionInfo}>
                        <Text style={styles.submissionFileName}>
                          {files.length > 1 ? `${files.length} files submitted` : (files[0]?.name || 'Unknown File')}
                        </Text>
                        {latestAssignmentSubmission.status && (
                          <View
                            style={[
                              styles.statusBadge,
                              latestAssignmentSubmission.status === 'to sync'
                                ? { backgroundColor: '#f39c12' }
                                : { backgroundColor: '#27ae60' },
                            ]}
                          >
                            <Text style={styles.statusText}>{latestAssignmentSubmission.status.replace('_', ' ').toUpperCase()}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    
                    {/* File List for multiple files - Using SubmittedFileCard */}
                    {files.length > 0 && (
                      <View style={styles.submittedFilesContainer}>
                        {files.map((file, index) => (
                          <SubmittedFileCard
                            key={index}
                            fileName={file.name || 'Unknown File'}
                            fileType={file.type === 'link' ? 'other' : file.type}
                            isLink={file.type === 'link'}
                            onDownload={file.url && file.type !== 'link' && netInfo?.isInternetReachable 
                              ? () => handleDownloadSubmittedFile(file.url!)
                              : undefined
                            }
                            onOpen={file.url && file.type === 'link' && netInfo?.isInternetReachable
                              ? () => Linking.openURL(file.url!)
                              : undefined
                            }
                            disabled={!netInfo?.isInternetReachable}
                          />
                        ))}
                      </View>
                    )}
                    
                    {latestAssignmentSubmission.submitted_at && (
                      <Text style={[styles.submissionDate, { marginTop: 10 }]}>
                        Submitted: {
                          latestAssignmentSubmission.status === 'to sync'
                            ? formatDate(latestAssignmentSubmission.submitted_at)
                            : formatUTCDate(latestAssignmentSubmission.submitted_at)
                        }
                      </Text>
                    )}
                    {!netInfo?.isInternetReachable && <Text style={styles.offlineWarning}></Text>}
                  </>
                );
              })()}
            </View>
          </View>
        )}
        <View style={styles.sectionContainer}>
          {isAssignmentType ? (
            <View>
              <Text style={styles.sectionHeader}>Submit Your Work</Text>
              
              {/* Multiple Files Preview - Modern Card UI */}
              {submissionType === 'file' && selectedFiles.length > 0 ? (
                <View style={styles.multiFileContainer}>
                  {/* File Size Summary */}
                  <View style={styles.fileSizeSummary}>
                    <Ionicons name="folder-open" size={18} color="#6366F1" />
                    <Text style={styles.fileSizeSummaryText}>
                      {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} • {formatBytes(getTotalFileSize())} / 50MB
                    </Text>
                    <View style={[
                      styles.fileSizeProgressBar,
                      { width: `${Math.min((getTotalFileSize() / MAX_FILE_SIZE) * 100, 100)}%` },
                      getTotalFileSize() > MAX_FILE_SIZE * 0.8 && styles.fileSizeProgressBarWarning,
                    ]} />
                  </View>
                  
                  {/* Individual File Cards */}
                  {selectedFiles.map((file, index) => (
                    <View key={index} style={styles.fileCard}>
                      <View style={styles.fileCardIcon}>
                        <Ionicons 
                          name={getFileIcon(getFileType(file.name))} 
                          size={24} 
                          color="#1976d2" 
                        />
                      </View>
                      <View style={styles.fileCardInfo}>
                        <Text style={styles.fileCardName} numberOfLines={1}>{file.name}</Text>
                        <Text style={styles.fileCardSize}>{formatBytes(file.size || 0)}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.fileCardRemove}
                        onPress={() => handleRemoveFile(index)}
                      >
                        <Ionicons name="close-circle" size={24} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  
                  {/* Add More Files Button */}
                  <TouchableOpacity
                    style={styles.addMoreFilesButton}
                    onPress={() => handlePickDocument(true)}
                  >
                    <Ionicons name="add-circle-outline" size={20} color="#6366F1" />
                    <Text style={styles.addMoreFilesText}>Add More Files</Text>
                  </TouchableOpacity>
                </View>
              ) : submissionType === 'link' && submissionLink ? (
                <View style={styles.submissionPreviewCard}>
                  <Ionicons name="link" size={24} color="#1976d2" />
                  <Text style={styles.submissionPreviewText} numberOfLines={1}>
                    {submissionLink}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setSubmissionLink('');
                      setSubmissionType(null);
                    }}
                  >
                    <Ionicons name="close-circle" size={24} color="#d93025" />
                  </TouchableOpacity>
                </View>
              ) : (
                /* Submit/Remove Button */
                <TouchableOpacity
                  testID="submit-assignment-button"
                  style={[
                    styles.submitButton, 
                    (!isAssessmentCurrentlyOpen || submissionLoading) && styles.submitButtonDisabled,
                    hasSubmittedAssignment && styles.removeSubmissionButton, // Red style for remove
                  ]}
                  onPress={() => {
                    if (hasSubmittedAssignment) {
                      setRemoveModalVisible(true); // Open remove modal
                    } else {
                      setSubmissionModalVisible(true); // Open submission modal
                    }
                  }}
                  disabled={!isAssessmentCurrentlyOpen || submissionLoading}
                >
                  <Ionicons name={assignmentButtonIcon} size={24} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.submitButtonText}>{assignmentButtonText}</Text>
                </TouchableOpacity>
              )}
              
              {/* Submit Now Button - shown when files are selected */}
              {(submissionType === 'file' || submissionType === 'link') && (
                <TouchableOpacity
                  testID="submit-now-button"
                  style={[styles.submitButton, { marginTop: 12, backgroundColor: '#10B981' }]}
                  onPress={handleSubmitAssignment}
                  disabled={!isAssessmentCurrentlyOpen || submissionLoading}
                >
                  {submissionLoading ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <ActivityIndicator color="#fff" style={{ marginRight: 10 }} />
                      <Text style={styles.submitButtonText}>
                        {submissionType === 'file' && uploadProgress > 0 
                          ? `Uploading ${uploadProgress}%` 
                          : 'Processing...'}
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Ionicons name="cloud-upload" size={24} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.submitButtonText}>
                        Submit {selectedFiles.length > 1 ? `${selectedFiles.length} Files` : 'Now'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View>
              <Text style={styles.sectionHeader}>Take Assessment</Text>
              <TouchableOpacity
                testID="start-quiz-button"
                style={[styles.submitButton, isQuizAttemptButtonDisabled && styles.submitButtonDisabled]}
                onPress={handleStartQuizAttempt}
                disabled={isQuizAttemptButtonDisabled || isStartingAttempt}
              >
                {isStartingAttempt ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name={hasOfflineAttempt ? 'play' : 'play-circle'} size={24} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.submitButtonText}>{quizButtonText}</Text>
                  </>
                )}
              </TouchableOpacity>

              {attemptStatus && attemptStatus.attempts_made >= 1 && (() => {
                const now = new Date().getTime();
                const isPastDueDate = assessmentDetail.unavailable_at ? now > new Date(assessmentDetail.unavailable_at).getTime() : true;
                const isReviewAllowed = assessmentDetail.allow_answer_review;
                const canViewAnswers = isReviewAllowed && isPastDueDate;

                let buttonText = 'View Answers';
                let buttonAction = () => {};
                let isButtonDisabled = true;

                if (canViewAnswers) {
                  if (hasLocalReview) {
                    buttonText = 'View Answers';
                    isButtonDisabled = false;
                    buttonAction = () => {
                      const reviewPath = `/courses/assessments/${assessmentDetail.id.toString()}/review-answer`;
                      router.push({
                        pathname: reviewPath as any,
                        params: { assessmentId: assessmentDetail.id.toString(), isOffline: 'true' },
                      });
                    };
                  } else {
                    if (netInfo?.isInternetReachable) {
                      buttonText = downloadingReview ? 'Downloading...' : 'Download Your Answer';
                      isButtonDisabled = downloadingReview;
                      buttonAction = handleDownloadReviewData;
                    } else {
                      buttonText = 'Connect to Download Your Answer';
                      isButtonDisabled = true;
                    }
                  }
                } else {
                  buttonText = !isReviewAllowed ? 'View Answer is Disabled by Instructor' : 'View Answer is Available After Due Date';
                  isButtonDisabled = true;
                }

                return (
                  <TouchableOpacity
                    style={[styles.viewAnswersButton, isButtonDisabled && styles.viewAnswersButtonDisabled]}
                    onPress={buttonAction}
                    disabled={isButtonDisabled}
                  >
                    {downloadingReview ? (
                      <ActivityIndicator size="small" color="#1967d2" style={{ marginRight: 8 }} />
                    ) : (
                      <Ionicons
                        name={hasLocalReview ? 'eye-outline' : 'cloud-download-outline'}
                        size={24}
                        color={isButtonDisabled ? '#9aa0a6' : '#1967d2'}
                        style={{ marginRight: 8 }}
                      />
                    )}
                    <Text style={[styles.viewAnswersButtonText, isButtonDisabled && styles.viewAnswersButtonTextDisabled]}>
                      {buttonText}
                    </Text>
                  </TouchableOpacity>
                );
              })()}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Submission Type Modal */}
      <Modal animationType="slide" transparent={true} visible={isSubmissionModalVisible} onRequestClose={() => setSubmissionModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Ionicons name="cloud-upload" size={32} color="#1967d2" />
              <Text style={styles.modalTitle}>Choose Submission Type</Text>
            </View>
            
            <TouchableOpacity
              testID="upload-file-button"
              style={styles.modalButton}
              onPress={() => {
                setSubmissionModalVisible(false);
                handlePickDocument(false);
              }}
            >
              <View style={styles.modalButtonIconContainer}>
                <Ionicons name="documents-outline" size={24} color="#1967d2" />
              </View>
              <View style={styles.modalButtonContent}>
                <Text style={styles.modalButtonText}>Upload Files</Text>
                <Text style={styles.modalButtonSubtext}>Select one or multiple files</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
            
            <View style={styles.modalFileLimitBadge}>
              <Ionicons name="information-circle" size={14} color="#6366F1" />
              <Text style={styles.modalHint}>Maximum total: 50MB • Offline: single file only</Text>
            </View>
            
            <TouchableOpacity
              testID="submit-link-button"
              style={styles.modalButton}
              onPress={() => {
                setSubmissionType('link');
              }}
            >
              <View style={[styles.modalButtonIconContainer, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="link-outline" size={24} color="#10B981" />
              </View>
              <View style={styles.modalButtonContent}>
                <Text style={styles.modalButtonText}>Submit a Link</Text>
                <Text style={styles.modalButtonSubtext}>Google Drive, OneDrive, etc.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
            
            {submissionType === 'link' && (
              <View style={styles.linkInputContainer}>
                <TextInput
                  testID="link-input"
                  style={styles.linkInput}
                  placeholder="https://example.com/your-work"
                  placeholderTextColor="#9aa0a6"
                  value={submissionLink}
                  onChangeText={setSubmissionLink}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <TouchableOpacity
                  style={styles.linkSubmitButton}
                  onPress={() => {
                    setSubmissionModalVisible(false);
                  }}
                >
                  <Text style={styles.linkSubmitButtonText}>Confirm Link</Text>
                </TouchableOpacity>
              </View>
            )}
            
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => {
                setSubmissionModalVisible(false);
                setSubmissionType(null);
              }}
            >
              <Text style={styles.modalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Remove/Delete Submission Modal */}
      <Modal 
        animationType="fade" 
        transparent={true} 
        visible={isRemoveModalVisible} 
        onRequestClose={() => { setRemoveModalVisible(false); setSelectedFilesToDelete(new Set()); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.removeModalContainer}>
            <View style={styles.removeModalHeader}>
              <View style={styles.removeModalIconContainer}>
                <Ionicons name="warning" size={32} color="#EF4444" />
              </View>
              <Text style={styles.removeModalTitle}>Manage Submission</Text>
              <Text style={styles.removeModalSubtitle}>
                Choose what to do with your current submission
              </Text>
            </View>
            
            {/* Partial File Deletion for Multiple Files */}
            {(() => {
              const filenames = parseFilenames(latestAssignmentSubmission?.original_filename || null);
              const hasMultipleFiles = filenames.length > 1;
              
              if (hasMultipleFiles) {
                return (
                  <>
                    <Text style={styles.removeModalSelectText}>Select files to delete:</Text>
                    <View style={{ maxHeight: 200, marginBottom: 16, width: '100%' }}>
                      <ScrollView>
                        {filenames.map((filename, index) => (
                          <TouchableOpacity 
                            key={index} 
                            style={[
                              styles.fileSelectItem,
                              selectedFilesToDelete.has(index) && styles.fileSelectItemSelected
                            ]}
                            onPress={() => {
                              setSelectedFilesToDelete(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(index)) {
                                  newSet.delete(index);
                                } else {
                                  newSet.add(index);
                                }
                                return newSet;
                              });
                            }}
                          >
                            <View style={[styles.fileSelectCheckbox, selectedFilesToDelete.has(index) && styles.fileSelectCheckboxSelected]}>
                              {selectedFilesToDelete.has(index) && <Ionicons name="checkmark" size={14} color="#fff" />}
                            </View>
                            <Text style={styles.fileSelectText} numberOfLines={1}>{filename}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                    <TouchableOpacity
                      style={[styles.removeModalDeleteButton, selectedFilesToDelete.size === 0 && { opacity: 0.5 }]}
                      onPress={() => {
                        if (selectedFilesToDelete.size === 0) {
                          Alert.alert('No Files Selected', 'Please select at least one file to delete.');
                          return;
                        }
                        if (selectedFilesToDelete.size === filenames.length) {
                          // Deleting all files - use regular delete flow
                          handleDeleteSubmission();
                        } else {
                          // Partial deletion
                          Alert.alert(
                            'Delete Selected Files',
                            `Are you sure you want to delete ${selectedFilesToDelete.size} file(s)? This action cannot be undone.`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Delete',
                                style: 'destructive',
                                onPress: async () => {
                                  setDeletingSubmission(true);
                                  setRemoveModalVisible(false);
                                  
                                  try {
                                    if (!netInfo?.isInternetReachable) {
                                      Alert.alert('Offline Mode', 'You need to be online to delete specific files.');
                                      return;
                                    }
                                    
                                    const indicesToDelete = Array.from(selectedFilesToDelete).sort((a, b) => b - a);
                                    
                                    const response = await api.post(`/assessments/${assessmentDetail?.id}/delete-selected-files`, {
                                      file_indices: indicesToDelete
                                    });
                                    
                                    if (response.status === 200) {
                                      Alert.alert('Success', `${indicesToDelete.length} file(s) deleted successfully!`);
                                      setSelectedFilesToDelete(new Set());
                                      await fetchAssessmentDetailsAndAttemptStatus();
                                    } else {
                                      Alert.alert('Error', response.data.message || 'Failed to delete selected files.');
                                    }
                                  } catch (err: any) {
                                    console.error('Error deleting selected files:', err.response?.data || err.message);
                                    Alert.alert('Deletion Error', err.response?.data?.message || 'Failed to delete selected files.');
                                  } finally {
                                    setDeletingSubmission(false);
                                  }
                                },
                              },
                            ]
                          );
                        }
                      }}
                      disabled={selectedFilesToDelete.size === 0 || isDeletingSubmission || !netInfo?.isInternetReachable}
                    >
                      {isDeletingSubmission ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="trash" size={22} color="#fff" />
                          <Text style={styles.removeModalDeleteText}>Delete Selected ({selectedFilesToDelete.size})</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                );
              } else {
                return (
                  <TouchableOpacity
                    style={styles.removeModalDeleteButton}
                    onPress={handleDeleteSubmission}
                    disabled={isDeletingSubmission || !netInfo?.isInternetReachable}
                  >
                    {isDeletingSubmission ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="trash" size={22} color="#fff" />
                        <Text style={styles.removeModalDeleteText}>Delete Submission</Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              }
            })()}
            
            {!netInfo?.isInternetReachable && (
              <Text style={styles.removeModalOfflineWarning}>
                <Ionicons name="cloud-offline" size={14} /> You must be online to delete
              </Text>
            )}
            
            {/* Add More Files Button */}
            <TouchableOpacity
              style={styles.removeModalAddButton}
              onPress={() => {
                setRemoveModalVisible(false);
                setSelectedFilesToDelete(new Set());
                handlePickDocument(false);
              }}
            >
              <Ionicons name="add-circle" size={22} color="#fff" />
              <Text style={styles.removeModalAddText}>Add More Files</Text>
            </TouchableOpacity>
            
            {/* Cancel */}
            <TouchableOpacity
              style={styles.removeModalCancelButton}
              onPress={() => { setRemoveModalVisible(false); setSelectedFilesToDelete(new Set()); }}
            >
              <Text style={styles.removeModalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* In-App FileViewer Modal */}
      <Modal
        visible={showFileViewer}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowFileViewer(false)}
      >
        <SafeAreaView style={styles.fileViewerContainer}>
          <View style={styles.fileViewerHeader}>
            <TouchableOpacity
              style={styles.fileViewerCloseButton}
              onPress={() => setShowFileViewer(false)}
            >
              <Ionicons name="close" size={24} color="#1f2937" />
            </TouchableOpacity>
            <Text style={styles.fileViewerTitle} numberOfLines={1}>
              {activeFileViewerName}
            </Text>
            <TouchableOpacity
              style={styles.fileViewerShareButton}
              onPress={async () => {
                if (activeFileViewerUri && await Sharing.isAvailableAsync()) {
                  await Sharing.shareAsync(activeFileViewerUri);
                }
              }}
            >
              <Ionicons name="share-outline" size={24} color="#1f2937" />
            </TouchableOpacity>
          </View>
          <View style={styles.fileViewerContent}>
            {activeFileViewerUri && (
              <FileViewer
                uri={activeFileViewerUri}
                fileName={activeFileViewerName}
                isCached={true}
                onClose={() => setShowFileViewer(false)}
                fullscreen={true}
                isOnline={netInfo?.isInternetReachable || false}
              />
            )}
          </View>
        </SafeAreaView>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: isTablet ? 32 : 20,
    maxWidth: contentMaxWidth,
  },
  loadingText: { marginTop: 16, fontSize: isTablet ? 18 : 16, color: '#5f6368' },
  errorText: { fontSize: isTablet ? 18 : 16, color: '#d93025', textAlign: 'center', marginVertical: 16 },
  retryButton: { 
    backgroundColor: '#1967d2', 
    paddingHorizontal: isTablet ? 32 : 24, 
    paddingVertical: isTablet ? 14 : 12, 
    borderRadius: 8, 
    marginTop: 8 
  },
  retryButtonText: { color: '#fff', fontSize: isTablet ? 18 : 16, fontWeight: '500' },
  scrollViewContent: { 
    paddingBottom: 24,
    width: isTablet ? contentMaxWidth : '100%',
    alignSelf: 'center',
  },
  headerContainer: { 
    backgroundColor: '#fff', 
    padding: isTablet ? 28 : 20, 
    borderBottomWidth: 1, 
    borderBottomColor: '#e0e0e0',
    width: '100%',
  },
  assessmentTypeBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    paddingHorizontal: isTablet ? 16 : 12, 
    paddingVertical: isTablet ? 10 : 8, 
    borderRadius: 8 
  },
  assessmentTypeText: { color: '#fff', fontSize: isTablet ? 13 : 11, fontWeight: '700', letterSpacing: 0.5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: isTablet ? 16 : 12, marginBottom: isTablet ? 16 : 12 },
  assessmentTitle: { flex: 1, fontSize: isTablet ? 28 : 22, fontWeight: '600', color: '#202124', textAlign: 'left' },
  descriptionContainer: { backgroundColor: '#f1f3f4', borderRadius: isTablet ? 10 : 8, padding: isTablet ? 20 : 16, width: '100%' },
  assessmentDescription: { fontSize: isTablet ? 16 : 14, color: '#3c4043', textAlign: 'left', lineHeight: isTablet ? 26 : 22 },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: isTablet ? 16 : 12,
    paddingVertical: isTablet ? 8 : 6,
    backgroundColor: '#f1f3f4',
    borderRadius: 16,
    marginTop: isTablet ? 20 : 16,
    gap: 6,
  },
  offlineText: { fontSize: isTablet ? 14 : 12, color: '#5f6368', fontWeight: '500' },
  sectionContainer: { 
    marginHorizontal: isTablet ? 24 : 16, 
    marginTop: isTablet ? 24 : 16, 
    backgroundColor: '#fff', 
    borderRadius: isTablet ? 12 : 8, 
    padding: isTablet ? 24 : 16, 
    borderWidth: 1, 
    borderColor: '#e0e0e0' 
  },
  sectionHeader: { fontSize: isTablet ? 22 : 18, fontWeight: '500', color: '#202124', marginBottom: isTablet ? 20 : 16 },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: isTablet ? 16 : 12, marginBottom: isTablet ? 20 : 16 },
  detailCard: {
    flex: 1,
    minWidth: isTablet ? '30%' : '45%',
    backgroundColor: '#f8f9fa',
    padding: isTablet ? 16 : 12,
    borderRadius: isTablet ? 10 : 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  detailIconContainer: { 
    width: isTablet ? 50 : 40, 
    height: isTablet ? 50 : 40, 
    borderRadius: isTablet ? 25 : 20, 
    backgroundColor: '#fff', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: isTablet ? 10 : 8 
  },
  detailLabel: { fontSize: isTablet ? 14 : 12, color: '#5f6368', marginBottom: 4 },
  detailValue: { fontSize: isTablet ? 18 : 16, fontWeight: '600', color: '#202124' },
  availabilityContainer: { gap: isTablet ? 16 : 12 },
  availabilityItem: { flexDirection: 'row', alignItems: 'center', gap: isTablet ? 12 : 8, paddingVertical: isTablet ? 10 : 8 },
  availabilityLabel: { fontSize: isTablet ? 15 : 13, color: '#5f6368', fontWeight: '500' },
  availabilityValue: { fontSize: isTablet ? 15 : 13, color: '#202124', flex: 1 },
  actionCard: { backgroundColor: '#1967d2', borderRadius: isTablet ? 10 : 8, padding: isTablet ? 20 : 16, borderWidth: 1, borderColor: '#1967d2' },
  actionCardDisabled: { backgroundColor: '#f1f3f4', borderColor: '#e0e0e0' },
  actionCardContent: { flexDirection: 'row', alignItems: 'center', gap: isTablet ? 16 : 12 },
  actionCardIcon: { 
    width: isTablet ? 56 : 48, 
    height: isTablet ? 56 : 48, 
    borderRadius: isTablet ? 28 : 24, 
    backgroundColor: 'rgba(255, 255, 255, 0.2)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  actionCardText: { flex: 1 },
  actionCardTitle: { fontSize: isTablet ? 18 : 16, fontWeight: '500', color: '#fff', marginBottom: isTablet ? 6 : 4 },
  actionCardSubtitle: { fontSize: isTablet ? 15 : 13, color: 'rgba(255, 255, 255, 0.8)' },
  disabledText: { color: '#9aa0a6' },
  offlineWarning: { fontSize: isTablet ? 14 : 12, color: '#d93025', marginTop: 8, textAlign: 'center' },
  submissionCard: { backgroundColor: '#f8f9fa', borderRadius: isTablet ? 10 : 8, padding: isTablet ? 16 : 12, borderWidth: 1, borderColor: '#e0e0e0' },
  submissionHeader: { flexDirection: 'row', alignItems: 'center', gap: isTablet ? 16 : 12, marginBottom: isTablet ? 16 : 12 },
  submissionIconContainer: { 
    width: isTablet ? 48 : 40, 
    height: isTablet ? 48 : 40, 
    borderRadius: isTablet ? 24 : 20, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#e6f4ea' 
  },
  submissionInfo: { flex: 1 },
  submissionFileName: { fontSize: isTablet ? 16 : 14, fontWeight: '500', color: '#202124', marginBottom: 4 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: isTablet ? 10 : 8, paddingVertical: isTablet ? 5 : 4, borderRadius: 4 },
  statusText: { fontSize: isTablet ? 12 : 11, color: '#fff', fontWeight: '600' },
  submissionDate: { fontSize: isTablet ? 14 : 12, color: '#5f6368', marginBottom: isTablet ? 16 : 12 },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: isTablet ? 12 : 10,
    paddingHorizontal: isTablet ? 20 : 16,
    backgroundColor: '#e8f0fe',
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#1967d2',
  },
  downloadButtonDisabled: { backgroundColor: '#f1f3f4', borderColor: '#e0e0e0' },
  downloadButtonText: { fontSize: isTablet ? 16 : 14, color: '#1967d2', fontWeight: '500' },
  filePickerCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: isTablet ? 10 : 8,
    padding: isTablet ? 20 : 16,
    marginBottom: isTablet ? 20 : 16,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  filePickerContent: { flexDirection: 'row', alignItems: 'center', gap: isTablet ? 16 : 12 },
  filePickerIcon: { 
    width: isTablet ? 56 : 48, 
    height: isTablet ? 56 : 48, 
    borderRadius: isTablet ? 28 : 24, 
    backgroundColor: '#fff', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  filePickerText: { flex: 1 },
  filePickerTitle: { fontSize: isTablet ? 16 : 14, fontWeight: '500', color: '#202124', marginBottom: 4 },
  filePickerSubtitle: { fontSize: isTablet ? 14 : 12, color: '#5f6368' },
  submitButton: {
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
  submitButtonDisabled: { backgroundColor: '#dadce0', shadowOpacity: 0, elevation: 0 },
  submitButtonText: { color: '#fff', fontSize: isTablet ? 18 : 16, fontWeight: '500' },
  viewAnswersButton: {
    backgroundColor: '#fff',
    borderRadius: isTablet ? 10 : 8,
    paddingVertical: isTablet ? 18 : 14,
    paddingHorizontal: isTablet ? 28 : 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: isTablet ? 16 : 12,
    borderWidth: 2,
    borderColor: '#1967d2',
  },
  viewAnswersButtonDisabled: { borderColor: '#dadce0', backgroundColor: '#f8f9fa' },
  viewAnswersButtonText: { color: '#1967d2', fontSize: isTablet ? 18 : 16, fontWeight: '500' },
  viewAnswersButtonTextDisabled: { color: '#9aa0a6', fontSize: isTablet ? 16 : 14 },
  offlineSubmissionContainer: { padding: isTablet ? 32 : 24, alignItems: 'center', gap: isTablet ? 16 : 12 },
  offlineSubmissionText: { fontSize: isTablet ? 16 : 14, color: '#5f6368', textAlign: 'center', lineHeight: isTablet ? 24 : 20 },
  submissionStatusContainer: { gap: isTablet ? 16 : 12 },
  submissionStatusItem: { flexDirection: 'row', alignItems: 'center', gap: isTablet ? 16 : 12, paddingVertical: isTablet ? 10 : 8 },
  submissionLabel: { fontSize: isTablet ? 16 : 14, color: '#5f6368', fontWeight: '500', minWidth: isTablet ? 80 : 60 },
  submissionValue: { fontSize: isTablet ? 16 : 14, fontWeight: '600', flex: 1 },
  completionInfoContainer: {
    marginTop: isTablet ? 16 : 12,
    padding: isTablet ? 16 : 12,
    backgroundColor: '#e6f4ea',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#137333',
  },
  completionInfoText: { fontSize: isTablet ? 15 : 13, color: '#137333', lineHeight: isTablet ? 22 : 18 },
  loadingSubmissionContainer: { flexDirection: 'row', alignItems: 'center', gap: isTablet ? 16 : 12, padding: isTablet ? 20 : 16 },
  loadingSubmissionText: { fontSize: isTablet ? 16 : 14, color: '#5f6368' },
  submissionPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f0fe',
    borderRadius: isTablet ? 10 : 8,
    padding: isTablet ? 16 : 12,
    gap: isTablet ? 16 : 12,
    borderWidth: 1,
    borderColor: '#1967d2',
  },
  submissionPreviewText: { flex: 1, fontSize: isTablet ? 16 : 14, color: '#202124' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { 
    width: isTablet ? '70%' : '90%', 
    maxWidth: 500,
    backgroundColor: '#fff', 
    borderRadius: 12, 
    padding: isTablet ? 32 : 24, 
    gap: isTablet ? 20 : 16 
  },
  modalTitle: { fontSize: isTablet ? 24 : 20, fontWeight: '600', color: '#202124', textAlign: 'center', marginBottom: 8 },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: isTablet ? 10 : 8,
    padding: isTablet ? 20 : 16,
    gap: isTablet ? 16 : 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  modalButtonText: { fontSize: isTablet ? 18 : 16, fontWeight: '500', color: '#202124' },
  modalHint: { fontSize: isTablet ? 14 : 12, color: '#5f6368', textAlign: 'center', marginTop: -8 },
  linkInputContainer: { marginTop: isTablet ? 12 : 8, gap: 8 },
  linkInput: { 
    borderWidth: 1, 
    borderColor: '#dadce0', 
    borderRadius: 8, 
    padding: isTablet ? 16 : 12, 
    fontSize: isTablet ? 16 : 14, 
    color: '#202124' 
  },
  linkSubmitButton: { backgroundColor: '#388e3c', padding: isTablet ? 16 : 12, borderRadius: 8, alignItems: 'center' },
  linkSubmitButtonText: { color: '#fff', fontWeight: '500', fontSize: isTablet ? 16 : 14 },
  modalCancelButton: { marginTop: 8, padding: isTablet ? 16 : 12, alignItems: 'center' },
  modalCancelButtonText: { fontSize: isTablet ? 18 : 16, color: '#5f6368' },
  gradeCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: isTablet ? 10 : 8,
    padding: isTablet ? 20 : 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  gradeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: isTablet ? 6 : 4,
  },
  gradeLabel: {
    fontSize: isTablet ? 18 : 16,
    color: '#5f6368',
    fontWeight: '500',
  },
  gradeValue: {
    fontSize: isTablet ? 24 : 20,
    fontWeight: '700',
    color: '#202124',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: isTablet ? 16 : 12,
  },
  inlineViewerContainer: {
    backgroundColor: '#fff',
    borderRadius: isTablet ? 10 : 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  viewerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: isTablet ? 16 : 12,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  viewerTitle: { fontSize: isTablet ? 18 : 16, fontWeight: '500', color: '#202124' },
  actionButton: { padding: isTablet ? 8 : 6 },
  genericFileContainer: { padding: isTablet ? 48 : 32, alignItems: 'center' },
  genericFileName: { fontSize: isTablet ? 18 : 16, color: '#202124', marginTop: isTablet ? 20 : 16, marginBottom: isTablet ? 24 : 20, textAlign: 'center' },
  openFileButton: { backgroundColor: '#1967d2', paddingVertical: isTablet ? 14 : 10, paddingHorizontal: isTablet ? 28 : 20, borderRadius: 8 },
  openFileButtonText: { color: '#fff', fontSize: isTablet ? 16 : 14, fontWeight: '500' },
  downloadedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: isTablet ? 16 : 12,
    backgroundColor: '#e6f4ea',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#d0e5d6',
  },
  downloadedText: { fontSize: isTablet ? 14 : 12, color: '#137333', flex: 1 },
  
  // ============================================
  // MULTIPLE FILE UPLOAD STYLES - Modern LMS UI
  // ============================================
  multiFileContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: isTablet ? 16 : 12,
    padding: isTablet ? 20 : 16,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  fileSizeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: isTablet ? 16 : 12,
    paddingBottom: isTablet ? 12 : 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    position: 'relative',
  },
  fileSizeSummaryText: {
    fontSize: isTablet ? 14 : 13,
    color: '#64748B',
    fontWeight: '500',
    flex: 1,
  },
  fileSizeProgressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    backgroundColor: '#6366F1',
    borderRadius: 2,
  },
  fileSizeProgressBarWarning: {
    backgroundColor: '#F59E0B',
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: isTablet ? 12 : 10,
    padding: isTablet ? 14 : 12,
    marginBottom: isTablet ? 10 : 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  fileCardIcon: {
    width: isTablet ? 48 : 40,
    height: isTablet ? 48 : 40,
    borderRadius: isTablet ? 12 : 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: isTablet ? 14 : 12,
  },
  fileCardInfo: {
    flex: 1,
  },
  fileCardName: {
    fontSize: isTablet ? 15 : 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  fileCardSize: {
    fontSize: isTablet ? 13 : 12,
    color: '#64748B',
  },
  fileCardRemove: {
    padding: 4,
  },
  addMoreFilesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: isTablet ? 14 : 12,
    marginTop: isTablet ? 8 : 6,
    borderRadius: isTablet ? 10 : 8,
    borderWidth: 2,
    borderColor: '#6366F1',
    borderStyle: 'dashed',
    backgroundColor: '#EEF2FF',
  },
  addMoreFilesText: {
    fontSize: isTablet ? 15 : 14,
    fontWeight: '600',
    color: '#6366F1',
  },
  removeSubmissionButton: {
    backgroundColor: '#EF4444',
  },

  // ============================================
  // MODAL STYLES - Enhanced UI
  // ============================================
  modalHeader: {
    alignItems: 'center',
    marginBottom: isTablet ? 24 : 20,
  },
  modalButtonIconContainer: {
    width: isTablet ? 48 : 40,
    height: isTablet ? 48 : 40,
    borderRadius: isTablet ? 12 : 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: isTablet ? 14 : 12,
  },
  modalButtonContent: {
    flex: 1,
  },
  modalButtonSubtext: {
    fontSize: isTablet ? 13 : 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalFileLimitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: isTablet ? 14 : 12,
    paddingVertical: isTablet ? 10 : 8,
    borderRadius: 8,
    marginBottom: isTablet ? 16 : 12,
  },

  // ============================================
  // REMOVE/DELETE SUBMISSION MODAL STYLES
  // ============================================
  removeModalContainer: {
    width: isTablet ? '70%' : '90%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: isTablet ? 20 : 16,
    padding: isTablet ? 28 : 24,
    alignItems: 'center',
  },
  removeModalHeader: {
    alignItems: 'center',
    marginBottom: isTablet ? 24 : 20,
  },
  removeModalIconContainer: {
    width: isTablet ? 72 : 64,
    height: isTablet ? 72 : 64,
    borderRadius: isTablet ? 36 : 32,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: isTablet ? 16 : 12,
  },
  removeModalTitle: {
    fontSize: isTablet ? 22 : 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  removeModalSubtitle: {
    fontSize: isTablet ? 15 : 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: isTablet ? 22 : 20,
  },
  removeModalDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    backgroundColor: '#EF4444',
    paddingVertical: isTablet ? 16 : 14,
    borderRadius: isTablet ? 12 : 10,
    marginBottom: isTablet ? 12 : 10,
  },
  removeModalDeleteText: {
    fontSize: isTablet ? 16 : 15,
    fontWeight: '600',
    color: '#fff',
  },
  removeModalOfflineWarning: {
    fontSize: isTablet ? 13 : 12,
    color: '#F59E0B',
    marginBottom: isTablet ? 12 : 10,
    textAlign: 'center',
  },
  removeModalAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    backgroundColor: '#1967d2',
    paddingVertical: isTablet ? 16 : 14,
    borderRadius: isTablet ? 12 : 10,
    marginBottom: isTablet ? 16 : 14,
  },
  removeModalAddText: {
    fontSize: isTablet ? 16 : 15,
    fontWeight: '600',
    color: '#fff',
  },
  removeModalCancelButton: {
    paddingVertical: isTablet ? 14 : 12,
    width: '100%',
    alignItems: 'center',
  },
  removeModalCancelText: {
    fontSize: isTablet ? 16 : 15,
    color: '#64748B',
    fontWeight: '500',
  },
  removeModalSelectText: {
    fontSize: isTablet ? 15 : 14,
    color: '#64748B',
    marginBottom: isTablet ? 12 : 10,
    alignSelf: 'flex-start',
  },
  // File selection styles for partial deletion
  fileSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: isTablet ? 14 : 12,
    backgroundColor: '#F8FAFC',
    borderRadius: isTablet ? 10 : 8,
    marginBottom: isTablet ? 10 : 8,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  fileSelectItemSelected: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  fileSelectCheckbox: {
    width: isTablet ? 24 : 22,
    height: isTablet ? 24 : 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    marginRight: isTablet ? 14 : 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileSelectCheckboxSelected: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  fileSelectText: {
    flex: 1,
    fontSize: isTablet ? 15 : 14,
    color: '#1E293B',
  },
  // Submitted files container style
  submittedFilesContainer: {
    marginTop: 12,
    gap: 4,
  },
  // Multiple Assessment Files List Styles
  filesListContainer: {
    gap: isTablet ? 14 : 12,
  },
  assessmentFileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: isTablet ? 12 : 10,
    padding: isTablet ? 16 : 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  assessmentFileIconContainer: {
    width: isTablet ? 56 : 48,
    height: isTablet ? 56 : 48,
    borderRadius: isTablet ? 14 : 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: isTablet ? 16 : 14,
  },
  assessmentFileInfoContainer: {
    flex: 1,
    marginRight: isTablet ? 14 : 12,
  },
  assessmentFileNameText: {
    fontSize: isTablet ? 16 : 14,
    fontWeight: '500',
    color: '#202124',
    marginBottom: 4,
  },
  assessmentFileSizeText: {
    fontSize: isTablet ? 13 : 12,
    color: '#5f6368',
  },
  assessmentFileDownloadButton: {
    width: isTablet ? 44 : 40,
    height: isTablet ? 44 : 40,
    borderRadius: isTablet ? 22 : 20,
    backgroundColor: '#e8f0fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assessmentFileDownloadButtonDisabled: {
    backgroundColor: '#f1f3f4',
  },
  assessmentFileCardDownloaded: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  // Multiple Files Section Styles
  filesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: isTablet ? 14 : 12,
  },
  filesSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isTablet ? 10 : 8,
  },
  sectionHeaderText: {
    fontSize: isTablet ? 18 : 16,
    fontWeight: '600',
    color: '#4285f4',
  },
  downloadedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: isTablet ? 10 : 8,
    paddingVertical: isTablet ? 5 : 4,
    borderRadius: 12,
  },
  downloadedBadgeText: {
    fontSize: isTablet ? 13 : 12,
    fontWeight: '500',
    color: '#16a34a',
  },
  fileItemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isTablet ? 10 : 8,
  },
  offlineAvailableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  offlineAvailableText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#16a34a',
  },
  // FileViewer Modal Styles
  fileViewerContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  fileViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: isTablet ? 20 : 16,
    paddingVertical: isTablet ? 14 : 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  fileViewerCloseButton: {
    padding: isTablet ? 10 : 8,
  },
  fileViewerTitle: {
    flex: 1,
    fontSize: isTablet ? 18 : 16,
    fontWeight: '600',
    color: '#1f2937',
    marginHorizontal: isTablet ? 14 : 12,
    textAlign: 'center',
  },
  fileViewerShareButton: {
    padding: isTablet ? 10 : 8,
  },
  fileViewerContent: {
    flex: 1,
  },
  // Multiple Assessment Links List Styles
  linksListContainer: {
    gap: isTablet ? 12 : 10,
  },
  assessmentLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: isTablet ? 12 : 10,
    padding: isTablet ? 16 : 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  assessmentLinkCardDisabled: {
    opacity: 0.6,
  },
  assessmentLinkIconContainer: {
    width: isTablet ? 48 : 42,
    height: isTablet ? 48 : 42,
    borderRadius: isTablet ? 24 : 21,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: isTablet ? 14 : 12,
  },
  assessmentLinkInfoContainer: {
    flex: 1,
    marginRight: isTablet ? 14 : 12,
  },
  assessmentLinkTitleText: {
    fontSize: isTablet ? 16 : 14,
    fontWeight: '500',
    color: '#202124',
    marginBottom: 2,
  },
  assessmentLinkUrlText: {
    fontSize: isTablet ? 13 : 12,
    color: '#6366f1',
  },
});