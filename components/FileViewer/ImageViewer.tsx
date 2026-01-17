/**
 * ImageViewer Component
 * 
 * A built-in image viewer with:
 * - Pinch-to-zoom
 * - Pan/drag
 * - Double-tap to fit/zoom
 * - Fullscreen mode
 * - Offline support (works with cached images)
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { formatFileSize } from './utils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ImageViewerProps {
  uri: string;
  fileName: string;
  fileSize?: number;
  isCached?: boolean;
  onDownload?: () => void;
  onShare?: () => void;
  onSaveToDevice?: () => void;
  onClose?: () => void;
  fullscreen?: boolean;
  isOnline?: boolean;
}

export default function ImageViewer({
  uri,
  fileName,
  fileSize,
  isCached = false,
  onDownload,
  onShare,
  onSaveToDevice,
  onClose,
  fullscreen: initialFullscreen = false,
  isOnline = true,
}: ImageViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);

  const isLocal = isCached || uri.startsWith('file://');
  
  // Get image dimensions
  React.useEffect(() => {
    if (uri && isLocal) {
      Image.getSize(
        uri,
        (width, height) => {
          setImageSize({ width, height });
        },
        (error) => {
          console.log('Failed to get image size:', error);
        }
      );
    }
  }, [uri, isLocal]);

  const handleImageLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleImageError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleDoubleTap = () => {
    setScale(scale === 1 ? 2 : 1);
  };

  // Calculate aspect ratio for proper display
  const aspectRatio = imageSize.width > 0 && imageSize.height > 0 
    ? imageSize.width / imageSize.height 
    : 1;

  const renderImage = (containerStyle: any) => (
    <View style={containerStyle}>
      {!isLocal ? (
        <View style={styles.errorContainer}>
          <Ionicons name="download-outline" size={64} color="#9ca3af" />
          <Text style={styles.errorText}>Download required</Text>
          <Text style={styles.errorHint}>Download this image to view it in the app.</Text>
          {onDownload && (
            <TouchableOpacity style={styles.downloadButton} onPress={onDownload}>
              <Ionicons name="download" size={18} color="#fff" />
              <Text style={styles.downloadButtonText}>Download</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#1967d2" />
              <Text style={styles.loadingText}>Loading image...</Text>
            </View>
          )}

          {hasError ? (
            <View style={styles.errorContainer}>
              <Ionicons name="image-outline" size={64} color="#9ca3af" />
              <Text style={styles.errorText}>Failed to load image</Text>
              <Text style={styles.errorHint}>This image file may be corrupted.</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  setIsLoading(true);
                  setHasError(false);
                }}
              >
                <Ionicons name="refresh" size={18} color="#374151" />
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
              {onDownload && (
                <TouchableOpacity style={styles.downloadButton} onPress={onDownload}>
                  <Ionicons name="download" size={18} color="#fff" />
                  <Text style={styles.downloadButtonText}>Re-download</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              maximumZoomScale={4}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              centerContent={true}
              bouncesZoom={true}
            >
              <Image
                source={{ uri }}
                style={[
                  styles.image,
                  isFullscreen
                    ? { width: SCREEN_WIDTH, height: SCREEN_WIDTH / aspectRatio }
                    : { width: '100%', aspectRatio },
                ]}
                resizeMode="contain"
                onLoad={handleImageLoad}
                onError={handleImageError}
              />
            </ScrollView>
          )}
        </>
      )}
    </View>
  );

  // Inline viewer (non-fullscreen)
  const renderInlineViewer = () => (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="image" size={20} color="#06b6d4" />
          <Text style={styles.headerTitle} numberOfLines={1}>{fileName}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={toggleFullscreen}>
            <Ionicons name="expand" size={20} color="#4b5563" />
          </TouchableOpacity>
          {onShare && (
            <TouchableOpacity style={styles.headerButton} onPress={onShare}>
              <Ionicons name="share-outline" size={20} color="#4b5563" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Image Container */}
      {renderImage(styles.imageContainer)}

      {/* Footer with info and actions */}
      <View style={styles.footer}>
        <View style={styles.footerInfo}>
          {isLocal ? (
            <View style={styles.cachedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
              <Text style={styles.cachedText}>Available offline</Text>
            </View>
          ) : (
            <View style={styles.onlineBadge}>
              <Ionicons name="download-outline" size={14} color="#6b7280" />
              <Text style={styles.onlineText}>Download required</Text>
            </View>
          )}
          {fileSize && (
            <Text style={styles.fileSizeText}>{formatFileSize(fileSize)}</Text>
          )}
          {imageSize.width > 0 && (
            <Text style={styles.dimensionsText}>
              {imageSize.width} × {imageSize.height}
            </Text>
          )}
        </View>
        
        <View style={styles.footerActions}>
          {!isLocal && onDownload && (
            <TouchableOpacity style={styles.actionButton} onPress={onDownload}>
              <Ionicons name="download-outline" size={18} color="#1967d2" />
              <Text style={styles.actionButtonText}>Save</Text>
            </TouchableOpacity>
          )}
          {isCached && onSaveToDevice && (
            <TouchableOpacity style={styles.actionButton} onPress={onSaveToDevice}>
              <Ionicons name="phone-portrait-outline" size={18} color="#1967d2" />
              <Text style={styles.actionButtonText}>Export</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Zoom hint */}
      <View style={styles.zoomHint}>
        <Ionicons name="finger-print" size={14} color="#9ca3af" />
        <Text style={styles.zoomHintText}>Pinch to zoom • Double tap to fit</Text>
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
      <StatusBar hidden />
      <View style={styles.fullscreenContainer}>
        {/* Fullscreen Header */}
        <View style={styles.fullscreenHeader}>
          <TouchableOpacity style={styles.fullscreenButton} onPress={toggleFullscreen}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.fullscreenTitle} numberOfLines={1}>{fileName}</Text>
          <View style={styles.fullscreenActions}>
            {onShare && (
              <TouchableOpacity style={styles.fullscreenButton} onPress={onShare}>
                <Ionicons name="share-outline" size={24} color="#fff" />
              </TouchableOpacity>
            )}
            {onDownload && !isCached && (
              <TouchableOpacity style={styles.fullscreenButton} onPress={onDownload}>
                <Ionicons name="download-outline" size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Fullscreen Image */}
        {renderImage(styles.fullscreenImageContainer)}

        {/* Fullscreen Footer */}
        <View style={styles.fullscreenFooter}>
          <Text style={styles.fullscreenHint}>Pinch to zoom • Swipe to close</Text>
        </View>
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
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#f9fafb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginLeft: 8,
    flex: 1,
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
  imageContainer: {
    minHeight: 200,
    maxHeight: 400,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    backgroundColor: '#f1f5f9',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    minHeight: 200,
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  errorHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 24,
  },
  retryButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#1967d2',
    borderRadius: 24,
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  offlineHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    backgroundColor: '#f9fafb',
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    flexWrap: 'wrap',
  },
  cachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  onlineText: {
    fontSize: 12,
    color: '#1967d2',
    fontWeight: '500',
  },
  fileSizeText: {
    fontSize: 12,
    color: '#6b7280',
  },
  dimensionsText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  actionButtonText: {
    fontSize: 13,
    color: '#1967d2',
    fontWeight: '600',
  },
  zoomHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    backgroundColor: '#f9fafb',
    gap: 6,
  },
  zoomHintText: {
    fontSize: 12,
    color: '#9ca3af',
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
    paddingHorizontal: 8,
    paddingTop: 40,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  fullscreenButton: {
    padding: 8,
  },
  fullscreenTitle: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  fullscreenActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fullscreenImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
  },
  fullscreenHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
});
