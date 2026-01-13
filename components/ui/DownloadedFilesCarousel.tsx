/**
 * DownloadedFilesCarousel Component
 * 
 * A carousel/swiper UI for displaying multiple downloaded files
 * with REAL inline viewers, paging dots, file actions, and total storage display.
 * 
 * Features:
 * - Swipeable carousel with inline file viewers
 * - Real video/audio players embedded in carousel
 * - Image previews with fullscreen tap
 * - Paging dots indicator
 * - View, Share, Delete actions
 * - List view of all downloaded files
 * - Fullscreen button for each viewer
 */

import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import React, { useRef, useState } from 'react';
import {
    Dimensions,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ViewToken
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;
const PREVIEW_HEIGHT = 160;

export type FileType = 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'code' | 'other';

export interface DownloadedFile {
  id: string;
  uri: string;
  fileName: string;
  fileSize: number; // in bytes
  fileType: FileType;
  downloadDate: string;
  originalIndex?: number;
}

interface DownloadedFilesCarouselProps {
  files: DownloadedFile[];
  onViewFile: (file: DownloadedFile) => void;
  onShareFile: (file: DownloadedFile) => void;
  onDeleteFile: (file: DownloadedFile) => void;
  onDownloadMore?: () => void;
  onDeleteAll?: () => void;
  isOnline?: boolean;
  totalFiles?: number; // Total files available (downloaded + not downloaded)
}

// Helper functions
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getFileTypeIcon = (fileType: FileType): keyof typeof Ionicons.glyphMap => {
  switch (fileType) {
    case 'image': return 'image';
    case 'video': return 'videocam';
    case 'audio': return 'musical-notes';
    case 'pdf': return 'document-text';
    case 'document': return 'document';
    case 'code': return 'code-slash';
    default: return 'attach';
  }
};

const getFileTypeColor = (fileType: FileType): string => {
  switch (fileType) {
    case 'image': return '#06b6d4';
    case 'video': return '#ea4335';
    case 'audio': return '#9333ea';
    case 'pdf': return '#dc2626';
    case 'document': return '#1967d2';
    case 'code': return '#6366f1';
    default: return '#6b7280';
  }
};

const getFileTypeLabel = (fileType: FileType): string => {
  switch (fileType) {
    case 'image': return 'Image';
    case 'video': return 'Video';
    case 'audio': return 'Audio';
    case 'pdf': return 'PDF';
    case 'document': return 'Document';
    case 'code': return 'Code';
    default: return 'File';
  }
};

export default function DownloadedFilesCarousel({
  files,
  onViewFile,
  onShareFile,
  onDeleteFile,
  onDownloadMore,
  onDeleteAll,
  isOnline = true,
  totalFiles,
}: DownloadedFilesCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showListView, setShowListView] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Calculate total storage used
  const totalStorageBytes = files.reduce((acc, file) => acc + file.fileSize, 0);
  const totalStorageFormatted = formatFileSize(totalStorageBytes);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  // Render file preview based on type - REAL inline viewers
  const renderFilePreview = (item: DownloadedFile) => {
    const color = getFileTypeColor(item.fileType);
    
    // IMAGE - Show actual image with fullscreen tap
    if (item.fileType === 'image') {
      return (
        <TouchableOpacity 
          style={styles.previewContainer}
          onPress={() => onViewFile(item)}
          activeOpacity={0.9}
        >
          <Image 
            source={{ uri: item.uri }} 
            style={styles.imagePreview}
            resizeMode="contain"
          />
          <View style={styles.fullscreenHint}>
            <Ionicons name="expand-outline" size={18} color="#fff" />
            <Text style={styles.fullscreenHintText}>Fullscreen</Text>
          </View>
        </TouchableOpacity>
      );
    }
    
    // VIDEO - Show actual video player with controls
    if (item.fileType === 'video') {
      return (
        <View style={styles.videoPlayerContainer}>
          <Video
            source={{ uri: item.uri }}
            style={styles.videoPlayer}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
          />
          <TouchableOpacity 
            style={styles.videoFullscreenBtn}
            onPress={() => onViewFile(item)}
          >
            <Ionicons name="expand" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      );
    }
    
    // AUDIO - Show audio player with visual
    if (item.fileType === 'audio') {
      return (
        <View style={styles.audioPlayerContainer}>
          <View style={[styles.audioVisual, { backgroundColor: `${color}15` }]}>
            <Ionicons name="musical-notes" size={40} color={color} />
          </View>
          <Video
            source={{ uri: item.uri }}
            style={styles.audioPlayer}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
          />
          <TouchableOpacity 
            style={styles.audioFullscreenBtn}
            onPress={() => onViewFile(item)}
          >
            <Ionicons name="expand" size={16} color="#4285f4" />
            <Text style={styles.audioFullscreenText}>Fullscreen</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    // PDF/DOCUMENT - Show preview card with open button
    if (item.fileType === 'pdf' || item.fileType === 'document') {
      return (
        <TouchableOpacity 
          style={[styles.documentPreviewContainer, { backgroundColor: `${color}08` }]}
          onPress={() => onViewFile(item)}
          activeOpacity={0.9}
        >
          <View style={[styles.documentIconBg, { backgroundColor: `${color}15` }]}>
            <Ionicons name={getFileTypeIcon(item.fileType)} size={56} color={color} />
          </View>
          <Text style={styles.documentPreviewName} numberOfLines={2}>{item.fileName}</Text>
          <View style={[styles.documentOpenBtn, { backgroundColor: color }]}>
            <Ionicons name="eye" size={18} color="#fff" />
            <Text style={styles.documentOpenText}>View Document</Text>
          </View>
        </TouchableOpacity>
      );
    }
    
    // OTHER file types - Show icon with open action
    return (
      <TouchableOpacity 
        style={[styles.previewContainer, { backgroundColor: `${color}08` }]}
        onPress={() => onViewFile(item)}
        activeOpacity={0.9}
      >
        <View style={styles.fileTypePreview}>
          <View style={[styles.previewIconContainer, { backgroundColor: `${color}15` }]}>
            <Ionicons name={getFileTypeIcon(item.fileType)} size={48} color={color} />
          </View>
          <Text style={[styles.previewTypeLabel, { color }]}>{getFileTypeLabel(item.fileType)}</Text>
          <View style={styles.tapToViewHint}>
            <Ionicons name="eye-outline" size={16} color="#6b7280" />
            <Text style={styles.tapToViewText}>Tap to view</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFileCard = ({ item, index }: { item: DownloadedFile; index: number }) => {
    const color = getFileTypeColor(item.fileType);
    
    return (
      <View style={styles.cardContainer}>
        <View style={styles.card}>
          {/* File Preview Area */}
          {renderFilePreview(item)}

          {/* File Info */}
          <View style={styles.cardInfo}>
            <Text style={styles.fileName} numberOfLines={2}>{item.fileName}</Text>
            
            <View style={styles.fileMetaRow}>
              <View style={[styles.fileTypeBadge, { backgroundColor: `${color}15` }]}>
                <Ionicons name={getFileTypeIcon(item.fileType)} size={14} color={color} />
                <Text style={[styles.fileTypeText, { color }]}>{getFileTypeLabel(item.fileType)}</Text>
              </View>
              <Text style={styles.fileSizeText}>{formatFileSize(item.fileSize)}</Text>
            </View>

            {/* Cached Badge */}
            <View style={styles.cachedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
              <Text style={styles.cachedText}>Downloaded • {item.downloadDate}</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity 
              style={[styles.actionButton, styles.viewButton]} 
              onPress={() => onViewFile(item)}
            >
              <Ionicons name="eye" size={18} color="#fff" />
              <Text style={styles.actionButtonText}>View</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionButton, styles.shareButton]} 
              onPress={() => onShareFile(item)}
            >
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={styles.actionButtonText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionButton, styles.deleteButton]} 
              onPress={() => onDeleteFile(item)}
            >
              <Ionicons name="trash-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderPaginationDots = () => {
    if (files.length <= 1) return null;
    
    return (
      <View style={styles.paginationContainer}>
        <Text style={styles.paginationText}>
          {activeIndex + 1} / {files.length}
        </Text>
        <View style={styles.dotsRow}>
          {files.map((_, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.paginationDot,
                index === activeIndex && styles.paginationDotActive,
              ]}
              onPress={() => {
                flatListRef.current?.scrollToIndex({ index, animated: true });
              }}
            />
          ))}
        </View>
        {files.length > 1 && (
          <Text style={styles.swipeHint}>← Swipe for more →</Text>
        )}
      </View>
    );
  };

  // Render list view of all files
  const renderListView = () => {
    return (
      <View style={styles.listViewContainer}>
        <View style={styles.listViewHeader}>
          <View style={styles.listViewTitleRow}>
            <Ionicons name="list" size={18} color="#374151" />
            <Text style={styles.listViewTitle}>All Downloaded Files</Text>
          </View>
          <TouchableOpacity onPress={() => setShowListView(false)}>
            <Ionicons name="chevron-up" size={20} color="#6b7280" />
          </TouchableOpacity>
        </View>
        
        {files.map((file, index) => {
          const color = getFileTypeColor(file.fileType);
          return (
            <TouchableOpacity 
              key={file.id}
              style={styles.listItem}
              onPress={() => onViewFile(file)}
            >
              <View style={[styles.listItemIcon, { backgroundColor: `${color}15` }]}>
                <Ionicons name={getFileTypeIcon(file.fileType)} size={20} color={color} />
              </View>
              <View style={styles.listItemInfo}>
                <Text style={styles.listItemName} numberOfLines={1}>{file.fileName}</Text>
                <Text style={styles.listItemMeta}>
                  {getFileTypeLabel(file.fileType)} • {formatFileSize(file.fileSize)}
                </Text>
              </View>
              <View style={styles.listItemActions}>
                <TouchableOpacity 
                  style={styles.listItemButton}
                  onPress={() => onViewFile(file)}
                >
                  <Ionicons name="eye-outline" size={20} color="#1967d2" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.listItemButton}
                  onPress={() => onDeleteFile(file)}
                >
                  <Ionicons name="trash-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Delete All Button */}
        {files.length > 1 && onDeleteAll && (
          <TouchableOpacity style={styles.deleteAllButton} onPress={onDeleteAll}>
            <Ionicons name="trash" size={18} color="#ef4444" />
            <Text style={styles.deleteAllText}>Delete All Downloads</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (files.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
          <Text style={styles.headerTitle}>
            Downloaded Files ({files.length}{totalFiles ? `/${totalFiles}` : ''})
          </Text>
          {totalFiles && files.length === totalFiles && (
            <View style={styles.allDownloadedBadge}>
              <Ionicons name="checkmark" size={12} color="#fff" />
            </View>
          )}
        </View>
        <TouchableOpacity 
          style={styles.listViewToggle}
          onPress={() => setShowListView(!showListView)}
        >
          <Ionicons name={showListView ? "albums" : "list"} size={20} color="#1967d2" />
        </TouchableOpacity>
      </View>

      {/* Storage Info */}
      <View style={styles.storageBar}>
        <Ionicons name="folder-outline" size={14} color="#6b7280" />
        <Text style={styles.storageText}>
          {files.length} {files.length === 1 ? 'file' : 'files'} • {totalStorageFormatted} used
        </Text>
      </View>

      {/* Carousel View */}
      {!showListView && (
        <>
          <FlatList
            ref={flatListRef}
            data={files}
            renderItem={renderFileCard}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + 16}
            decelerationRate="fast"
            contentContainerStyle={styles.carouselContent}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />

          {/* Pagination Dots */}
          {renderPaginationDots()}
        </>
      )}

      {/* List View */}
      {showListView && renderListView()}

      {/* Download More Button */}
      {isOnline && onDownloadMore && totalFiles && files.length < totalFiles && (
        <TouchableOpacity style={styles.downloadMoreButton} onPress={onDownloadMore}>
          <Ionicons name="add-circle-outline" size={18} color="#1967d2" />
          <Text style={styles.downloadMoreText}>
            Download More ({totalFiles - files.length} remaining)
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  allDownloadedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listViewToggle: {
    padding: 6,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
  },
  storageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  storageText: {
    fontSize: 12,
    color: '#6b7280',
  },
  carouselContent: {
    paddingLeft: 0,
  },
  cardContainer: {
    width: CARD_WIDTH,
    marginRight: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  // Preview styles
  previewContainer: {
    height: PREVIEW_HEIGHT,
    backgroundColor: '#f3f4f6',
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  videoPreview: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  previewOverlayText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  fileTypePreview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewTypeLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  tapToViewHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tapToViewText: {
    fontSize: 12,
    color: '#6b7280',
  },
  // Card info
  cardInfo: {
    padding: 14,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  fileTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  fileTypeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  fileSizeText: {
    fontSize: 12,
    color: '#6b7280',
  },
  cachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cachedText: {
    fontSize: 11,
    color: '#16a34a',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    paddingTop: 0,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 8,
  },
  viewButton: {
    backgroundColor: '#1967d2',
    flex: 2,
  },
  shareButton: {
    backgroundColor: '#9333ea',
    flex: 1,
  },
  deleteButton: {
    backgroundColor: '#ef4444',
    flex: 0,
    paddingHorizontal: 12,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  // Pagination
  paginationContainer: {
    alignItems: 'center',
    marginTop: 12,
  },
  paginationText: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#d1d5db',
  },
  paginationDotActive: {
    backgroundColor: '#1967d2',
    width: 20,
  },
  swipeHint: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 6,
  },
  // List view styles
  listViewContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
  },
  listViewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  listViewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  listViewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  listItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  listItemInfo: {
    flex: 1,
  },
  listItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  listItemMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  listItemActions: {
    flexDirection: 'row',
    gap: 4,
  },
  listItemButton: {
    padding: 8,
  },
  deleteAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  deleteAllText: {
    fontSize: 13,
    color: '#ef4444',
    fontWeight: '500',
  },
  downloadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderStyle: 'dashed',
  },
  downloadMoreText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1967d2',
  },
  // ===== INLINE VIDEO/AUDIO PLAYER STYLES =====
  videoPlayerContainer: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
    minHeight: 180,
  },
  videoFullscreenBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  audioPlayerContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    overflow: 'hidden',
    padding: 16,
  },
  audioVisual: {
    width: '100%',
    height: 80,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  audioPlayer: {
    width: '100%',
    height: 50,
  },
  audioFullscreenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 10,
    paddingVertical: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
  },
  audioFullscreenText: {
    fontSize: 12,
    color: '#1967d2',
    fontWeight: '500',
  },
  documentPreviewContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  documentPreviewName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 10,
  },
  documentOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1967d2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  documentOpenText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  fullscreenHint: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fullscreenHintText: {
    color: '#fff',
    fontSize: 11,
  },
});
