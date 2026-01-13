/**
 * FileViewer Component - Main Entry Point
 * 
 * A universal file viewer component that automatically detects file type
 * and renders the appropriate viewer with offline support.
 */

import React from 'react';

// Import utilities from separate file to avoid circular dependencies
import { FileType, detectFileType, formatFileSize, getMimeType } from './utils';

// Re-export utilities for convenience
export { FileType, detectFileType, formatFileSize, getMimeType };

// Lazy imports to avoid circular dependencies
const ImageViewer = React.lazy(() => import('./ImageViewer'));
const VideoPlayer = React.lazy(() => import('./VideoPlayer'));
const AudioPlayer = React.lazy(() => import('./AudioPlayer'));
const PDFViewer = React.lazy(() => import('./PDFViewer'));
const CodeViewer = React.lazy(() => import('./CodeViewer'));
const DocumentViewer = React.lazy(() => import('./DocumentViewer'));
const UnsupportedViewer = React.lazy(() => import('./UnsupportedViewer'));

export interface FileViewerProps {
  uri: string;
  fileName: string;
  fileType?: FileType;
  fileSize?: number;
  isCached?: boolean;
  onDownload?: () => void;
  onShare?: () => void;
  onSaveToDevice?: () => void;
  onClose?: () => void;
  fullscreen?: boolean;
  isOnline?: boolean;
}

/**
 * Main FileViewer Component
 */
export default function FileViewer({
  uri,
  fileName,
  fileType: providedFileType,
  fileSize,
  isCached = false,
  onDownload,
  onShare,
  onSaveToDevice,
  onClose,
  fullscreen = false,
  isOnline = true,
}: FileViewerProps) {
  const fileType = providedFileType || detectFileType(fileName || uri);
  
  const commonProps = {
    uri,
    fileName,
    fileSize,
    isCached,
    onDownload,
    onShare,
    onSaveToDevice,
    onClose,
    fullscreen,
    isOnline,
  };
  
  const renderViewer = () => {
    switch (fileType) {
      case 'image':
        return <ImageViewer {...commonProps} />;
      case 'video':
        return <VideoPlayer {...commonProps} />;
      case 'audio':
        return <AudioPlayer {...commonProps} />;
      case 'pdf':
        return <PDFViewer {...commonProps} />;
      case 'code':
        return <CodeViewer {...commonProps} />;
      case 'document':
        return <DocumentViewer {...commonProps} />;
      default:
        return <UnsupportedViewer {...commonProps} />;
    }
  };
  
  return (
    <React.Suspense fallback={null}>
      {renderViewer()}
    </React.Suspense>
  );
}