import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// File viewing delegated to Android - no compatibility detection needed
import {
  getCompletedOfflineQuizzes,
  getMaterialDetailsFromDb,
  getMaterialFullDetailsFromDb,
  getUnsyncedSubmissions,
  saveMaterialFullDetailsToDb,
} from '@/lib/localDb';
import { syncAllOfflineData } from '@/lib/offlineSync';
import * as IntentLauncher from 'expo-intent-launcher';
import { detectFileType } from '../../../../components/FileViewer';
import DownloadProgressOverlay from '../../../../components/ui/DownloadProgressOverlay';
import FileActionSheet from '../../../../components/ui/FileActionSheet';
import { useNetworkStatus } from '../../../../context/NetworkContext';
import api, { getAuthorizationHeader, getUserData, initializeAuth } from '../../../../lib/api';
import { saveFileToDownloadsAuto } from '../../../../lib/downloadUtils';

// Downloaded file tracking interface
interface DownloadedFileInfo {
  uri: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  downloadDate: string;
  materialFileIndex?: number;
}

// File item in the files array
interface MaterialFile {
  path: string;
  original_name: string;
  size: number;
  type: string;
  extension: string;
}

// Link item in the links array
interface MaterialLink {
  url: string;
  title?: string;
}

interface MaterialDetail {
  id: number;
  title: string;
  description?: string;
  file_path?: string;
  content?: string;
  material_type?: string;
  created_at: string;
  available_at?: string;
  unavailable_at?: string;
  formatted_file_size?: string;
  // Multiple files and links support
  files?: MaterialFile[];
  links?: MaterialLink[];
}

type FileType = 'image' | 'pdf' | 'document' | 'video' | 'audio' | 'code' | 'other';

const getFileExtension = (nameOrPath: string): string => {
  const base = (nameOrPath || '').split('?')[0].split('#')[0];
  const ext = base.split('.').pop()?.toLowerCase();
  if (!ext || ext === base.toLowerCase()) return '';
  return ext;
};

const isOfficeExtension = (extension?: string): boolean => {
  const ext = (extension || '').toLowerCase();
  return ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
};

const isOfficeFileName = (nameOrPath: string): boolean => isOfficeExtension(getFileExtension(nameOrPath));

const getMimeType = (filePath: string): string => {
  const extension = filePath.split('.').pop()?.toLowerCase();
  switch (extension) {
    // Documents
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'ppt':
      return 'application/vnd.ms-powerpoint';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'txt':
      return 'text/plain';

    // Images
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'bmp':
      return 'image/bmp';
    case 'svg':
      return 'image/svg+xml';

    // Audio
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'm4a':
      return 'audio/mp4';
    case 'ogg':
      return 'audio/ogg';

    // Video
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'mkv':
      return 'video/x-matroska';
    case 'webm':
      return 'video/webm';

    // Code (as text)
    case 'js':
      return 'text/javascript';
    case 'json':
      return 'application/json';
    case 'html':
      return 'text/html';
    case 'css':
      return 'text/css';

    // Fallback
    default:
      return 'application/octet-stream';
  }
};

const getMaterialIcon = (type: string) => {
  const lowerType = type.toLowerCase();
  switch (lowerType) {
    case 'document':
      return 'document-text';
    case 'video':
      return 'videocam';
    case 'link':
      return 'link';
    case 'presentation':
      return 'easel';
    case 'spreadsheet':
      return 'grid';
    case 'audio':
      return 'musical-notes';
    case 'image':
      return 'image';
    case 'pdf':
      return 'document-attach';
    case 'code':
      return 'code-slash';
    default:
      return 'folder';
  }
};

/**
 * Validates downloaded file by checking for obvious HTML error pages.
 * Only rejects files that are clearly HTML error responses.
 * Returns true if file seems valid, false if it should be rejected.
 */
/**
 * Validates downloaded file to ensure server returned the actual file, not an HTML error page.
 * Returns { valid: true } if file is OK, or { valid: false, reason: string } if file should be rejected.
 */
const validateDownloadedFile = async (
  fileUri: string,
  fileName: string,
  extension: string
): Promise<boolean> => {
  try {
    const ext = (extension || getFileExtension(fileName)).toLowerCase();

    // Check file exists and has content
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists || !('size' in fileInfo) || fileInfo.size === 0) {
      console.log(`File "${fileName}" is empty or doesn't exist.`);
      return false;
    }

    // Read the first bytes to check for HTML response
    let head = '';
    try {
      head = await FileSystem.readAsStringAsync(fileUri, {
        encoding: 'utf8',
        length: 512,
        position: 0,
      } as any);
    } catch {
      // If we can't read as string, it's likely a valid binary file
      console.log(`File "${fileName}" is binary, passed validation.`);
      return true;
    }

    const normalizedHead = (head || '').replace(/^\uFEFF/, '').trimStart().toLowerCase();
    
    // Check if server returned HTML instead of the expected file
    // This catches: login pages, error pages, 404 pages, etc.
    const isHtml = normalizedHead.startsWith('<!doctype html') || 
                   normalizedHead.startsWith('<html') ||
                   normalizedHead.startsWith('<?xml') && normalizedHead.includes('<html');
    
    // If we got HTML but expected a non-HTML file, reject it
    const htmlExtensions = ['html', 'htm', 'xhtml'];
    if (isHtml && !htmlExtensions.includes(ext)) {
      console.log(`File "${fileName}" (expected ${ext}) received HTML response instead. Server error.`);
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      return false;
    }

    // For PDF files, verify it has the PDF signature
    if (ext === 'pdf') {
      if (!normalizedHead.includes('%pdf')) {
        console.log(`File "${fileName}" does not have PDF signature.`);
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
        return false;
      }
    }

    // For common binary formats, do a quick magic byte check
    const binarySignatures: { [key: string]: string[] } = {
      'jpg': ['\xff\xd8\xff'],
      'jpeg': ['\xff\xd8\xff'],
      'png': ['\x89png', '\x89PNG'],
      'gif': ['gif87a', 'gif89a', 'GIF87a', 'GIF89a'],
      'zip': ['pk\x03\x04', 'PK\x03\x04'],
      'rar': ['rar!'],
      'mp3': ['id3', 'ID3', '\xff\xfb', '\xff\xfa'],
      'mp4': ['ftyp', '\x00\x00\x00'],
    };
    
    if (binarySignatures[ext]) {
      const signatures = binarySignatures[ext];
      const hasValidSignature = signatures.some(sig => 
        normalizedHead.includes(sig.toLowerCase()) || head.includes(sig)
      );
      // Don't reject based on signature alone - some files may have different headers
      // Just log for debugging
      if (!hasValidSignature) {
        console.log(`File "${fileName}" may have unexpected format, but allowing it.`);
      }
    }

    console.log(`File "${fileName}" passed validation (size: ${fileInfo.size} bytes)`);
    return true;
  } catch (error: any) {
    // If validation fails for any reason, allow the file and let external app decide
    console.log(`File validation error (${error?.message}). Allowing file anyway.`);
    return true;
  }
};

const getMaterialColor = (type: string) => {
  const lowerType = type.toLowerCase();
  switch (lowerType) {
    case 'document':
      return '#1967d2';
    case 'video':
      return '#ea4335';
    case 'link':
      return '#0d9488';
    case 'presentation':
      return '#f59e0b';
    case 'spreadsheet':
      return '#16a34a';
    case 'audio':
      return '#9333ea';
    case 'image':
      return '#06b6d4';
    case 'pdf':
      return '#dc2626';
    case 'code':
      return '#6366f1';
    default:
      return '#6c757d';
  }
};

// Helper function to get icon by file extension
const getFileIconByExtension = (extension?: string): string => {
  const ext = extension?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return 'document-attach';
  if (['doc', 'docx'].includes(ext)) return 'document-text';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'grid';
  if (['ppt', 'pptx'].includes(ext)) return 'easel';
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext)) return 'videocam';
  if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(ext)) return 'musical-notes';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['js', 'ts', 'py', 'php', 'html', 'css', 'json', 'xml'].includes(ext)) return 'code-slash';
  if (['txt', 'md', 'log'].includes(ext)) return 'document-text';
  return 'document';
};

// Helper function to get color by file extension
const getFileColorByExtension = (extension?: string): string => {
  const ext = extension?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return '#dc2626';
  if (['doc', 'docx'].includes(ext)) return '#2563eb';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '#16a34a';
  if (['ppt', 'pptx'].includes(ext)) return '#f59e0b';
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) return '#8b5cf6';
  if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext)) return '#ec4899';
  if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(ext)) return '#06b6d4';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '#78716c';
  if (['js', 'ts', 'py', 'php', 'html', 'css', 'json', 'xml'].includes(ext)) return '#6366f1';
  return '#6b7280';
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Responsive design helper
const isTablet = screenWidth >= 768;
const isLargeTablet = screenWidth >= 1024;
const contentMaxWidth = isLargeTablet ? 900 : isTablet ? 700 : screenWidth;

