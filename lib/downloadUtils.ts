/**
 * OLIN Download Utilities
 * 
 * Handles downloading files to device storage and opening files via Android intents.
 * Uses Sharing API for "Save to Device" to avoid permission issues on Android 10+.
 * 
 * OLIN delegates file viewing to Android OS and third-party apps.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';
import { getMimeType } from '../components/FileViewer';

const DOWNLOADS_DIR_URI_STORAGE_KEY = 'olin_downloads_dir_uri_v1';

const guessMimeTypeFromHeadBase64 = (headBase64: string): string | null => {
  if (!headBase64) return null;

  // Common signatures in Base64
  // PDF: %PDF
  if (headBase64.startsWith('JVBERi0')) return 'application/pdf';
  // JPEG: 0xFF 0xD8 0xFF
  if (headBase64.startsWith('/9j/')) return 'image/jpeg';
  // PNG: 0x89 50 4E 47 0D 0A 1A 0A
  if (headBase64.startsWith('iVBORw0KGgo')) return 'image/png';
  // GIF: GIF87a / GIF89a
  if (headBase64.startsWith('R0lGODdh') || headBase64.startsWith('R0lGODlh')) return 'image/gif';
  // ZIP / OOXML: PK..
  if (headBase64.startsWith('UEsDB') || headBase64.startsWith('UEsFB') || headBase64.startsWith('UEsBA')) return 'application/zip';
  // MP3: ID3
  if (headBase64.startsWith('SUQz')) return 'audio/mpeg';
  // MP4: ftyp
  if (headBase64.includes('ZnR5cA')) return 'video/mp4';

  return null;
};

const getBestMimeType = async (sourceUri: string, fileName: string): Promise<string> => {
  const byName = getMimeType(fileName);
  try {
    // Read only a small head chunk; if the platform doesn't support partial reads, this may throw.
    const headBase64 = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: 'base64',
      length: 64,
      position: 0,
    } as any);
    const guessed = guessMimeTypeFromHeadBase64(typeof headBase64 === 'string' ? headBase64 : '');
    return guessed || byName;
  } catch {
    return byName;
  }
};

const getOrRequestDownloadsDirUri = async (): Promise<string | null> => {
  try {
    const existing = await AsyncStorage.getItem(DOWNLOADS_DIR_URI_STORAGE_KEY);
    if (existing) {
      // Validate it's still accessible
      try {
        await FileSystem.StorageAccessFramework.readDirectoryAsync(existing);
        return existing;
      } catch {
        await AsyncStorage.removeItem(DOWNLOADS_DIR_URI_STORAGE_KEY);
      }
    }

    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return null;

    await AsyncStorage.setItem(DOWNLOADS_DIR_URI_STORAGE_KEY, permission.directoryUri);
    return permission.directoryUri;
  } catch {
    return null;
  }
};

const ensureSafDirectoryAsync = async (parentDirUri: string, dirName: string): Promise<string> => {
  // Try to create; if it exists, fall back to scanning.
  try {
    return await FileSystem.StorageAccessFramework.makeDirectoryAsync(parentDirUri, dirName);
  } catch {
    const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(parentDirUri);
    const match = entries.find((uri: string) => {
      const decoded = decodeURIComponent(uri);
      return decoded.endsWith('/' + dirName) || decoded.includes('/' + dirName + '/');
    });
    if (match) return match;
    // If not found, rethrow original intent: create again (some providers need it)
    return await FileSystem.StorageAccessFramework.makeDirectoryAsync(parentDirUri, dirName);
  }
};

export interface DownloadOptions {
  url: string;
  fileName: string;
  courseName?: string;
  onProgress?: (progress: number) => void;
  onComplete?: (localUri: string) => void;
  onError?: (error: string) => void;
}

export interface DownloadResult {
  success: boolean;
  localUri?: string;
  error?: string;
}

/**
 * Sanitize folder/file name for filesystem
 */
const sanitizeName = (name: string): string => {
  return name
    .replace(/[<>:"/\\|?*]/g, '_') // Remove invalid characters
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .trim()
    .substring(0, 100);             // Limit length
};

/**
 * Get the OLIN download folder path in app cache
 */
const getOlinDownloadPath = async (courseName?: string): Promise<string> => {
  const baseFolder = 'OLIN';
  const courseFolder = courseName ? sanitizeName(courseName) : 'General';

  const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!cacheDir) {
    throw new Error('FileSystem cache/document directory is not available on this device.');
  }

  const tempPath = `${cacheDir}${baseFolder}/${courseFolder}/`;
  
  const dirInfo = await FileSystem.getInfoAsync(tempPath);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(tempPath, { intermediates: true });
  }
  
  return tempPath;
};

/**
 * Save file to device using Share sheet (Android & iOS)
 * This avoids permission issues on Android 10+ and lets the user choose where to save.
 * Works reliably on all Android versions.
 */
