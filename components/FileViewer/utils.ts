/**
 * FileViewer Utility Functions
 * 
 * Shared utilities for file type detection, MIME types, and formatting.
 * Separated to avoid circular dependencies.
 */

export type FileType = 'image' | 'video' | 'audio' | 'pdf' | 'code' | 'document' | 'other';

/**
 * Detect file type from file extension
 */
export const detectFileType = (filePath: string): FileType => {
  if (!filePath) return 'other';
  
  const extension = filePath.split('.').pop()?.toLowerCase() || '';
  
  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'].includes(extension)) {
    return 'image';
  }
  
  // Videos
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp', 'm4v', 'flv', 'wmv'].includes(extension)) {
    return 'video';
  }
  
  // Audio
  if (['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'wma', 'opus'].includes(extension)) {
    return 'audio';
  }
  
  // PDF
  if (extension === 'pdf') {
    return 'pdf';
  }
  
  // Code files
  if ([
    'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb', 
    'go', 'rs', 'swift', 'kt', 'dart', 'html', 'css', 'scss', 'less', 'json', 
    'xml', 'yaml', 'yml', 'sql', 'sh', 'bash', 'md', 'txt', 'log', 'ini', 'conf',
    'env', 'gitignore', 'dockerfile', 'makefile'
  ].includes(extension)) {
    return 'code';
  }
  
  // Documents (Office files)
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf'].includes(extension)) {
    return 'document';
  }
  
  return 'other';
};

/**
 * Get MIME type from file extension
 */
export const getMimeType = (filePath: string): string => {
  const extension = filePath.split('.').pop()?.toLowerCase() || '';
  
  const mimeTypes: Record<string, string> = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'svg': 'image/svg+xml',
    
    // Videos
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
    
    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'm4a': 'audio/mp4',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
    
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    
    // Code/Text
    'txt': 'text/plain',
    'json': 'application/json',
    'js': 'text/javascript',
    'html': 'text/html',
    'css': 'text/css',
    'xml': 'application/xml',
  };
  
  return mimeTypes[extension] || 'application/octet-stream';
};

/**
 * Format bytes to human readable string
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
