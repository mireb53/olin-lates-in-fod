/**
 * DocumentViewer Component
 *
 * Download-first viewer for Office documents (Word, Excel, PowerPoint).
 * Office formats are opened externally once downloaded, via native apps.
 *
 * Note: No in-app online preview (WebView) is used.
 */

import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import {
    Alert,
    Modal,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { formatFileSize } from './utils';

interface DocumentViewerProps {
  uri: string;
  fileName: string;
  fileSize?: number;
  isCached?: boolean;
  onDownload?: () => void;
  onShare?: () => void;
  onSaveToDevice?: () => void;
  onClose?: () => void;
  isOnline?: boolean;
}

// Get document type info from extension
const getDocumentInfo = (fileName: string): { type: string; icon: string; color: string } => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  switch (ext) {
    case 'doc':
    case 'docx':
      return { type: 'Word Document', icon: 'document-text', color: '#2b579a' };
    case 'xls':
    case 'xlsx':
      return { type: 'Excel Spreadsheet', icon: 'grid', color: '#217346' };
    case 'ppt':
    case 'pptx':
      return { type: 'PowerPoint Presentation', icon: 'easel', color: '#d24726' };
    default:
      return { type: 'Document', icon: 'document', color: '#6b7280' };
  }
};

// Get MIME type for document
const getMimeType = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeMap: { [key: string]: string } = {
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'rtf': 'application/rtf',
    'odt': 'application/vnd.oasis.opendocument.text',
  };
  return mimeMap[ext] || 'application/octet-stream';
};