export const saveFileToDownloadsAuto = async (
  sourceUri: string,
  fileName: string,
  courseName?: string
): Promise<{ success: boolean; uri?: string; error?: string }> => {
  if (!sourceUri) {
    return { success: false, error: 'Source file not found' };
  }

  try {
    // iOS: Share sheet (no true Downloads folder)
    if (Platform.OS !== 'android') {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        return { success: false, error: 'Sharing/saving not available on this device' };
      }
      const mimeType = await getBestMimeType(sourceUri, fileName);
      await Sharing.shareAsync(sourceUri, {
        dialogTitle: `Save "${fileName}"`,
        mimeType,
        UTI: mimeType,
      });
      return { success: true, uri: sourceUri };
    }

    // Android: Auto-save to Downloads/OLIN/{CourseName}/ using SAF.
    // NOTE: Android requires a one-time folder permission. After that, saves are automatic.
    const downloadsDirUri = await getOrRequestDownloadsDirUri();
    if (!downloadsDirUri) {
      // Fallback to share sheet if user denied directory permission
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        return { success: false, error: 'Storage permission is required to save files.' };
      }
      const mimeType = await getBestMimeType(sourceUri, fileName);
      await Sharing.shareAsync(sourceUri, {
        dialogTitle: `Save "${fileName}"`,
        mimeType,
      });
      return { success: true, uri: sourceUri };
    }

    const baseFolder = 'OLIN';
    const courseFolder = courseName ? sanitizeName(courseName) : 'General';

    const olinDirUri = await ensureSafDirectoryAsync(downloadsDirUri, baseFolder);
    const courseDirUri = await ensureSafDirectoryAsync(olinDirUri, courseFolder);

    const sanitizedFileName = sanitizeName(fileName);
    const mimeType = await getBestMimeType(sourceUri, sanitizedFileName);
    const destUri = await FileSystem.StorageAccessFramework.createFileAsync(courseDirUri, sanitizedFileName, mimeType);

    const fileBase64 = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: 'base64',
    });
    await FileSystem.writeAsStringAsync(destUri, fileBase64, {
      encoding: 'base64',
    });

    console.log(`✅ Auto-saved to Downloads/${baseFolder}/${courseFolder}/${sanitizedFileName}`);
    return { success: true, uri: destUri };
  } catch (error: any) {
    console.error('❌ Failed to save file:', error);
    return { success: false, error: error?.message || 'Failed to save file' };
  }
};

/**
 * Request storage permissions (Android only) - simplified
 */
export const requestStoragePermission = async (): Promise<boolean> => {
  // On Android 10+, we use Sharing API which doesn't need WRITE_EXTERNAL_STORAGE
  return true;
};

/**
 * Download file to app cache and then save via Share sheet
 */
export const downloadToDevice = async (options: DownloadOptions): Promise<DownloadResult> => {
  const { url, fileName, courseName, onProgress, onComplete, onError } = options;
  
  try {
    // Get download path in app cache
    const downloadPath = await getOlinDownloadPath(courseName);
    const sanitizedFileName = sanitizeName(fileName);
    const tempUri = `${downloadPath}${sanitizedFileName}`;
    
    console.log(`📥 Downloading to: ${tempUri}`);
    
    // Create download resumable
    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      tempUri,
      {},
      (downloadProgress) => {
        if (downloadProgress.totalBytesExpectedToWrite > 0) {
          const progress = Math.round(
            (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100
          );
          onProgress?.(progress);
        }
      }
    );
    
    // Start download
    const result = await downloadResumable.downloadAsync();
    
    if (!result || result.status !== 200) {
      throw new Error(`Download failed with status ${result?.status || 'unknown'}`);
    }
    
    // Save to device Downloads/OLIN automatically (Android) with SAF; fallback to share sheet.
    const saveRes = await saveFileToDownloadsAuto(result.uri, fileName, courseName);
    if (!saveRes.success) {
      console.log('Auto-save failed, file remains in cache:', saveRes.error);
    }
    
    console.log(`✅ File downloaded: ${sanitizedFileName}`);
    onComplete?.(result.uri);
    return { success: true, localUri: result.uri };
    
  } catch (error: any) {
    console.error('❌ Download failed:', error);
    const errorMsg = error?.message || 'Download failed. Please try again.';
    onError?.(errorMsg);
    return { success: false, error: errorMsg };
  }
};

/**
 * Open file using Android intent (external app)
 */
export const openFileExternal = async (localUri: string, fileName?: string): Promise<boolean> => {
  if (!localUri) {
    Alert.alert('Error', 'File not found.');
    return false;
  }
  
  try {
    if (Platform.OS === 'android') {
      const contentUri = await FileSystem.getContentUriAsync(localUri);
      const mimeType = await getBestMimeType(localUri, fileName || localUri);
      
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: mimeType,
      });
      
      return true;
    } else {
      // iOS: Use share sheet
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri, {
          dialogTitle: `Open ${fileName || 'file'}`,
          mimeType: getMimeType(fileName || localUri),
        });
        return true;
      } else {
        Alert.alert('Error', 'Cannot open this file on your device.');
        return false;
      }
    }
  } catch (error: any) {
    console.error('Failed to open file:', error);
    Alert.alert(
      'Cannot Open File',
      'This file cannot be opened on your device. Please install a compatible app.'
    );
    return false;
  }
};

/**
 * Share file with other apps
 */
export const shareFile = async (localUri: string, fileName?: string): Promise<boolean> => {
  if (!localUri) {
    Alert.alert('Error', 'File not found.');
    return false;
  }
  
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(localUri, {
        dialogTitle: `Share ${fileName || 'file'}`,
        mimeType: await getBestMimeType(localUri, fileName || localUri),
      });
      return true;
    } else {
      Alert.alert('Error', 'Sharing is not available on this device.');
      return false;
    }
  } catch (error) {
    console.error('Failed to share file:', error);
    Alert.alert('Error', 'Could not share the file.');
    return false;
  }
};

/**
 * Delete downloaded file from device
 */
export const deleteDownloadedFile = async (localUri: string): Promise<boolean> => {
  if (!localUri) return false;
  
  try {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
    return true;
  } catch (error) {
    console.error('Failed to delete file:', error);
    return false;
  }
};

/**
 * Check if file exists locally
 */
export const isFileDownloaded = async (localUri: string): Promise<boolean> => {
  if (!localUri) return false;
  
  try {
    const info = await FileSystem.getInfoAsync(localUri);
    return info.exists && 'size' in info && info.size > 0;
  } catch (error) {
    return false;
  }
};

/**
 * Format bytes to human readable string
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};
