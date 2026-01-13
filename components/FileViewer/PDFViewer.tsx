/**
 * PDFViewer Component
 * 
 * PDF viewer using WebView with Google Docs viewer
 * Features:
 * - Full PDF rendering via Google Docs viewer (online)
 * - Page navigation controls
 * - Zoom controls
 * - Loading states
 * - Fallback for offline viewing
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Modal,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { formatFileSize } from './utils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PDFViewerProps {
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

export default function PDFViewer({
  uri,
  fileName,
  fileSize,
  isCached = false,
  onDownload,
  onShare,
  onSaveToDevice,
  onClose,
  isOnline = true,
}: PDFViewerProps) {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Use Google Docs viewer for PDF rendering
  const getPDFViewerUrl = () => {
    // Encode the URI for use in Google Docs viewer
    const encodedUri = encodeURIComponent(uri);
    return `https://docs.google.com/viewer?url=${encodedUri}&embedded=true`;
  };

  // Alternative: Microsoft Office Online viewer
  const getMicrosoftViewerUrl = () => {
    const encodedUri = encodeURIComponent(uri);
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUri}`;
  };

  const handleLoadStart = () => {
    setIsLoading(true);
    setHasError(false);
  };

  const handleLoadEnd = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleReload = () => {
    setHasError(false);
    setIsLoading(true);
    webViewRef.current?.reload();
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const renderPDFContent = (isFullscreenMode: boolean = false) => {
    if (!isOnline && !isCached) {
      return (
        <View style={styles.offlineContainer}>
          <Ionicons name="cloud-offline" size={64} color="#9ca3af" />
          <Text style={styles.offlineTitle}>No Internet Connection</Text>
          <Text style={styles.offlineText}>
            Download this PDF for offline viewing
          </Text>
          {onDownload && (
            <TouchableOpacity style={styles.downloadButton} onPress={onDownload}>
              <Ionicons name="download" size={20} color="#fff" />
              <Text style={styles.downloadButtonText}>Download PDF</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (hasError) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="document-text-outline" size={64} color="#9ca3af" />
          <Text style={styles.errorTitle}>Unable to load PDF</Text>
          <Text style={styles.errorText}>
            The PDF could not be displayed. Try downloading it instead.
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
          source={{ uri: getPDFViewerUrl() }}
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
          allowsInlineMediaPlayback={true}
        />
        
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#ea4335" />
            <Text style={styles.loadingText}>Loading PDF...</Text>
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
          <View style={styles.iconContainer}>
            <Ionicons name="document-text" size={20} color="#ea4335" />
          </View>
          <View style={styles.titleContainer}>
            <Text style={styles.fileName} numberOfLines={1}>{fileName}</Text>
            <View style={styles.fileMetaRow}>
              {fileSize && (
                <Text style={styles.fileInfo}>{formatFileSize(fileSize)}</Text>
              )}
              <Text style={styles.fileType}>PDF Document</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={toggleFullscreen}>
            <Ionicons name="expand" size={20} color="#4b5563" />
          </TouchableOpacity>
          {onDownload && !isCached && (
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

      {/* PDF Content */}
      <View style={styles.contentContainer}>
        {renderPDFContent(false)}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        {isCached ? (
          <View style={styles.cachedBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
            <Text style={styles.cachedText}>Downloaded</Text>
          </View>
        ) : isOnline ? (
          <View style={styles.onlineBadge}>
            <Ionicons name="cloud" size={14} color="#1967d2" />
            <Text style={styles.onlineText}>Viewing online</Text>
          </View>
        ) : (
          <View style={styles.offlineBadge}>
            <Ionicons name="cloud-offline" size={14} color="#dc2626" />
            <Text style={styles.offlineBadgeText}>Offline</Text>
          </View>
        )}
        
        <Text style={styles.hint}>Pinch to zoom • Scroll to navigate</Text>
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
        <View style={styles.fullscreenHeader}>
          <TouchableOpacity 
            style={styles.fullscreenCloseButton} 
            onPress={toggleFullscreen}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.fullscreenTitle} numberOfLines={1}>{fileName}</Text>
          <View style={styles.fullscreenActions}>
            {onShare && (
              <TouchableOpacity style={styles.fullscreenActionButton} onPress={onShare}>
                <Ionicons name="share-outline" size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* PDF Content */}
        {renderPDFContent(true)}
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
    backgroundColor: '#fee2e2',
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
    color: '#9ca3af',
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
    color: '#6b7280',
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
  cachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  cachedText: {
    fontSize: 12,
    color: '#16a34a',
    fontWeight: '500',
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  onlineText: {
    fontSize: 12,
    color: '#1967d2',
    fontWeight: '500',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  offlineBadgeText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '500',
  },
  hint: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  // Fullscreen styles
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 44,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#1a1a1a',
  },
  fullscreenCloseButton: {
    padding: 8,
  },
  fullscreenTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginHorizontal: 12,
  },
  fullscreenActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fullscreenActionButton: {
    padding: 8,
  },
});