export default function MaterialDetailsScreen() {
  const { id: courseId, materialId } = useLocalSearchParams();
  const { isConnected, netInfo } = useNetworkStatus();
  const insets = useSafeAreaInsets();

  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<'info' | 'warning'>('info');

  const showToast = useCallback((message: string, variant: 'info' | 'warning' = 'info') => {
    setToastMessage(message);
    setToastVariant(variant);

    if (toastHideTimer.current) {
      clearTimeout(toastHideTimer.current);
      toastHideTimer.current = null;
    }

    toastAnim.stopAnimation();
    Animated.timing(toastAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();

    toastHideTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setToastMessage(null);
      });
    }, 2600);
  }, [toastAnim]);

  useEffect(() => {
    return () => {
      if (toastHideTimer.current) {
        clearTimeout(toastHideTimer.current);
        toastHideTimer.current = null;
      }
    };
  }, []);

  const [materialDetail, setMaterialDetail] = useState<MaterialDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadedFileUri, setDownloadedFileUri] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [downloadDate, setDownloadDate] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showDownloadOverlay, setShowDownloadOverlay] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<'downloading' | 'processing' | 'complete' | 'error'>('downloading');
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);

  // State for multiple downloaded files
  const [downloadedFiles, setDownloadedFiles] = useState<DownloadedFileInfo[]>([]);
  // Removed in-app viewer states - OLIN now delegates file viewing to external apps
  const [currentDownloadingFileIndex, setCurrentDownloadingFileIndex] = useState<number | null>(null);
  
  // State for file action sheet (when user taps download icon on a file)
  const [selectedFileForAction, setSelectedFileForAction] = useState<{file: MaterialFile, index: number} | null>(null);
  const [showFileActionSheet, setShowFileActionSheet] = useState(false);

  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const downloadsLoadedRef = useRef(false);

  const getDownloadsStorageKey = useCallback(() => {
    if (!currentUserEmail || !materialId) return null;
    return `material_downloads:${currentUserEmail}:${materialId}`;
  }, [currentUserEmail, materialId]);

  const extractBearerToken = useCallback((): string | null => {
    try {
      const authHeader = getAuthorizationHeader();
      if (!authHeader || typeof authHeader !== 'string') return null;
      const token = authHeader.replace('Bearer', '').trim();
      return token || null;
    } catch {
      return null;
    }
  }, []);

  const buildMaterialViewUrl = useCallback(
    (opts?: { fileIndex?: number; includeToken?: boolean; includeTimestamp?: boolean }) => {
      if (!materialDetail?.id) return null;

      const params: string[] = [];
      if (typeof opts?.fileIndex === 'number') params.push(`file_index=${opts.fileIndex}`);

      if (opts?.includeToken) {
        const token = extractBearerToken();
        if (token) params.push(`token=${encodeURIComponent(token)}`);
      }

      if (opts?.includeTimestamp) {
        params.push(`t=${new Date().getTime()}`);
      }

      const qs = params.length ? `?${params.join('&')}` : '';
      return `${api.defaults.baseURL}/materials/${materialDetail.id}/view${qs}`;
    },
    [extractBearerToken, materialDetail?.id]
  );

  const sanitizeFileName = useCallback((name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_'), []);

  const buildSafeDownloadedFileName = useCallback(
    (originalName: string, opts?: { extensionOverride?: string; fileIndex?: number }) => {
      const maxLen = 120;
      const safeOriginal = (originalName || 'file').trim();

      const lastDot = safeOriginal.lastIndexOf('.');
      const parsedBase = lastDot > 0 ? safeOriginal.slice(0, lastDot) : safeOriginal;
      const parsedExt = lastDot > 0 ? safeOriginal.slice(lastDot + 1) : '';

      const ext = (opts?.extensionOverride || parsedExt)
        .replace(/^\./, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();

      const base = parsedBase
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/\.+$/, '')
        .substring(0, 200);

      const idPart = materialDetail?.id ? String(materialDetail.id) : 'material';
      const indexPart = typeof opts?.fileIndex === 'number' ? `_${opts.fileIndex}` : '';
      const suffix = `_${idPart}${indexPart}`;
      const extPart = ext ? `.${ext}` : '';

      const maxBaseLen = Math.max(12, maxLen - suffix.length - extPart.length);
      const trimmedBase = base.length > maxBaseLen ? base.slice(0, maxBaseLen) : base;

      return `${trimmedBase}${suffix}${extPart}`;
    },
    [materialDetail?.id]
  );

  const openLocalFileInAnotherApp = useCallback(async (localUri: string, fileName?: string) => {
    if (!localUri) return;

    if (Platform.OS === 'android') {
      try {
        const contentUri = await FileSystem.getContentUriAsync(localUri);
        // Use fileName if provided for accurate MIME type detection, fallback to URI
        const mimeType = getMimeType(fileName || localUri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1,
          type: mimeType,
        });
      } catch (error) {
        console.error('Error opening file with IntentLauncher', error);
        Alert.alert('Error', 'No app found to open this file. Please install an app that can handle this file type.');
      }
      return;
    }

    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri, {
          mimeType: getMimeType(fileName || localUri),
          dialogTitle: fileName ? `Open ${fileName}` : undefined,
        });
      } else {
        Alert.alert('Not available', 'File opening is not available on this device.');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not open the file.');
    }
  }, []);

  const tempDownloadAndOpenInViewer = useCallback(
    async (opts: { fileIndex?: number; fileName: string }) => {
      if (!materialDetail?.id) return;

      // If already downloaded, open with external app.
      if (typeof opts.fileIndex === 'number') {
        const existing = downloadedFiles.find((d) => d.materialFileIndex === opts.fileIndex);
        if (existing?.uri) {
          await openLocalFileInAnotherApp(existing.uri, existing.fileName);
          return;
        }
      } else if (downloadedFileUri) {
        await openLocalFileInAnotherApp(downloadedFileUri, opts.fileName);
        return;
      }

      if (!netInfo?.isInternetReachable) {
        Alert.alert('Offline Mode', 'Internet connection required to download.');
        return;
      }

      const fileType = detectFileType(opts.fileName || '') || 'other';
      if (fileType === 'audio') {
        showToast('Audio must be downloaded first to play.', 'info');
        return;
      }

      const authHeader = getAuthorizationHeader();
      if (!authHeader) {
        Alert.alert('Authentication Required', 'Please login again.');
        return;
      }

      const downloadUrl = buildMaterialViewUrl({
        fileIndex: opts.fileIndex,
        includeToken: true,
        includeTimestamp: true,
      });
      if (!downloadUrl) return;

      // Close any open sheets first
      setShowActionSheet(false);
      setShowFileActionSheet(false);

      setCurrentDownloadingFileIndex(typeof opts.fileIndex === 'number' ? opts.fileIndex : null);
      setIsDownloading(true);
      setDownloadProgress(0);
      setDownloadedBytes(0);
      setTotalBytes(0);
      setDownloadStatus('downloading');
      setShowDownloadOverlay(true);

      try {
        const safeName = sanitizeFileName(opts.fileName || 'file');
        const ext = (opts.fileName.split('.').pop() || '').toLowerCase();
        const hasExt = ext.length > 0 && ext.length <= 6;
        const cacheBase = (FileSystem.cacheDirectory || FileSystem.documentDirectory) as string;
        const cacheUri = `${cacheBase}temp_view_${materialDetail.id}_${typeof opts.fileIndex === 'number' ? opts.fileIndex : 'single'}_${safeName}${hasExt ? '' : ''}`;

        const downloadResumable = FileSystem.createDownloadResumable(
          downloadUrl,
          cacheUri,
          { headers: { Authorization: String(authHeader) } },
          ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
            if (totalBytesExpectedToWrite > 0) {
              const progress = totalBytesWritten / totalBytesExpectedToWrite;
              setDownloadProgress(Math.round(progress * 100));
              setDownloadedBytes(totalBytesWritten);
              setTotalBytes(totalBytesExpectedToWrite);
            }
          }
        );

        const result = await downloadResumable.downloadAsync();
        if (!result?.uri) throw new Error('Download failed - no file produced.');

        setDownloadStatus('processing');
        const info = await FileSystem.getInfoAsync(result.uri);
        if (!info.exists || !('size' in info) || !info.size || info.size <= 0) {
          throw new Error('Download produced an empty file.');
        }

        // Open with external app
        await openLocalFileInAnotherApp(result.uri, opts.fileName);
        setDownloadStatus('complete');

        setTimeout(() => setShowDownloadOverlay(false), 900);
      } catch (error: any) {
        console.error('Download error:', error);
        setDownloadStatus('error');
        setTimeout(() => {
          setShowDownloadOverlay(false);
          Alert.alert('Download Failed', error?.message || 'Could not download this file.');
        }, 1200);
      } finally {
        setIsDownloading(false);
        setDownloadProgress(0);
        setCurrentDownloadingFileIndex(null);
      }
    },
    [
      buildMaterialViewUrl,
      downloadedFileUri,
      downloadedFiles,
      materialDetail?.id,
      netInfo?.isInternetReachable,
      openLocalFileInAnotherApp,
      sanitizeFileName,
      showToast,
    ]
  );

  useEffect(() => {
    initializeAuth();
    if (materialId) {
      fetchMaterialDetails();
    }
  }, [materialId, netInfo?.isInternetReachable]);

  useEffect(() => {
    const loadPersistedDownloads = async () => {
      const key = getDownloadsStorageKey();
      if (!key) return;
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) {
          downloadsLoadedRef.current = true;
          return;
        }

        const parsed = JSON.parse(raw) as DownloadedFileInfo[];
        if (!Array.isArray(parsed)) {
          downloadsLoadedRef.current = true;
          return;
        }

        // Drop entries that no longer exist on disk
        const verified: DownloadedFileInfo[] = [];
        for (const item of parsed) {
          if (!item?.uri) continue;
          try {
            const info = await FileSystem.getInfoAsync(item.uri);
            if (info.exists && 'size' in info && info.size && info.size > 0) verified.push(item);
          } catch {
            // ignore
          }
        }

        setDownloadedFiles(verified);
      } catch (e) {
        console.warn('Failed to load persisted downloads:', e);
      } finally {
        downloadsLoadedRef.current = true;
      }
    };

    loadPersistedDownloads();
  }, [getDownloadsStorageKey]);

  useEffect(() => {
    const persistDownloads = async () => {
      if (!downloadsLoadedRef.current) return;
      const key = getDownloadsStorageKey();
      if (!key) return;
      try {
        await AsyncStorage.setItem(key, JSON.stringify(downloadedFiles));
      } catch (e) {
        console.warn('Failed to persist downloads:', e);
      }
    };

    persistDownloads();
  }, [downloadedFiles, getDownloadsStorageKey]);

  useEffect(() => {
    const submitOfflineAssessments = async () => {
      if (netInfo?.isInternetReachable) {
        try {
          const userData = await getUserData();
          if (userData?.email) {
            const unsyncedSubmissions = await getUnsyncedSubmissions(userData.email);
            const completedOfflineQuizzes = await getCompletedOfflineQuizzes(userData.email);

            if (unsyncedSubmissions.length > 0 || completedOfflineQuizzes.length > 0) {
              await syncAllOfflineData();
              setTimeout(() => {
                fetchMaterialDetails();
              }, 1000);
            }
          }
        } catch (error) {
          console.error('❌ Error submitting offline assessments:', error);
        }
      }
    };

    submitOfflineAssessments();
  }, [netInfo?.isInternetReachable]);

  const fetchMaterialDetails = async () => {
    setLoading(true);
    setError(null);
    
    const user = await getUserData();
    const userEmail = user?.email;

    if (userEmail) setCurrentUserEmail(userEmail);

    if (!userEmail) {
      setError('User not logged in.');
      setLoading(false);
      return;
    }

    try {
      if (netInfo?.isInternetReachable) {
        const response = await api.get(`/materials/${materialId}`);
        if (response.status === 200) {
          const material = response.data.material;
          setMaterialDetail(material);

          // Cache full material details for offline viewing (keeps files/links visible offline)
          await saveMaterialFullDetailsToDb(Number(materialId), userEmail, material);

          if (material.formatted_file_size) {
            setFileSize(material.formatted_file_size);
          }
          
          if (material.file_path) {
            await checkIfFileDownloaded(material);
          }
        } else {
          const errorMessage = response.data?.message || 'Failed to fetch material details.';
          setError(errorMessage);
        }
      } else {
        const offlineMaterial = await getMaterialDetailsFromDb(Number(materialId), userEmail);
        const fullOfflineMaterial = await getMaterialFullDetailsFromDb(Number(materialId), userEmail);

        const merged = {
          ...(offlineMaterial || {}),
          ...(fullOfflineMaterial || {}),
          // prefer fullOfflineMaterial for rich arrays
          files: (fullOfflineMaterial as any)?.files ?? (offlineMaterial as any)?.files,
          links: (fullOfflineMaterial as any)?.links ?? (offlineMaterial as any)?.links,
        } as MaterialDetail;

        if (offlineMaterial || fullOfflineMaterial) {
          setMaterialDetail(merged);
          if (merged.file_path) {
            await checkIfFileDownloaded(merged);
          }
        } else {
          setError('Offline: Material details not available locally.');
        }
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Network error or unable to load material details.';
      setError(errorMessage);
    } finally {
      setLoading(false);
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

  const checkIfFileDownloaded = async (material: MaterialDetail): Promise<boolean> => {
    if (!material.file_path || !material.id) return false;

    const fileExtension = material.file_path.split('.').pop();
    const sanitizedTitle = material.title.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${sanitizedTitle}_${material.id}${fileExtension ? `.${fileExtension}` : ''}`;
    const localUri = FileSystem.documentDirectory + fileName;

    try {
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists && fileInfo.size > 0) {
        setDownloadedFileUri(localUri);
        setFileSize(formatBytes(fileInfo.size));
        setDownloadDate(new Date(fileInfo.modificationTime * 1000).toLocaleDateString());
        return true; // FIX: Explicitly return true
      }
    } catch (error) {
      console.log('File not downloaded yet or error checking:', error);
    }
    return false; // FIX: Explicitly return false
  };

  const getFileType = (filePath: string): FileType => {
    if (!filePath) return 'other';
    const extension = filePath.split('.').pop()?.toLowerCase();

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension || '')) return 'image';
    if (['pdf'].includes(extension || '')) return 'pdf';
    if (['doc', 'docx', 'txt', 'rtf', 'odt', 'ppt', 'pptx', 'xls', 'xlsx'].includes(extension || '')) return 'document';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp', 'm4v'].includes(extension || '')) return 'video';
    if (['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac'].includes(extension || '')) return 'audio';
    if (
      ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'dart', 'html', 'css', 'scss', 'json', 'xml', 'sql', 'sh', 'md'].includes(
        extension || ''
      )
    )
      return 'code';

    return 'other';
  };

  const getLegacySingleFileViewerName = (): string => {
    const title = materialDetail?.title || 'File';
    const filePath = materialDetail?.file_path || '';
    const ext = filePath.split('.').pop()?.toLowerCase();

    if (ext && !title.toLowerCase().endsWith(`.${ext}`)) {
      return `${title}.${ext}`;
    }

    const baseName = filePath.split('/').pop();
    return baseName || title;
  };

  const getFileIcon = (fileType: FileType) => {
    switch (fileType) {
      case 'image':
        return 'image';
      case 'pdf':
        return 'document-text';
      case 'document':
        return 'document';
      case 'video':
        return 'videocam';
      case 'audio':
        return 'musical-notes';
      case 'code':
        return 'code-slash';
      default:
        return 'attach';
    }
  };

  const getAuthenticatedFileUrl = async (fileIndex?: number): Promise<string | null> => {
    if (!materialDetail?.id) return null;

    try {
      const authHeader = getAuthorizationHeader();
      
      // Safety check: ensure authHeader is a string
      if (!authHeader || typeof authHeader !== 'string') {
        console.error('Invalid auth header format');
        return null;
      }

      // Robust token extraction
      const token = authHeader.replace('Bearer ', '').trim();

      if (!token) {
        console.error('Empty token extracted');
        return null;
      }

      // Append a timestamp to prevent aggressive caching of broken attempts
      const timestamp = new Date().getTime();
      const url = `${api.defaults.baseURL}/materials/${materialDetail.id}/view?token=${encodeURIComponent(token)}${typeof fileIndex === 'number' ? `&file_index=${fileIndex}` : ''}&t=${timestamp}`;

      return url;
    } catch (error) {
      console.error('Failed to build authenticated file URL', error);
      return null;
    }
  };

  // *** MODIFIED *** - Added offline check
  const handleOpenLink = async (url: string) => {
    if (!netInfo?.isInternetReachable) {
      Alert.alert('Offline Mode', 'An internet connection is required to open this link.');
      return;
    }
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Cannot open this link.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open the link.');
    }
  };

  // Handle tapping on a file from the files list
  const handleFileCardPress = (file: MaterialFile, fileIndex: number) => {
    // Check if file is already downloaded
    const existingDownload = downloadedFiles.find(d => d.materialFileIndex === fileIndex);
    if (existingDownload) {
      // File is downloaded - open with external app
      openLocalFileInAnotherApp(existingDownload.uri, existingDownload.fileName);
      return;
    }

    if (!netInfo?.isInternetReachable) {
      showToast('Offline: download requires internet. Tap ⋯ when online.', 'warning');
      return;
    }

    // Show download options
    setSelectedFileForAction({ file, index: fileIndex });
    setShowFileActionSheet(true);
  };

  // Download file to app storage (from files list)
  const downloadFileToApp = async (
    file: MaterialFile,
    fileIndex: number,
    opts?: { afterDownload?: 'open' }
  ) => {
    setShowFileActionSheet(false);
    setCurrentDownloadingFileIndex(fileIndex);
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setDownloadStatus('downloading');
    setShowDownloadOverlay(true);

    try {
      const downloadUrl = buildMaterialViewUrl({ fileIndex, includeToken: true, includeTimestamp: true });
      if (!downloadUrl) throw new Error('Missing download URL');
      const fileName = buildSafeDownloadedFileName(file.original_name, {
        extensionOverride: file.extension || getFileExtension(file.original_name),
        fileIndex,
      });
      const localUri = FileSystem.documentDirectory + fileName;

      console.log('Downloading file to app:', downloadUrl);

      const authHeader = getAuthorizationHeader();
      if (!authHeader) {
        throw new Error('Authentication required. Please login again.');
      }

      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        localUri,
        { headers: { Authorization: String(authHeader) } },
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            const progress = totalBytesWritten / totalBytesExpectedToWrite;
            setDownloadProgress(Math.round(progress * 100));
            setDownloadedBytes(totalBytesWritten);
            setTotalBytes(totalBytesExpectedToWrite);
          }
        }
      );

      const result = await downloadResumable.downloadAsync();

      if (!result || result.status !== 200) {
        throw new Error(`Download failed, server returned status ${result?.status || 'unknown'}`);
      }

      if (result?.uri) {
        setDownloadStatus('processing');
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        
        if (fileInfo.exists && 'size' in fileInfo && fileInfo.size > 0) {
          // Validate downloaded file against all file types (not just PDFs)
          const ext = file.extension || getFileExtension(file.original_name);
          const isValid = await validateDownloadedFile(result.uri, file.original_name, ext);
          
          if (!isValid) {
            throw new Error('Downloaded file failed validation. The server may have returned an error page or incorrect file format.');
          }

          const newDownloadedFile: DownloadedFileInfo = {
            uri: result.uri,
            fileName: file.original_name,
            fileSize: fileInfo.size,
            fileType: detectFileType(file.original_name) || 'other',
            downloadDate: new Date().toLocaleDateString(),
            materialFileIndex: fileIndex,
          };
          
          setDownloadedFiles(prev => [...prev, newDownloadedFile]);
          setDownloadStatus('complete');

          // After download, open file with external app if requested
          if (opts?.afterDownload === 'open') {
            setTimeout(async () => {
              setShowDownloadOverlay(false);
              await openLocalFileInAnotherApp(result.uri, file.original_name);
            }, 800);
          } else {
            setTimeout(() => {
              setShowDownloadOverlay(false);
              Alert.alert(
                'Download Complete',
                `"${file.original_name}" saved for offline access.`,
                [
                  { text: 'Done', style: 'cancel' },
                  { text: 'Open File', onPress: () => openLocalFileInAnotherApp(result.uri, file.original_name) },
                ]
              );
            }, 1200);
          }
          
          console.log('File downloaded:', result.uri);
        } else {
          throw new Error('Downloaded file is corrupted or empty.');
        }
      } else {
        throw new Error('Download failed - no result URI.');
      }
    } catch (error: any) {
      console.error('Error downloading file to app:', error);
      setDownloadStatus('error');
      setTimeout(() => {
        setShowDownloadOverlay(false);
        Alert.alert('Download Failed', error?.message || 'Failed to download file. Please try again.');
      }, 2000);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setCurrentDownloadingFileIndex(null);
    }
  };

  const saveFileToDeviceAndroid = async (sourceFileUri: string, targetFileName: string, mimeType: string) => {
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) {
      throw new Error('Save cancelled.');
    }

    const directoryUri = permissions.directoryUri;
    const destUri = await FileSystem.StorageAccessFramework.createFileAsync(directoryUri, targetFileName, mimeType);
    const base64 = await FileSystem.readAsStringAsync(sourceFileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.StorageAccessFramework.writeAsStringAsync(destUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  };

  const exportLocalFileToDevice = async (localUri: string, suggestedFileName: string) => {
    if (!localUri) return;
    try {
      if (Platform.OS === 'android') {
        await saveFileToDeviceAndroid(localUri, suggestedFileName, getMimeType(suggestedFileName));
        Alert.alert('Saved', 'File saved to your selected folder.');
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri, {
          dialogTitle: 'Save file',
          mimeType: getMimeType(suggestedFileName),
        });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save file.');
    }
  };

  // Download file to device Downloads folder (from files list)
  const downloadFileToDevice = async (file: MaterialFile, fileIndex: number) => {
    setShowFileActionSheet(false);
    setCurrentDownloadingFileIndex(fileIndex);
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setDownloadStatus('downloading');
    setShowDownloadOverlay(true);

    try {
      const downloadUrl = buildMaterialViewUrl({ fileIndex, includeToken: true, includeTimestamp: true });
      if (!downloadUrl) throw new Error('Missing download URL');
      const fileName = buildSafeDownloadedFileName(file.original_name, {
        extensionOverride: file.extension || getFileExtension(file.original_name),
        fileIndex,
      });
      const tempUri = FileSystem.cacheDirectory + fileName;

      console.log('Downloading file to device:', downloadUrl);

      const authHeader = getAuthorizationHeader();
      if (!authHeader) {
        throw new Error('Authentication required. Please login again.');
      }

      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        tempUri,
        { headers: { Authorization: String(authHeader) } },
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            const progress = totalBytesWritten / totalBytesExpectedToWrite;
            setDownloadProgress(Math.round(progress * 100));
            setDownloadedBytes(totalBytesWritten);
            setTotalBytes(totalBytesExpectedToWrite);
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result || result.status !== 200) {
        throw new Error('Download failed, server returned status ' + result?.status);
      }

      // Validate the downloaded file before saving to device
      const ext = file.extension || getFileExtension(file.original_name);
      const isValid = await validateDownloadedFile(result.uri, file.original_name, ext);
      if (!isValid) {
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
        throw new Error('The server returned an error page instead of the file. Please check your connection and try again.');
      }

      setDownloadStatus('processing');
      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) {
          throw new Error('Save cancelled.');
        }

        const directoryUri = permissions.directoryUri;
        const destUri = await FileSystem.StorageAccessFramework.createFileAsync(directoryUri, fileName, getMimeType(fileName));
        const base64 = await FileSystem.readAsStringAsync(result.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.StorageAccessFramework.writeAsStringAsync(destUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(result.uri, {
            dialogTitle: 'Save file',
            mimeType: getMimeType(fileName),
          });
        } else {
          throw new Error('Sharing is not available on this device.');
        }
      }

      await FileSystem.deleteAsync(tempUri, { idempotent: true });

      setDownloadStatus('complete');
      console.log('File saved to device:', fileName);
      
      setTimeout(() => {
        setShowDownloadOverlay(false);
        Alert.alert(
          'Download Complete', 
          Platform.OS === 'android'
            ? `"${file.original_name}" has been saved to your selected folder.`
            : `"${file.original_name}" has been exported using the share sheet.`
        );
      }, 1500);

    } catch (error: any) {
      console.error('Error downloading file to device:', error);
      setDownloadStatus('error');
      setTimeout(() => {
        setShowDownloadOverlay(false);
        Alert.alert('Download Failed', error?.message || 'Failed to save file. Please try again.');
      }, 2000);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setCurrentDownloadingFileIndex(null);
    }
  };

  // Auto-save file to device without folder picker
  const downloadFileToDeviceAuto = async (file: MaterialFile, fileIndex: number) => {
    setShowFileActionSheet(false);
    setCurrentDownloadingFileIndex(fileIndex);
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setDownloadStatus('downloading');
    setShowDownloadOverlay(true);

    try {
      const downloadUrl = buildMaterialViewUrl({ fileIndex, includeToken: true, includeTimestamp: true });
      if (!downloadUrl) throw new Error('Missing download URL');
      const fileName = buildSafeDownloadedFileName(file.original_name, {
        extensionOverride: file.extension || getFileExtension(file.original_name),
        fileIndex,
      });
      const tempUri = FileSystem.cacheDirectory + fileName;

      console.log('Downloading file to device:', downloadUrl);

      const authHeader = getAuthorizationHeader();
      if (!authHeader) {
        throw new Error('Authentication required. Please login again.');
      }

      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        tempUri,
        { headers: { Authorization: String(authHeader) } },
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            const progress = totalBytesWritten / totalBytesExpectedToWrite;
            setDownloadProgress(Math.round(progress * 100));
            setDownloadedBytes(totalBytesWritten);
            setTotalBytes(totalBytesExpectedToWrite);
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result || result.status !== 200) {
        throw new Error('Download failed, server returned status ' + result?.status);
      }

      // Validate the downloaded file - ensure server didn't return HTML error page
      const isValid = await validateDownloadedFile(
        result.uri,
        fileName,
        file.extension || getFileExtension(file.original_name)
      );
      
      if (!isValid) {
        throw new Error('The server returned an error page instead of the file. Please check your connection and try again.');
      }

      setDownloadStatus('processing');

      // Use the new auto-save function
      const autoSaveResult = await saveFileToDownloadsAuto(result.uri, fileName, materialDetail?.id?.toString());
      
      await FileSystem.deleteAsync(tempUri, { idempotent: true });

      if (autoSaveResult.success) {
        setDownloadStatus('complete');
        console.log('File auto-saved to device:', fileName);
        
        setTimeout(() => {
          setShowDownloadOverlay(false);
          Alert.alert(
            'Download Complete', 
            `"${file.original_name}" has been saved to Downloads/OLIN/${materialDetail?.id || 'General'}/`
          );
        }, 1500);
      } else {
        throw new Error(autoSaveResult.error || 'Auto-save failed');
      }

    } catch (error: any) {
      console.error('Error auto-saving file to device:', error);
      setDownloadStatus('error');
      setTimeout(() => {
        setShowDownloadOverlay(false);
        Alert.alert('Download Failed', error?.message || 'Failed to save file. Please try again.');
      }, 2000);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setCurrentDownloadingFileIndex(null);
    }
  };

  // Delete a downloaded file
  const handleDeleteDownloadedFile = (fileIndex: number) => {
    const downloadedFile = downloadedFiles.find(d => d.materialFileIndex === fileIndex);
    if (!downloadedFile) return;

    Alert.alert(
      'Remove Download',
      `Are you sure you want to delete "${downloadedFile.fileName}" from your device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await FileSystem.deleteAsync(downloadedFile.uri, { idempotent: true });
              setDownloadedFiles(prev => prev.filter(d => d.materialFileIndex !== fileIndex));
              Alert.alert('Deleted', 'The file has been removed from your device.');
            } catch (error) {
              Alert.alert('Error', 'Could not delete the file. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Download all files to app storage
  const handleDownloadAllFiles = async () => {
    if (!materialDetail?.files || materialDetail.files.length === 0) return;
    if (!netInfo?.isInternetReachable) {
      Alert.alert('Offline Mode', 'File downloading requires an internet connection.');
      return;
    }

    const notDownloadedFiles = materialDetail.files.filter(
      (_, index) => !downloadedFiles.some(d => d.materialFileIndex === index)
    );

    if (notDownloadedFiles.length === 0) {
      Alert.alert('All Downloaded', 'All files are already downloaded to your device.');
      return;
    }

    Alert.alert(
      'Download All Files',
      `Download ${notDownloadedFiles.length} file(s) to your device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download All',
          onPress: async () => {
            // Download files sequentially
            const files = materialDetail.files || [];
            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              const isAlreadyDownloaded = downloadedFiles.some(d => d.materialFileIndex === i);
              
              if (!isAlreadyDownloaded) {
                await downloadFileToApp(file, i);
              }
            }
          },
        },
      ]
    );
  };

  // Delete all downloaded files
  const handleDeleteAllFiles = () => {
    if (downloadedFiles.length === 0) return;

    Alert.alert(
      'Delete All Downloads',
      `Are you sure you want to delete all ${downloadedFiles.length} downloaded file(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              for (const file of downloadedFiles) {
                await FileSystem.deleteAsync(file.uri, { idempotent: true });
              }
              setDownloadedFiles([]);
              Alert.alert('Deleted', 'All downloaded files have been removed.');
            } catch (error) {
              Alert.alert('Error', 'Could not delete some files. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Legacy function for single file download - kept for backward compatibility

  const handleOpenFileFromList = async (file: MaterialFile, fileIndex: number) => {
    handleFileCardPress(file, fileIndex);
  };

  const promptDownloadOptions = async () => {
    if (!netInfo?.isInternetReachable) {
      Alert.alert('Offline Mode', 'File downloading requires an internet connection.');
      return;
    }

    setShowActionSheet(true);
  };
  // Removed viewLegacySingleOnline and viewOnlineFileFromList (dead code)

  const openFileOptionsForListItem = (file: MaterialFile, index: number) => {
    setSelectedFileForAction({ file, index });
    setShowFileActionSheet(true);
  };

  const downloadToAppStorage = async (): Promise<string | null> => {
    if (!materialDetail?.file_path || !materialDetail?.id) {
      console.log('Download cancelled: Missing file_path or id');
      return null;
    }
    if (!netInfo?.isInternetReachable) {
      Alert.alert('Offline Mode', 'File downloading requires an internet connection.');
      return null;
    }
    if (downloadedFileUri) {
      console.log('Download cancelled: File already downloaded');
      return downloadedFileUri;
    }

    // Close action sheet first
    setShowActionSheet(false);

    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setDownloadStatus('downloading');
    setShowDownloadOverlay(true);

    try {
      // Note: MediaLibrary permission is NOT needed for saving to app's documentDirectory
      // Only needed if we want to save to the device's photo/media library
      
      const downloadUrl = buildMaterialViewUrl({ includeToken: true, includeTimestamp: true });
      if (!downloadUrl) throw new Error('Missing download URL');
      const fileExtension = materialDetail.file_path.split('.').pop();
      const sanitizedTitle = materialDetail.title.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${sanitizedTitle}_${materialDetail.id}${fileExtension ? `.${fileExtension}` : ''}`;
      const localUri = FileSystem.documentDirectory + fileName;

      console.log('Starting download to:', localUri);

      const authHeader = getAuthorizationHeader();
      if (!authHeader) {
        throw new Error('Authentication required. Please login again.');
      }

      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        localUri,
        { headers: { Authorization: String(authHeader) } },
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            const progress = totalBytesWritten / totalBytesExpectedToWrite;
            setDownloadProgress(Math.round(progress * 100));
            setDownloadedBytes(totalBytesWritten);
            setTotalBytes(totalBytesExpectedToWrite);
          }
        }
      );

      const result = await downloadResumable.downloadAsync();

      if (result?.uri) {
        setDownloadStatus('processing');
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        if (fileInfo.exists && 'size' in fileInfo && fileInfo.size > 0) {
          // Validate downloaded file against all file types (not just PDFs)
          const fileExt = materialDetail.file_path.split('.').pop() || '';
          const isValid = await validateDownloadedFile(result.uri, materialDetail.title, fileExt);
          
          if (!isValid) {
            throw new Error('Downloaded file failed validation. The server may have returned an error page or incorrect file format.');
          }

          setDownloadedFileUri(result.uri);
          setFileSize(formatBytes(fileInfo.size));
          // Safely handle modificationTime which may be undefined
          const modTime = 'modificationTime' in fileInfo && fileInfo.modificationTime 
            ? new Date(fileInfo.modificationTime * 1000).toLocaleDateString()
            : new Date().toLocaleDateString();
          setDownloadDate(modTime);
          setDownloadStatus('complete');
          
          console.log('Download complete:', result.uri);
          
          // Auto close after success
          setTimeout(() => {
            setShowDownloadOverlay(false);
          }, 1500);

          return result.uri;
        } else {
          throw new Error('Downloaded file is corrupted or empty.');
        }
      } else {
        throw new Error('Download failed - no result URI.');
      }
    } catch (err: any) {
      console.error('Download error:', err);
      setDownloadStatus('error');
      setTimeout(() => {
        setShowDownloadOverlay(false);
        Alert.alert(
          'Download Failed', 
          err?.message || 'Could not download the file. Please try again.'
        );
      }, 2000);
      return null;
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const downloadToDeviceExternal = async () => {
    if (!materialDetail?.file_path || !materialDetail?.id) {
      console.log('Save to Device cancelled: Missing file_path or id');
      return;
    }
    if (!netInfo?.isInternetReachable) {
      Alert.alert('Offline Mode', 'File downloading requires an internet connection.');
      return;
    }

    // Close action sheet first
    setShowActionSheet(false);
    
    // Show download overlay
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setDownloadStatus('downloading');
    setShowDownloadOverlay(true);

    // Set up file details
    const downloadUrl = buildMaterialViewUrl({ includeToken: true, includeTimestamp: true });
    if (!downloadUrl) {
      setShowDownloadOverlay(false);
      setIsDownloading(false);
      Alert.alert('Error', 'Missing download URL');
      return;
    }
    const fileExtension = materialDetail.file_path.split('.').pop();
    const sanitizedTitle = materialDetail.title.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${sanitizedTitle}_${materialDetail.id}${fileExtension ? `.${fileExtension}` : ''}`;
    const mimeType = getMimeType(materialDetail.file_path);

    try {
      // Download to cache first
      const tempUri = FileSystem.cacheDirectory + fileName;
      console.log('Downloading to temp file:', tempUri);

      const authHeader = getAuthorizationHeader();
      if (!authHeader) {
        throw new Error('Authentication required. Please login again.');
      }

      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        tempUri,
        { headers: { Authorization: String(authHeader) } },
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            const progress = totalBytesWritten / totalBytesExpectedToWrite;
            setDownloadProgress(Math.round(progress * 100));
            setDownloadedBytes(totalBytesWritten);
            setTotalBytes(totalBytesExpectedToWrite);
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result || result.status !== 200) {
        throw new Error('Download failed, server returned status ' + result?.status);
      }

      console.log('Temp download complete:', result.uri);
      setDownloadStatus('processing');

      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) {
          throw new Error('Save cancelled.');
        }

        const directoryUri = permissions.directoryUri;
        const destUri = await FileSystem.StorageAccessFramework.createFileAsync(directoryUri, fileName, mimeType);
        const base64 = await FileSystem.readAsStringAsync(result.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.StorageAccessFramework.writeAsStringAsync(destUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(result.uri, {
            dialogTitle: 'Save file',
            mimeType,
          });
        } else {
          throw new Error('Sharing is not available on this device.');
        }
      }
      
      // Clean up the temp file
      await FileSystem.deleteAsync(tempUri, { idempotent: true });

      setDownloadStatus('complete');
      console.log('File saved to device:', fileName);
      
      // Auto close after success
      setTimeout(() => {
        setShowDownloadOverlay(false);
        Alert.alert(
          'Download Complete', 
          Platform.OS === 'android'
            ? `"${materialDetail.title}" has been saved to your selected folder.`
            : `"${materialDetail.title}" has been exported using the share sheet.`
        );
      }, 1500);

    } catch (err: any) {
      console.error('Failed to download or save file:', err);
      setDownloadStatus('error');
      
      // Clean up temp file on error
      try {
        const tempUri = FileSystem.cacheDirectory + fileName;
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
      } catch (deleteErr) {
        console.error('Failed to delete temp file on error:', deleteErr);
      }

      setTimeout(() => {
        setShowDownloadOverlay(false);
        Alert.alert(
          'Download Failed', 
          err?.message || 'Could not save the file. Please try again.'
        );
      }, 2000);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  // Auto-save to Downloads without folder picker
  const downloadToDeviceExternalAuto = async () => {
    if (!materialDetail?.file_path || !materialDetail?.id) {
      console.log('Save to Device cancelled: Missing file_path or id');
      return;
    }
    if (!netInfo?.isInternetReachable) {
      Alert.alert('Offline Mode', 'File downloading requires an internet connection.');
      return;
    }

    // Close action sheet first
    setShowActionSheet(false);
    
    // Show download overlay
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setDownloadStatus('downloading');
    setShowDownloadOverlay(true);

    // Set up file details
    const downloadUrl = buildMaterialViewUrl({ includeToken: true, includeTimestamp: true });
    if (!downloadUrl) {
      setShowDownloadOverlay(false);
      setIsDownloading(false);
      Alert.alert('Error', 'Missing download URL');
      return;
    }
    const fileExtension = materialDetail.file_path.split('.').pop();
    const sanitizedTitle = materialDetail.title.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${sanitizedTitle}_${materialDetail.id}${fileExtension ? `.${fileExtension}` : ''}`;
    const mimeType = getMimeType(materialDetail.file_path);

    try {
      // Download to cache first
      const tempUri = FileSystem.cacheDirectory + fileName;
      console.log('Downloading to temp file:', tempUri);

      const authHeader = getAuthorizationHeader();
      if (!authHeader) {
        throw new Error('Authentication required. Please login again.');
      }

      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        tempUri,
        { headers: { Authorization: String(authHeader) } },
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            const progress = totalBytesWritten / totalBytesExpectedToWrite;
            setDownloadProgress(Math.round(progress * 100));
            setDownloadedBytes(totalBytesWritten);
            setTotalBytes(totalBytesExpectedToWrite);
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result || result.status !== 200) {
        throw new Error('Download failed, server returned status ' + result?.status);
      }

      console.log('Temp download complete:', result.uri);
      setDownloadStatus('processing');

      // Use the new auto-save function
      const autoSaveResult = await saveFileToDownloadsAuto(result.uri, fileName, materialDetail?.id?.toString());
      
      // Clean up the temp file
      await FileSystem.deleteAsync(tempUri, { idempotent: true });

      if (autoSaveResult.success) {
        setDownloadStatus('complete');
        console.log('File auto-saved to device:', fileName);
        
        // Auto close after success
        setTimeout(() => {
          setShowDownloadOverlay(false);
          Alert.alert(
            'Download Complete', 
            `"${materialDetail.title}" has been saved to Downloads/OLIN/${materialDetail?.id || 'General'}/`
          );
        }, 1500);
      } else {
        throw new Error(autoSaveResult.error || 'Auto-save failed');
      }

    } catch (err: any) {
      console.error('Failed to download or auto-save file:', err);
      setDownloadStatus('error');
      
      // Clean up temp file on error
      try {
        const tempUri = FileSystem.cacheDirectory + fileName;
        await FileSystem.deleteAsync(tempUri, { idempotent: true });
      } catch (deleteErr) {
        console.error('Failed to delete temp file on error:', deleteErr);
      }

      setTimeout(() => {
        setShowDownloadOverlay(false);
        Alert.alert(
          'Download Failed', 
          err?.message || 'Could not save the file. Please try again.'
        );
      }, 2000);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  // Removed previewFailed/showFallback effect (dead code)

  const handleOpenFile = async () => {
    if (!downloadedFileUri) return;

    await openLocalFileInAnotherApp(downloadedFileUri, materialDetail?.title);
  };

  const handleDeleteDownload = async () => {
    if (!downloadedFileUri) return;

    Alert.alert(
      'Remove Download',
      'Are you sure you want to delete this file from your device? You will need an internet connection to download it again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await FileSystem.deleteAsync(downloadedFileUri);
              setDownloadedFileUri(null);
              setDownloadDate(null);
              setFileSize(null);
              Alert.alert('Deleted', 'The file has been removed from your device.');
            } catch (error) {
              Alert.alert('Error', 'Could not delete the file. Please try again.');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleRefresh = useCallback(async () => {
    if (!netInfo?.isInternetReachable) {
      Alert.alert('Offline', 'You are currently offline. Please connect to the internet to refresh.');
      return;
    }
    setIsRefreshing(true);
    try {
      await fetchMaterialDetails();
    } catch (error) {
      console.error('Refresh failed', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [netInfo?.isInternetReachable]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1967d2" />
        <Text style={styles.loadingText}>Loading material...</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchMaterialDetails}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!materialDetail) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>Material not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: materialDetail.title || 'Material Details' }} />

      <ScrollView
        contentContainerStyle={styles.scrollViewContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#1967d2" />}
      >
        <View style={styles.headerContainer}>
          <Text style={styles.materialTitle}>{materialDetail.title}</Text>
          {materialDetail.description && (
            <Text style={styles.materialDescription}>{materialDetail.description}</Text>
          )}

          {!netInfo?.isInternetReachable && (
            <View style={styles.offlineNotice}>
              <Ionicons name="cloud-offline" size={14} color="#5f6368" />
              <Text style={styles.offlineText}>Offline Mode</Text>
            </View>
          )}
        </View>

        {/* Multiple Files Section */}
        {materialDetail.files && materialDetail.files.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.filesSectionHeader}>
              <View style={styles.filesSectionTitleRow}>
                <Ionicons name="documents" size={18} color="#1967d2" />
                <Text style={styles.sectionHeaderText}>Files ({materialDetail.files.length})</Text>
              </View>
              <View style={styles.filesSectionActions}>
                {downloadedFiles.length > 0 && (
                  <View style={styles.downloadedBadge}>
                    <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                    <Text style={styles.downloadedBadgeText}>
                      {downloadedFiles.length} downloaded
                    </Text>
                  </View>
                )}
                {downloadedFiles.length < materialDetail.files.length && netInfo?.isInternetReachable && (
                  <TouchableOpacity 
                    style={styles.downloadAllButton}
                    onPress={handleDownloadAllFiles}
                  >
                    <Ionicons name="cloud-download-outline" size={16} color="#1967d2" />
                    <Text style={styles.downloadAllButtonText}>Download All</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={styles.filesListContainer}>
              {materialDetail.files.map((file, index) => {
                const isDownloaded = downloadedFiles.some(d => d.materialFileIndex === index);
                const isCurrentlyDownloading = currentDownloadingFileIndex === index;
                const canViewOnline = !!netInfo?.isInternetReachable;
                
                return (
                  <TouchableOpacity 
                    key={index} 
                    style={[
                      styles.fileItemCard,
                      isDownloaded && styles.fileItemCardDownloaded,
                    ]}
                    onPress={async () => {
                      if (!isDownloaded) {
                        handleFileCardPress(file, index);
                        return;
                      }
                      const downloadedFile = downloadedFiles.find(d => d.materialFileIndex === index);
                      if (downloadedFile) {
                        await openLocalFileInAnotherApp(downloadedFile.uri, downloadedFile.fileName);
                      }
                    }}
                    disabled={!isDownloaded}
                    activeOpacity={0.85}
                  >
                    <View style={[
                      styles.fileItemIcon,
                      isDownloaded && styles.fileItemIconDownloaded,
                    ]}>
                      <Ionicons 
                        name={getFileIconByExtension(file.extension) as any} 
                        size={24} 
                        color={isDownloaded ? '#16a34a' : getFileColorByExtension(file.extension)} 
                      />
                    </View>
                    <View style={styles.fileItemInfo}>
                      <Text style={styles.fileItemName} numberOfLines={1}>{file.original_name}</Text>
                      <View style={styles.fileItemMetaRow}>
                        <Text style={styles.fileItemMeta}>
                          {file.extension?.toUpperCase()} • {formatBytes(file.size)}
                        </Text>
                        {isDownloaded && (
                          <View style={styles.offlineAvailableBadge}>
                            <Ionicons name="cloud-done" size={12} color="#16a34a" />
                            <Text style={styles.offlineAvailableText}>Offline</Text>
                          </View>
                        )}
                      </View>
                      {!isDownloaded && canViewOnline && (
                        <Text style={styles.fileItemMeta}>
                          Tap ⋯ for options
                        </Text>
                      )}
                    </View>
                    {/* Action Button */}
                    {isCurrentlyDownloading ? (
                      <ActivityIndicator size="small" color="#1967d2" style={styles.fileActionButton} />
                    ) : (
                      <TouchableOpacity 
                        style={styles.fileActionButton}
                        onPress={(e: any) => {
                          e?.stopPropagation?.();
                          openFileOptionsForListItem(file, index);
                        }}
                        disabled={isCurrentlyDownloading}
                      >
                        <Ionicons 
                          name="ellipsis-horizontal" 
                          size={22} 
                          color={isDownloaded ? '#16a34a' : (canViewOnline ? '#1967d2' : '#9aa0a6')} 
                        />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Legacy Single File Section - Same UI as multiple files */}
        {materialDetail.file_path && materialDetail.material_type?.toLowerCase() !== 'link' && (!materialDetail.files || materialDetail.files.length === 0) && downloadedFiles.length === 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.filesSectionHeader}>
              <View style={styles.filesSectionTitleRow}>
                <Ionicons name="document" size={18} color="#1967d2" />
                <Text style={styles.sectionHeaderText}>File</Text>
              </View>
              {downloadedFileUri && (
                <View style={styles.downloadedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                  <Text style={styles.downloadedBadgeText}>Downloaded</Text>
                </View>
              )}
            </View>
            <View style={styles.filesListContainer}>
              <TouchableOpacity 
                style={[
                  styles.fileItemCard,
                  downloadedFileUri && styles.fileItemCardDownloaded,
                ]}
                onPress={async () => {
                  if (downloadedFileUri) {
                    const name = getLegacySingleFileViewerName();
                    await openLocalFileInAnotherApp(downloadedFileUri, name);
                    return;
                  }

                  if (!netInfo?.isInternetReachable) {
                    showToast('Offline: you need internet to download.', 'warning');
                    return;
                  }

                  setShowActionSheet(true);
                }}
                disabled={false}
                activeOpacity={0.85}
              >
                <View style={[
                  styles.fileItemIcon,
                  downloadedFileUri && styles.fileItemIconDownloaded,
                ]}>
                  <Ionicons 
                    name={getFileIcon(getFileType(materialDetail.file_path)) as any} 
                    size={24} 
                    color={downloadedFileUri ? '#16a34a' : '#1967d2'} 
                  />
                </View>
                <View style={styles.fileItemInfo}>
                  <Text style={styles.fileItemName} numberOfLines={1}>
                    {materialDetail.title || 'File'}
                  </Text>
                  <View style={styles.fileItemMetaRow}>
                    <Text style={styles.fileItemMeta}>
                      {getFileType(materialDetail.file_path).toUpperCase()}
                      {(fileSize || materialDetail.formatted_file_size) && ` • ${fileSize || materialDetail.formatted_file_size}`}
                    </Text>
                    {downloadedFileUri && (
                      <View style={styles.offlineAvailableBadge}>
                        <Ionicons name="cloud-done" size={12} color="#16a34a" />
                        <Text style={styles.offlineAvailableText}>Offline</Text>
                      </View>
                    )}
                  </View>
                </View>
                {/* Action Button */}
                {isDownloading ? (
                  <ActivityIndicator size="small" color="#1967d2" style={styles.fileActionButton} />
                ) : (
                  <TouchableOpacity 
                    style={styles.fileActionButton}
                    onPress={(e: any) => {
                      e?.stopPropagation?.();
                      setShowActionSheet(true);
                    }}
                    disabled={isDownloading}
                  >
                    <Ionicons 
                      name="ellipsis-horizontal" 
                      size={22} 
                      color={downloadedFileUri ? '#16a34a' : (netInfo?.isInternetReachable ? '#1967d2' : '#9aa0a6')} 
                    />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Downloaded Files Carousel Section - Only show for multiple files */}


        {/* Multiple Links Section */}
        {materialDetail.links && materialDetail.links.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeader}>
              <Ionicons name="link" size={18} color="#10B981" /> Links ({materialDetail.links.length})
            </Text>
            <View style={styles.linksListContainer}>
              {materialDetail.links.map((link, index) => (
                <TouchableOpacity 
                  key={index} 
                  style={styles.linkItemCard}
                  onPress={() => handleOpenLink(link.url)}
                  disabled={!netInfo?.isInternetReachable}
                >
                  <View style={styles.linkItemIcon}>
                    <Ionicons name="globe-outline" size={24} color="#10B981" />
                  </View>
                  <View style={styles.linkItemInfo}>
                    <Text style={styles.linkItemTitle} numberOfLines={1}>
                      {link.title || 'External Link'}
                    </Text>
                    <Text style={styles.linkItemUrl} numberOfLines={1}>{link.url}</Text>
                  </View>
                  <Ionicons 
                    name="open-outline" 
                    size={20} 
                    color={netInfo?.isInternetReachable ? '#10B981' : '#9aa0a6'} 
                  />
                </TouchableOpacity>
              ))}
            </View>
            {!netInfo?.isInternetReachable && (
              <View style={styles.offlineLinkNotice}>
                <Text style={styles.offlineLinkText}>Internet connection required to open links.</Text>
              </View>
            )}
          </View>
        )}

        {/* Content Section */}
        {materialDetail.content && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeader}>Content</Text>
            <Text style={styles.materialContent}>{materialDetail.content}</Text>
          </View>
        )}

        {/* Fallback: show downloaded files when offline material lacks files[] */}
        {downloadedFiles.length > 0 && (!materialDetail.files || materialDetail.files.length === 0) && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeader}>
              <Ionicons name="cloud-done" size={18} color="#16a34a" /> Downloaded Files ({downloadedFiles.length})
            </Text>

            <View style={styles.filesListContainer}>
              {downloadedFiles.map((df, idx) => (
                <TouchableOpacity
                  key={`${df.materialFileIndex ?? 'x'}-${idx}`}
                  style={[styles.fileItemCard, styles.fileItemCardDownloaded]}
                  onPress={() => openLocalFileInAnotherApp(df.uri, df.fileName)}
                  activeOpacity={0.9}
                >
                  <View style={[styles.fileItemIcon, styles.fileItemIconDownloaded]}>
                    <Ionicons name={getFileIconByExtension(df.fileName.split('.').pop()) as any} size={22} color="#16a34a" />
                  </View>
                  <View style={styles.fileItemInfo}>
                    <Text style={styles.fileItemName} numberOfLines={1}>
                      {df.fileName}
                    </Text>
                    <View style={styles.fileItemMetaRow}>
                      <Text style={styles.fileItemMeta}>
                        {formatBytes(df.fileSize)}
                      </Text>
                      <View style={styles.offlineAvailableBadge}>
                        <Ionicons name="cloud-done" size={12} color="#16a34a" />
                        <Text style={styles.offlineAvailableText}>Offline</Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.fileActionButton}
                    onPress={async (e: any) => {
                      e?.stopPropagation?.();
                      if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(df.uri);
                      }
                    }}
                  >
                    <Ionicons name="share-outline" size={20} color="#9333ea" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* *** MODIFIED *** - External Link Section - Only show if NO links array exists (legacy single link) */}
        {materialDetail.material_type?.toLowerCase() === 'link' && materialDetail.file_path && (!materialDetail.links || materialDetail.links.length === 0) && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeader}>External Link</Text>
            <TouchableOpacity style={styles.linkClickableContainer} onPress={() => handleOpenLink(materialDetail.file_path!)}>
              <View style={styles.linkContentWrapper}>
                <Ionicons name="link" size={24} color={'#4285f4'} />
                <Text style={styles.linkUrlText} numberOfLines={1}>
                  {materialDetail.file_path}
                </Text>
                <Ionicons name="open-outline" size={20} color={'#4285f4'} />
              </View>
            </TouchableOpacity>
            {!netInfo?.isInternetReachable && (
              <View style={styles.offlineLinkNotice}>
                <Text style={styles.offlineLinkText}>An internet connection is required to open this link.</Text>
              </View>
            )}
          </View>
        )}

        {/* Details Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeader}>Material Information</Text>

          <View style={styles.detailsGrid}>
            <View style={styles.detailCard}>
              <View style={styles.detailIconContainer}>
                <Ionicons name="calendar" size={20} color="#1967d2" />
              </View>
              <Text style={styles.detailLabel}>Created</Text>
              <Text style={styles.detailValue}>{formatDate(materialDetail.created_at)}</Text>
            </View>

            {materialDetail.available_at && (
              <View style={styles.detailCard}>
                <View style={styles.detailIconContainer}>
                  <Ionicons name="time" size={20} color="#137333" />
                </View>
                <Text style={styles.detailLabel}>Available From</Text>
                <Text style={styles.detailValue}>{formatDate(materialDetail.available_at)}</Text>
              </View>
            )}

            {materialDetail.unavailable_at && (
              <View style={styles.detailCard}>
                <View style={styles.detailIconContainer}>
                  <Ionicons name="close-circle" size={20} color="#d93025" />
                </View>
                <Text style={styles.detailLabel}>Available Until</Text>
                <Text style={styles.detailValue}>{formatDate(materialDetail.unavailable_at)}</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      
      {/* File Action Sheet */}
      <FileActionSheet
        visible={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        fileName={materialDetail?.title}
        fileSize={fileSize || materialDetail?.formatted_file_size}
        fileType={getFileType(materialDetail?.file_path || '') as any}
        isCached={!!downloadedFileUri}
        actions={[
          // Download for Offline Access (only if not downloaded)
          ...(!downloadedFileUri
            ? [
                {
                  icon: 'download-outline' as const,
                  label: 'Download for Offline',
                  subtitle: 'Save for offline access',
                  onPress: async () => {
                    await downloadToAppStorage();
                  },
                  color: '#16a34a',
                  disabled: !netInfo?.isInternetReachable,
                },
              ]
            : []),
          // Open File (always available if downloaded)
          ...(downloadedFileUri
            ? [
                {
                  icon: 'open-outline' as const,
                  label: 'Open File',
                  subtitle: 'Open with another app',
                  onPress: async () => {
                    const name = getLegacySingleFileViewerName();
                    await openLocalFileInAnotherApp(downloadedFileUri, name);
                  },
                  color: '#4285f4',
                  disabled: false,
                },
              ]
            : []),
          // Save to Device
          {
            icon: 'folder-outline',
            label: 'Save to Device',
            subtitle: Platform.OS === 'android' ? 'Auto-save to Downloads/OLIN folder' : 'Export using share sheet',
            onPress: async () => {
              const name = getLegacySingleFileViewerName();
              if (downloadedFileUri) {
                // For already downloaded files - auto-save to Downloads
                setShowActionSheet(false);
                const result = await saveFileToDownloadsAuto(downloadedFileUri, name, materialDetail?.id?.toString());
                if (result.success) {
                  Alert.alert('Saved', `"${name}" has been saved to Downloads/OLIN/${materialDetail?.id || 'General'}/`);
                } else {
                  Alert.alert('Error', result.error || 'Failed to save file');
                }
                return;
              }
              // For not-yet-downloaded files - download then auto-save
              await downloadToDeviceExternalAuto();
            },
            color: '#16a34a',
          },
          // Share File (only if downloaded)
          ...(downloadedFileUri ? [{
            icon: 'share-outline' as const,
            label: 'Share File',
            subtitle: 'Share with other apps',
            onPress: handleOpenFile,
            color: '#9333ea',
          }] : []),
          // Remove Download (only if downloaded)
          ...(downloadedFileUri ? [{
            icon: 'trash-outline' as const,
            label: 'Remove Download',
            subtitle: 'Delete from app storage',
            onPress: () => {
              setShowActionSheet(false);
              handleDeleteDownload();
            },
            color: '#ef4444',
          }] : []),
        ]}
      />

      {/* File Action Sheet for Files from List (Multiple Files) */}
      <FileActionSheet
        visible={showFileActionSheet}
        onClose={() => {
          setShowFileActionSheet(false);
          setSelectedFileForAction(null);
        }}
        fileName={selectedFileForAction?.file.original_name}
        fileSize={selectedFileForAction?.file.size ? formatBytes(selectedFileForAction.file.size) : undefined}
        fileType={detectFileType(selectedFileForAction?.file.original_name || '') || 'file'}
        isCached={!!downloadedFiles.find(d => d.materialFileIndex === selectedFileForAction?.index)}
        actions={[
          ...(selectedFileForAction
            ? [
                (() => {
                  const df = downloadedFiles.find((d) => d.materialFileIndex === selectedFileForAction.index);
                  const isDownloaded = !!df;

                  if (isDownloaded && df) {
                    // File is already downloaded - show Open File option
                    return {
                      icon: 'open-outline' as const,
                      label: 'Open File',
                      subtitle: 'Open with another app',
                      onPress: async () => {
                        await openLocalFileInAnotherApp(df.uri, df.fileName);
                      },
                      color: '#4285f4',
                      disabled: false,
                    };
                  }

                  // Not downloaded yet - show Download for Offline option
                  return {
                    icon: 'download-outline' as const,
                    label: 'Download for Offline',
                    subtitle: 'Save for offline access',
                    onPress: () => {
                      if (!netInfo?.isInternetReachable) {
                        showToast('Internet required to download.', 'warning');
                        return;
                      }
                      downloadFileToApp(selectedFileForAction.file, selectedFileForAction.index);
                    },
                    color: '#16a34a',
                    disabled: !netInfo?.isInternetReachable,
                  };
                })(),
                {
                  icon: 'folder-outline' as const,
                  label: 'Save to Device',
                  subtitle: Platform.OS === 'android' ? 'Auto-save to Downloads/OLIN folder' : 'Export using share sheet',
                  onPress: async () => {
                    const df = downloadedFiles.find((d) => d.materialFileIndex === selectedFileForAction.index);
                    if (df) {
                      // For already downloaded files - auto-save to Downloads
                      const result = await saveFileToDownloadsAuto(df.uri, df.fileName, materialDetail?.id?.toString());
                      if (result.success) {
                        Alert.alert('Saved', `"${df.fileName}" has been saved to Downloads/OLIN/${materialDetail?.id || 'General'}/`);
                      } else {
                        Alert.alert('Error', result.error || 'Failed to save file');
                      }
                      return;
                    }
                    if (!netInfo?.isInternetReachable) {
                      showToast('Internet required to download.', 'warning');
                      return;
                    }
                    downloadFileToDeviceAuto(selectedFileForAction.file, selectedFileForAction.index);
                  },
                  color: '#16a34a',
                },
              ]
            : []),
          ...(downloadedFiles.find(d => d.materialFileIndex === selectedFileForAction?.index) ? [
            {
              icon: 'share-outline' as const,
              label: 'Share File',
              subtitle: 'Share with other apps',
              onPress: async () => {
                const downloadedFile = downloadedFiles.find(d => d.materialFileIndex === selectedFileForAction?.index);
                if (downloadedFile && await Sharing.isAvailableAsync()) {
                  await Sharing.shareAsync(downloadedFile.uri);
                }
              },
              color: '#9333ea',
            },
            {
              icon: 'trash-outline' as const,
              label: 'Remove Download',
              subtitle: 'Delete from app storage',
              onPress: () => {
                if (selectedFileForAction?.index !== undefined) {
                  handleDeleteDownloadedFile(selectedFileForAction.index);
                }
              },
              color: '#ef4444',
            },
          ] : []),
        ]}
      />

      {/* Download Progress Overlay */}
      <DownloadProgressOverlay
        visible={showDownloadOverlay}
        progress={downloadProgress / 100}
        fileName={materialDetail?.title || 'File'}
        fileSize={totalBytes > 0 ? formatBytes(totalBytes) : fileSize || undefined}
        downloadedSize={downloadedBytes > 0 ? formatBytes(downloadedBytes) : undefined}
        status={downloadStatus}
        onCancel={() => {
          setShowDownloadOverlay(false);
          setIsDownloading(false);
        }}
      />

      {/* File viewer removed - OLIN delegates file viewing to external apps */}

      {/* Non-blocking toast */}
      {toastMessage && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toastContainer,
            {
              bottom: Math.max(insets.bottom, 12) + 12,
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View
            style={[
              styles.toast,
              toastVariant === 'warning' ? styles.toastWarning : styles.toastInfo,
            ]}
          >
            <Ionicons
              name={toastVariant === 'warning' ? 'alert-circle' : 'information-circle'}
              size={18}
              color="#fff"
            />
            <Text style={styles.toastText} numberOfLines={2}>
              {toastMessage}
            </Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// *** MODIFIED *** - Added new styles for the offline link notice and responsive design
const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f8f9fa',
    alignItems: isTablet ? 'center' : 'stretch',
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' },
  loadingText: { marginTop: 16, fontSize: isTablet ? 18 : 16, color: '#5f6368' },
  centeredContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: isTablet ? 40 : 20,
    maxWidth: contentMaxWidth,
  },
  errorText: { fontSize: isTablet ? 18 : 16, color: '#d93025', textAlign: 'center', marginBottom: 20 },
  retryButton: { backgroundColor: '#1967d2', paddingHorizontal: isTablet ? 32 : 24, paddingVertical: isTablet ? 14 : 12, borderRadius: 8 },
  retryButtonText: { color: '#fff', fontSize: isTablet ? 18 : 16, fontWeight: '500' },
  scrollViewContent: { 
    paddingBottom: 24,
    width: isTablet ? contentMaxWidth : '100%',
    alignSelf: 'center',
  },

  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  toast: {
    width: '100%',
    maxWidth: contentMaxWidth,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  toastInfo: {
    backgroundColor: '#111827',
  },
  toastWarning: {
    backgroundColor: '#b45309',
  },
  toastText: {
    flex: 1,
    color: '#fff',
    fontSize: isTablet ? 15 : 14,
    fontWeight: '600',
  },

  headerContainer: {
    backgroundColor: '#fff',
    padding: isTablet ? 32 : 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    width: '100%',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: isTablet ? 16 : 12,
    marginBottom: isTablet ? 16 : 12,
  },
  materialTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: isTablet ? 16 : 12,
    paddingVertical: isTablet ? 10 : 8,
    borderRadius: 8,
  },
  materialTypeText: {
    color: '#fff',
    fontSize: isTablet ? 13 : 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  materialTitle: {
    flex: 1,
    fontSize: isTablet ? 28 : 22,
    fontWeight: '600',
    color: '#202124',
    textAlign: 'left',
  },
  materialDescription: {
    fontSize: isTablet ? 17 : 15,
    color: '#5f6368',
    textAlign: 'left',
    lineHeight: isTablet ? 26 : 22,
  },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f1f3f4',
    borderRadius: 16,
    marginTop: 16,
    gap: 6,
  },
  offlineText: { fontSize: 12, color: '#5f6368', fontWeight: '500' },

  sectionContainer: {
    marginHorizontal: isTablet ? 24 : 16,
    marginTop: isTablet ? 24 : 16,
    backgroundColor: '#fff',
    borderRadius: isTablet ? 12 : 8,
    padding: isTablet ? 24 : 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionHeader: {
    fontSize: isTablet ? 22 : 18,
    fontWeight: '500',
    color: '#202124',
    marginBottom: isTablet ? 20 : 16,
  },

  actionButtonsGrid: { gap: 12 },
  actionCard: {
    backgroundColor: '#1967d2',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1967d2',
  },
  actionCardDisabled: {
    backgroundColor: '#f1f3f4',
    borderColor: '#e0e0e0',
  },
  actionCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionCardText: { flex: 1 },
  actionCardTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 4,
  },
  actionCardSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  disabledText: { color: '#9aa0a6' },

  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: isTablet ? 16 : 12,
  },
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
    marginBottom: isTablet ? 12 : 8,
  },
  detailLabel: {
    fontSize: isTablet ? 14 : 12,
    color: '#5f6368',
    marginBottom: 4,
    textAlign: 'center',
  },
  detailValue: {
    fontSize: isTablet ? 16 : 14,
    fontWeight: '600',
    color: '#202124',
    textAlign: 'center',
  },

  materialContent: { fontSize: 14, color: '#5f6368', lineHeight: 22 },
  linkClickableContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  linkContentWrapper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkUrlText: { flex: 1, fontSize: 14, color: '#1967d2', fontWeight: '500' },
  offlineLinkNotice: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#f1f3f4',
    borderRadius: 6,
    alignItems: 'center',
  },
  offlineLinkText: {
    fontSize: 12,
    color: '#5f6368',
  },

  downloadPromptContainer: {
    marginHorizontal: isTablet ? 24 : 16,
    marginTop: isTablet ? 24 : 16,
    backgroundColor: '#fff',
    borderRadius: isTablet ? 12 : 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  downloadPromptContent: { 
    padding: isTablet ? 48 : 32, 
    alignItems: 'center' 
  },
  downloadPromptTitle: {
    fontSize: isTablet ? 24 : 20,
    fontWeight: '500',
    color: '#202124',
    marginTop: isTablet ? 20 : 16,
    marginBottom: isTablet ? 12 : 8,
  },
  downloadPromptText: {
    fontSize: isTablet ? 16 : 14,
    color: '#5f6368',
    textAlign: 'center',
    marginBottom: isTablet ? 32 : 24,
    lineHeight: isTablet ? 24 : 20,
  },
  progressContainer: { 
    alignItems: 'center', 
    gap: isTablet ? 16 : 12 
  },
  progressText: { 
    fontSize: isTablet ? 18 : 16, 
    fontWeight: '500', 
    color: '#1967d2' 
  },
  downloadPromptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1967d2',
    paddingVertical: isTablet ? 16 : 12,
    paddingHorizontal: isTablet ? 32 : 24,
    borderRadius: isTablet ? 10 : 8,
    gap: isTablet ? 10 : 8,
  },
  downloadPromptButtonText: { 
    color: '#fff', 
    fontSize: isTablet ? 18 : 16, 
    fontWeight: '500' 
  },

  inlineViewerContainer: {
    marginHorizontal: isTablet ? 24 : 16,
    marginTop: isTablet ? 24 : 16,
    backgroundColor: '#fff',
    borderRadius: isTablet ? 12 : 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
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
  viewerActions: { flexDirection: 'row', gap: isTablet ? 12 : 8 },
  actionButton: { padding: isTablet ? 8 : 6 },
  documentHeaderInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  codeHeaderInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  imagePreview: { 
    width: '100%', 
    height: isTablet ? 450 : 300, 
    backgroundColor: '#f8f9fa' 
  },
  downloadedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#e6f4ea',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#d0e5d6',
  },
  downloadedText: { fontSize: 12, color: '#137333', flex: 1 },
  videoPlayer: { 
    width: '100%', 
    height: isTablet ? 400 : 250, 
    backgroundColor: '#000' 
  },
  audioPlayerContainer: { 
    padding: isTablet ? 64 : 48, 
    alignItems: 'center', 
    backgroundColor: '#f8f9fa' 
  },
  audioFileName: {
    fontSize: isTablet ? 18 : 16,
    color: '#202124',
    marginTop: isTablet ? 20 : 16,
    marginBottom: isTablet ? 32 : 24,
    textAlign: 'center',
  },
  playButton: { padding: isTablet ? 12 : 10 },

  genericFileContainer: { padding: 48, alignItems: 'center' },
  genericFileName: {
    fontSize: 16,
    color: '#202124',
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  openFileButton: {
    backgroundColor: '#1967d2',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  openFileButtonText: { color: '#fff', fontSize: 14, fontWeight: '500' },

  documentContainer: { padding: 24, alignItems: 'center' },
  documentIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  documentTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#202124',
    textAlign: 'center',
    marginBottom: 8,
  },
  documentSubtext: {
    fontSize: 14,
    color: '#5f6368',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  primaryDocumentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
  },
  primaryDocumentButtonText: { color: '#fff', fontSize: 16, fontWeight: '500' },

  codeScrollContainer: { maxHeight: 400, backgroundColor: '#f8f9fa' },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#202124',
    padding: 16,
  },
  errorCodeContainer: { padding: 48, alignItems: 'center' },
  errorCodeText: {
    marginTop: 16,
    fontSize: 14,
    color: '#d93025',
    marginBottom: 24,
  },
  fileSizeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f3f4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 16, // Add some spacing before the button
    gap: 4,
  },
  fileSizeText: {
    fontSize: 12,
    color: '#5f6368',
    fontWeight: '500',
  },
  retryCodeButton: {
    backgroundColor: '#1967d2',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryCodeButtonText: { color: '#fff', fontSize: 14, fontWeight: '500' },

  fullScreenContainer: { flex: 1, backgroundColor: '#000' },
  fullScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  fullScreenCloseButton: { padding: 8 },
  fullScreenTitle: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    marginHorizontal: 12,
    fontWeight: '500',
  },
  fullScreenShareButton: { padding: 8 },
  fullScreenContent: { flex: 1, justifyContent: 'center' },
  fullScreenImage: { width: screenWidth, height: screenHeight - 100 },
  fullScreenVideo: { flex: 1 },
  fullScreenCodeText: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#d4d4d4',
    padding: 16,
  },
  
  // Multiple Files Section Styles
  filesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  filesSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1967d2',
  },
  downloadedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  downloadedBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#16a34a',
  },
  filesSectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  downloadAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e0edff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1967d2',
  },
  downloadAllButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1967d2',
  },
  filesListContainer: {
    gap: 8,
  },
  fileItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f7ff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  fileItemCardDownloaded: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  fileItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fileItemIconDownloaded: {
    backgroundColor: '#dcfce7',
  },
  fileItemInfo: {
    flex: 1,
    marginRight: 8,
  },
  fileItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 2,
  },
  fileItemMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  fileItemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  fileActionButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(25, 103, 210, 0.1)',
  },
  
  // Multiple Links Section Styles
  linksListContainer: {
    gap: 8,
  },
  linkItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  linkItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  linkItemInfo: {
    flex: 1,
    marginRight: 8,
  },
  linkItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#047857',
    marginBottom: 2,
  },
  linkItemUrl: {
    fontSize: 12,
    color: '#6b7280',
  },
  
  // Improved Audio Player Styles
  audioArtContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e8f0fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  audioProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  audioTimeText: {
    fontSize: 12,
    color: '#5f6368',
    fontWeight: '500',
    minWidth: 40,
    textAlign: 'center',
  },
  audioSliderContainer: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  audioSliderTrack: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  audioSliderFill: {
    height: '100%',
    backgroundColor: '#4285f4',
    borderRadius: 2,
  },
  audioSliderThumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4285f4',
  },
  audioControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  audioControlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  audioPlayPauseButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioSkipText: {
    fontSize: 10,
    color: '#4285f4',
    marginTop: 2,
  },
  // FileViewer Modal styles
  fileViewerContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  fileViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  fileViewerCloseButton: {
    padding: 8,
  },
  fileViewerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginHorizontal: 12,
    textAlign: 'center',
  },
  fileViewerShareButton: {
    padding: 8,
  },
  fileViewerContent: {
    flex: 1,
  },
  
  // ==========================================
  // Inline Viewer Styles (for downloaded files)
  // ==========================================
  inlineViewerCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  inlineViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
    backgroundColor: '#fafafa',
  },
  inlineViewerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  inlineViewerTypeBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineViewerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  inlineViewerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inlineViewerActionBtn: {
    padding: 8,
    borderRadius: 20,
  },
  inlineViewerContent: {
    backgroundColor: '#000',
    minHeight: 200,
  },
  inlineImageViewer: {
    width: '100%',
    height: 250,
    backgroundColor: '#f8f9fa',
  },
  inlineViewerTapHint: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  inlineViewerTapHintText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  inlineVideoContainer: {
    position: 'relative',
  },
  inlineVideoViewer: {
    width: '100%',
    height: 220,
    backgroundColor: '#000',
  },
  inlineFullscreenBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 20,
  },
  inlineAudioContainer: {
    padding: 20,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
  },
  inlineAudioVisual: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f3e8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  inlineAudioPlayer: {
    width: '100%',
    height: 50,
    backgroundColor: 'transparent',
  },
  inlineAudioFullscreenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e0edff',
    borderRadius: 16,
  },
  inlineAudioFullscreenText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4285f4',
  },
  inlineDocumentContainer: {
    position: 'relative',
    minHeight: 200,
  },
  inlineDocumentPreview: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  inlineDocumentName: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
  },
  inlineDocumentSize: {
    marginTop: 4,
    fontSize: 13,
    color: '#6b7280',
  },
  inlineDocumentOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineDocumentOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  inlineDocumentOpenText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  inlineCodeContainer: {
    position: 'relative',
    backgroundColor: '#1e1e1e',
    minHeight: 200,
  },
  inlineCodeScroll: {
    maxHeight: 200,
    padding: 12,
  },
  inlineCodeText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#d4d4d4',
    lineHeight: 18,
  },
  inlineCodeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  inlineCodeOverlayText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  inlineOtherContainer: {
    padding: 24,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
  },
  inlineOtherPreview: {
    alignItems: 'center',
    marginBottom: 16,
  },
  inlineOtherName: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
  },
  inlineOtherSize: {
    marginTop: 4,
    fontSize: 13,
    color: '#6b7280',
  },
  inlineOtherOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#e0edff',
    borderRadius: 20,
  },
  inlineOtherOpenText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4285f4',
  },
  inlineViewerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#dcfce7',
    borderTopWidth: 1,
    borderTopColor: '#bbf7d0',
  },
  inlineViewerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineViewerStatusText: {
    fontSize: 12,
    color: '#16a34a',
  },
  inlineViewerSizeText: {
    fontSize: 12,
    color: '#16a34a',
    fontWeight: '500',
  },

  // ==========================================
  // Download Prompt Card Styles (for not downloaded)
  // ==========================================
  downloadPromptCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  downloadPromptIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  downloadPromptSizeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
  },
  downloadPromptSizeText: {
    fontSize: 13,
    color: '#5f6368',
  },
  downloadPromptProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  downloadPromptProgressText: {
    fontSize: 14,
    color: '#1967d2',

    fontWeight: '500',
  },
});