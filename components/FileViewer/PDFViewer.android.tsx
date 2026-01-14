/**
 * PDFViewer (Android)
 *
 * Uses a native PDF renderer (react-native-pdf) for reliable in-app viewing,
 * including offline viewing of downloaded file:// PDFs.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Pdf from 'react-native-pdf';
import { formatFileSize } from './utils';

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

export default function PDFViewerAndroid({
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
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const isLocal = isCached || uri.startsWith('file://');

  const source = useMemo(() => {
    // react-native-pdf supports both local file:// and remote URLs.
    // For remote, enable cache for more stable behavior.
    return isLocal ? ({ uri } as any) : ({ uri, cache: true } as any);
  }, [isLocal, uri]);

  const handleReload = () => {
    setHasError(false);
    setIsLoading(true);
    setReloadKey((k) => k + 1);
  };

  const toggleFullscreen = () => {
    setIsFullscreen((v) => !v);
  };

  const renderError = () => (
    <View style={styles.errorContainer}>
      <Ionicons name="document-text-outline" size={64} color="#9ca3af" />
      <Text style={styles.errorTitle}>Unable to load PDF</Text>
      <Text style={styles.errorText}>
        The PDF could not be displayed. You can retry or open it externally.
      </Text>
      <View style={styles.errorActions}>
        <TouchableOpacity style={styles.retryButton} onPress={handleReload}>
          <Ionicons name="refresh" size={18} color="#374151" />
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        {onShare && (
          <TouchableOpacity style={styles.downloadButton} onPress={onShare}>
            <Ionicons name="open-outline" size={18} color="#fff" />
            <Text style={styles.downloadButtonText}>Open Externally</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderOffline = () => (
    <View style={styles.offlineContainer}>
      <Ionicons name="cloud-offline" size={64} color="#9ca3af" />
      <Text style={styles.offlineTitle}>No Internet Connection</Text>
      <Text style={styles.offlineText}>Download this PDF for offline viewing</Text>
      {onDownload && (
        <TouchableOpacity style={styles.downloadButton} onPress={onDownload}>
          <Ionicons name="download" size={20} color="#fff" />
          <Text style={styles.downloadButtonText}>Download PDF</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderPDFContent = (isFullscreenMode: boolean) => {
    if (!isOnline && !isLocal) return renderOffline();
    if (hasError) return renderError();

    return (
      <View style={[styles.pdfContainer, isFullscreenMode && styles.fullscreenPdfContainer]}>
        <Pdf
          key={reloadKey}
          source={source}
          style={styles.pdf}
          onLoadComplete={() => {
            setIsLoading(false);
            setHasError(false);
          }}
          onError={(error) => {
            console.warn('PDF render error:', error);
            setIsLoading(false);
            setHasError(true);
          }}
          onLoadProgress={() => {
            // keep spinner visible while loading
            setIsLoading(true);
          }}
          enablePaging={false}
          enableAnnotationRendering
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
            <Text style={styles.fileName} numberOfLines={1}>
              {fileName}
            </Text>
            <View style={styles.fileMetaRow}>
              {fileSize != null && <Text style={styles.fileInfo}>{formatFileSize(fileSize)}</Text>}
              <Text style={styles.fileType}>PDF Document</Text>
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

      {/* PDF Content */}
      <View style={styles.contentContainer}>{renderPDFContent(false)}</View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerInfo}>
          {isLocal ? (
            <View style={styles.cachedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
              <Text style={styles.cachedText}>Available offline</Text>
            </View>
          ) : (
            <View style={styles.onlineBadge}>
              <Ionicons name="cloud" size={14} color="#1967d2" />
              <Text style={styles.onlineText}>Viewing online</Text>
            </View>
          )}
        </View>

        <View style={styles.footerActions}>
          {isLocal && onSaveToDevice && (
            <TouchableOpacity style={styles.actionButton} onPress={onSaveToDevice}>
              <Ionicons name="phone-portrait-outline" size={18} color="#1967d2" />
              <Text style={styles.actionButtonText}>Export</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  // Fullscreen modal
  const renderFullscreenViewer = () => (
    <Modal visible={isFullscreen} animationType="fade" statusBarTranslucent onRequestClose={toggleFullscreen}>
      <StatusBar hidden />
      <View style={styles.fullscreenContainer}>
        <View style={styles.fullscreenHeader}>
          <TouchableOpacity style={styles.fullscreenButton} onPress={toggleFullscreen}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.fullscreenTitle} numberOfLines={1}>
            {fileName}
          </Text>
          <View style={styles.fullscreenActions}>
            {onShare && (
              <TouchableOpacity style={styles.fullscreenButton} onPress={onShare}>
                <Ionicons name="share-outline" size={24} color="#fff" />
              </TouchableOpacity>
            )}
            {onDownload && !isLocal && (
              <TouchableOpacity style={styles.fullscreenButton} onPress={onDownload}>
                <Ionicons name="download-outline" size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.fullscreenContent}>{renderPDFContent(true)}</View>
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
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
    marginLeft: 10,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
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
    color: '#6b7280',
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
  pdfContainer: {
    flex: 1,
  },
  fullscreenPdfContainer: {
    flex: 1,
  },
  pdf: {
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
  },
  cachedText: {
    fontSize: 12,
    color: '#16a34a',
    fontWeight: '600',
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
  },
  onlineText: {
    fontSize: 12,
    color: '#1967d2',
    fontWeight: '600',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
  },
  actionButtonText: {
    fontSize: 12,
    color: '#1967d2',
    fontWeight: '600',
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 44,
    paddingBottom: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  fullscreenButton: {
    padding: 8,
  },
  fullscreenTitle: {
    flex: 1,
    marginHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  fullscreenActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fullscreenContent: {
    flex: 1,
    backgroundColor: '#111827',
  },
});
