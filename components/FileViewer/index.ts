/**
 * FileViewer Utilities
 * 
 * OLIN LMS no longer uses in-app file viewers.
 * Files are downloaded to device storage and opened via Android intents.
 * 
 * This module only exports utility functions for file type detection and MIME types.
 */

export { detectFileType, formatFileSize, getMimeType } from './utils';
export type { FileType } from './utils';

