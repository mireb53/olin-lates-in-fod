/**
 * OLIN Download Utilities
 * 
 * Handles downloading files to device storage and opening files via Android intents.
 * Uses Sharing API for "Save to Device" to avoid permission issues on Android 10+.
 * 
 * OLIN delegates file viewing to Android OS and third-party apps.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';
import { getMimeType } from '../components/FileViewer';

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
  
  const tempPath = `${FileSystem.cacheDirectory}${baseFolder}/${courseFolder}/`;
  
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
  _courseName?: string // kept for API compatibility
): Promise<{ success: boolean; uri?: string; error?: string }> => {
  if (!sourceUri) {
    return { success: false, error: 'Source file not found' };
  }

  try {
    // Check if sharing is available
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      return { success: false, error: 'Sharing/saving not available on this device' };
    }

    const mimeType = getMimeType(fileName);
    
    // Use the share sheet to let user save the file
    // On Android, this opens a system dialog where user can choose to save to Downloads, Drive, etc.
    await Sharing.shareAsync(sourceUri, {
      dialogTitle: `Save "${fileName}"`,
      mimeType: mimeType,
      UTI: mimeType, // for iOS
    });

    console.log(`✅ File shared/saved: ${fileName}`);
    return { success: true, uri: sourceUri };
  } catch (error: any) {
    console.error('❌ Failed to save file:', error);
    return {
      success: false,
      error: error?.message || 'Failed to save file'
    };
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
    
    // Use share sheet to let user save the file (works on Android 10+)
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          dialogTitle: `Save "${fileName}"`,
          mimeType: getMimeType(fileName),
        });
      }
    } catch (shareError) {
      console.log('Share sheet error (file still in cache):', shareError);
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
      const mimeType = getMimeType(fileName || localUri);
      
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
        mimeType: getMimeType(fileName || localUri),
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
