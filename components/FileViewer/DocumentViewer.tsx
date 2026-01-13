/**
 * DocumentViewer Component
 * 
 * View Office documents (Word, Excel, PowerPoint) using:
 * - Microsoft Office Online viewer
 * - Google Docs viewer as fallback
 * 
 * Note: Requires online connection for viewing
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { WebView } from 'react-native-webview';
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
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewerType, setViewerType] = useState<'microsoft' | 'google'>('microsoft');

  const documentInfo = getDocumentInfo(fileName);

  // Microsoft Office Online viewer
  const getMicrosoftViewerUrl = () => {
    const encodedUri = encodeURIComponent(uri);
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUri}`;
  };

  // Google Docs viewer as fallback
  const getGoogleViewerUrl = () => {
    const encodedUri = encodeURIComponent(uri);
    return `https://docs.google.com/viewer?url=${encodedUri}&embedded=true`;
  };

  const getViewerUrl = () => {
    return viewerType === 'microsoft' ? getMicrosoftViewerUrl() : getGoogleViewerUrl();
  };

  const handleLoadStart = () => {
    setIsLoading(true);
    setHasError(false);
  };

  const handleLoadEnd = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    // Try Google viewer if Microsoft fails
    if (viewerType === 'microsoft') {
      setViewerType('google');
      return;
    }
    setIsLoading(false);
    setHasError(true);
  };

  const handleReload = () => {
    setHasError(false);
    setIsLoading(true);
    setViewerType('microsoft'); // Reset to Microsoft viewer
    webViewRef.current?.reload();
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const renderDocumentContent = (isFullscreenMode: boolean = false) => {
    if (!isOnline) {
      return (
        <View style={styles.offlineContainer}>
          <Ionicons name="cloud-offline" size={64} color="#9ca3af" />
          <Text style={styles.offlineTitle}>No Internet Connection</Text>
          <Text style={styles.offlineText}>
            Office documents require an internet connection to view.
            {'\n'}Download the file to open with another app.
          </Text>
          {onDownload && (
            <TouchableOpacity style={styles.downloadButton} onPress={onDownload}>
              <Ionicons name="download" size={20} color="#fff" />
              <Text style={styles.downloadButtonText}>Download Document</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (hasError) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name={documentInfo.icon as any} size={64} color="#9ca3af" />
          <Text style={styles.errorTitle}>Unable to display document</Text>
          <Text style={styles.errorText}>
            This document format cannot be previewed.{'\n'}
            Download it to open with another app.
          </Text>
          <View style={styles.errorActions}>
            <TouchableOpacity style={styles.retryButton} onPress={handleReload}>
              <Ionicons name="refresh" size={18} color="#374151" />
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
            {onDownload && (
              <TouchableOpacity style={styles.downloadButton} onPress={onDownload}>
                <Ionicons name="download" size={18} color="#fff" />
                <Text style={styles.downloadButtonText}>Download</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    return (
      <View style={[
        styles.webViewContainer,
        isFullscreenMode && styles.fullscreenWebViewContainer
      ]}>
        <WebView
          ref={webViewRef}
          source={{ uri: getViewerUrl() }}
          style={styles.webView}
          onLoadStart={handleLoadStart}
          onLoadEnd={handleLoadEnd}
          onError={handleError}
          originWhitelist={['*']}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={false}
          scalesPageToFit={true}
          bounces={false}
        />
        
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={documentInfo.color} />
            <Text style={styles.loadingText}>Loading document...</Text>
            <Text style={styles.loadingHint}>
              Using {viewerType === 'microsoft' ? 'Microsoft Office' : 'Google Docs'} viewer
            </Text>
          </View>
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
          {onDownload && (
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
          <Ionicons name="globe-outline" size={14} color="#6b7280" />
          <Text style={styles.footerText}>
            Powered by {viewerType === 'microsoft' ? 'Microsoft Office Online' : 'Google Docs'}
          </Text>
        </View>
        
        <Text style={styles.hint}>Scroll to view • Pinch to zoom</Text>
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
            {onDownload && (
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