export default function DocumentViewer({
  uri,
  fileName,
  fileSize,
  isCached = false,
  onDownload,
  onShare,
  onSaveToDevice,
  onClose,
  isOnline = true,
}: DocumentViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isLocal = isCached || uri.startsWith('file://');

  const documentInfo = getDocumentInfo(fileName);

  // Open document with native app (for cached files)
  const openWithNativeApp = async () => {
    if (!isLocal || !uri.startsWith('file://')) {
      Alert.alert('Error', 'File must be downloaded first');
      return;
    }

    try {
      if (Platform.OS === 'android') {
        // Get content URI for the file
        const contentUri = await FileSystem.getContentUriAsync(uri);
        const mimeType = getMimeType(fileName);

        // Launch with ACTION_VIEW to open with appropriate app
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          type: mimeType,
        });
      } else {
        // iOS: Use Sharing API
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            dialogTitle: `Open ${fileName}`,
          });
        }
      }
    } catch (error) {
      console.error('Error opening document with native app:', error);
      Alert.alert(
        'No App Found',
        'Please install an app that can open this document type (e.g., Microsoft Office, Google Docs, WPS Office).'
      );
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const renderDocumentContent = (isFullscreenMode: boolean = false) => {
    if (isLocal && uri.startsWith('file://')) {
      // For local Office documents, we need to convert to a viewable format
      // Since WebView cannot directly view local .docx/.xlsx/.pptx files,
      // we'll show an embedded viewer that uses the file content
      // Alternative: Show formatted preview or text extraction
      return (
        <View style={[
          styles.webViewContainer,
          isFullscreenMode && styles.fullscreenWebViewContainer
        ]}>
          <View style={styles.localDocContainer}>
            <View style={styles.localDocHeader}>
              <Ionicons name={documentInfo.icon as any} size={48} color={documentInfo.color} />
              <Text style={styles.localDocTitle}>{fileName}</Text>
              <Text style={styles.localDocSubtitle}>{documentInfo.type}</Text>
            </View>
            
            <View style={styles.localDocContent}>
              <Ionicons name="document-text-outline" size={64} color="#d1d5db" />
              <Text style={styles.localDocMessage}>Document Viewer</Text>
              <Text style={styles.localDocHint}>
                This {documentInfo.type.toLowerCase()} is downloaded and ready to view.
              </Text>
            </View>

            <View style={styles.localDocActions}>
              <TouchableOpacity 
                style={[styles.primaryActionButton, { backgroundColor: documentInfo.color }]} 
                onPress={openWithNativeApp}
              >
                <Ionicons name="eye-outline" size={20} color="#fff" />
                <Text style={styles.primaryActionText}>Open in another app</Text>
              </TouchableOpacity>
              
              {onShare && (
                <TouchableOpacity style={styles.secondaryActionButton} onPress={onShare}>
                  <Ionicons name="share-outline" size={20} color={documentInfo.color} />
                  <Text style={[styles.secondaryActionText, { color: documentInfo.color }]}>Share Document</Text>
                </TouchableOpacity>
              )}
            </View>
            
            <Text style={styles.localDocFooterNote}>
              💡 Office documents will open with apps like Microsoft Office, WPS Office, or Google Docs
            </Text>
          </View>
        </View>
      );
    }

    // Not downloaded: require download-first
    return (
      <View style={styles.offlineContainer}>
        <Ionicons name="download-outline" size={64} color="#9ca3af" />
        <Text style={styles.offlineTitle}>Download required</Text>
        <Text style={styles.offlineText}>
          Download this {documentInfo.type.toLowerCase()} to open it in another app.
        </Text>
        {onDownload && (
          <TouchableOpacity style={styles.downloadButton} onPress={onDownload}>
            <Ionicons name="download" size={20} color="#fff" />
            <Text style={styles.downloadButtonText}>Download</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Inline viewer
  const renderInlineViewer = () => (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconContainer, { backgroundColor: documentInfo.color + '20' }]}>
            <Ionicons 
              name={documentInfo.icon as any} 
              size={20} 
              color={documentInfo.color} 
            />
          </View>
          <View style={styles.titleContainer}>
            <Text style={styles.fileName} numberOfLines={1}>{fileName}</Text>
            <View style={styles.fileMetaRow}>
              {fileSize && (
                <Text style={styles.fileInfo}>{formatFileSize(fileSize)}</Text>
              )}
              <Text style={[styles.fileType, { color: documentInfo.color }]}>
                {documentInfo.type}
              </Text>
            </View>
          </View>
        </View>
        
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={toggleFullscreen}>
            <Ionicons name="expand" size={20} color="#4b5563" />
          </TouchableOpacity>
          {onDownload && !isLocal && (
            <TouchableOpacity style={styles.headerButton} onPress={onDownload}>
              <Ionicons name="download-outline" size={20} color="#4b5563" />
            </TouchableOpacity>
          )}
          {onShare && (
            <TouchableOpacity style={styles.headerButton} onPress={onShare}>
              <Ionicons name="share-outline" size={20} color="#4b5563" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Document Content */}
      <View style={styles.contentContainer}>
        {renderDocumentContent(false)}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerInfo}>
          {isLocal ? (
            <>
              <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
              <Text style={styles.footerText}>Downloaded</Text>
            </>
          ) : (
            <>
              <Ionicons name="download-outline" size={14} color="#6b7280" />
              <Text style={styles.footerText}>Download required</Text>
            </>
          )}
        </View>

        <Text style={styles.hint}>Office documents open in another app</Text>
      </View>
    </View>
  );

  // Fullscreen modal
  const renderFullscreenViewer = () => (
    <Modal
      visible={isFullscreen}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={toggleFullscreen}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.fullscreenContainer}>
        {/* Fullscreen header */}
        <View style={[styles.fullscreenHeader, { backgroundColor: documentInfo.color }]}>
          <TouchableOpacity 
            style={styles.fullscreenCloseButton} 
            onPress={toggleFullscreen}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.fullscreenTitleContainer}>
            <Text style={styles.fullscreenTitle} numberOfLines={1}>{fileName}</Text>
            <Text style={styles.fullscreenSubtitle}>{documentInfo.type}</Text>
          </View>
          <View style={styles.fullscreenActions}>
            {onShare && (
              <TouchableOpacity style={styles.fullscreenActionButton} onPress={onShare}>
                <Ionicons name="share-outline" size={24} color="#fff" />
              </TouchableOpacity>
            )}
            {onDownload && !isLocal && (
              <TouchableOpacity style={styles.fullscreenActionButton} onPress={onDownload}>
                <Ionicons name="download-outline" size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Document Content */}
        {renderDocumentContent(true)}
      </View>
    </Modal>
  );

  return (
    <>
      {renderInlineViewer()}
      {renderFullscreenViewer()}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  fileInfo: {
    fontSize: 12,
    color: '#6b7280',
  },
  fileType: {
    fontSize: 12,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  contentContainer: {
    height: 400,
    backgroundColor: '#f9fafb',
  },
  webViewContainer: {
    flex: 1,
  },
  fullscreenWebViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  loadingHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#9ca3af',
  },
  offlineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  offlineTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  offlineText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  errorText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ea4335',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  downloadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Local document viewer styles
  localDocContainer: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'space-between',
    padding: 24,
  },
  localDocHeader: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  localDocTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 16,
    textAlign: 'center',
  },
  localDocSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  localDocContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  localDocMessage: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  localDocHint: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  localDocActions: {
    gap: 12,
  },
  primaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  secondaryActionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  localDocFooterNote: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: 11,
    color: '#6b7280',
  },
  hint: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  // Fullscreen styles
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  fullscreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 44,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  fullscreenCloseButton: {
    padding: 8,
  },
  fullscreenTitleContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  fullscreenTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  fullscreenSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  fullscreenActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fullscreenActionButton: {
    padding: 8,
  },
});
