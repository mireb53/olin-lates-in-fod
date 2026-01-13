/**
 * DownloadedFilesCarousel Component
 * 
 * A carousel/swiper UI for displaying multiple downloaded files
 * with paging dots, file actions, and total storage display.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
    Dimensions,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ViewToken
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;

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
  isOnline?: boolean;
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
  isOnline = true,
}: DownloadedFilesCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
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

  const renderFileCard = ({ item, index }: { item: DownloadedFile; index: number }) => {
    const color = getFileTypeColor(item.fileType);
    
    return (
      <View style={styles.cardContainer}>
        <View style={styles.card}>
          {/* File Type Badge */}
          <View style={[styles.fileTypeBadge, { backgroundColor: `${color}15` }]}>
            <Ionicons name={getFileTypeIcon(item.fileType)} size={20} color={color} />
            <Text style={[styles.fileTypeText, { color }]}>{getFileTypeLabel(item.fileType)}</Text>
          </View>

          {/* File Icon */}
          <View style={[styles.fileIconContainer, { backgroundColor: `${color}10` }]}>
            <Ionicons name={getFileTypeIcon(item.fileType)} size={48} color={color} />
          </View>

          {/* File Info */}
          <Text style={styles.fileName} numberOfLines={2}>{item.fileName}</Text>
          
          <View style={styles.fileMetaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="document-outline" size={14} color="#6b7280" />
              <Text style={styles.metaText}>{formatFileSize(item.fileSize)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color="#6b7280" />
              <Text style={styles.metaText}>{item.downloadDate}</Text>
            </View>
          </View>

          {/* Cached Badge */}
          <View style={styles.cachedBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
            <Text style={styles.cachedText}>Available Offline</Text>
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
              <Text style={styles.actionButtonText}>Delete</Text>
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
          <Ionicons name="download" size={20} color="#1967d2" />
          <Text style={styles.headerTitle}>Downloaded Files</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.storageText}>
            {files.length} {files.length === 1 ? 'file' : 'files'} • {totalStorageFormatted}
          </Text>
        </View>
      </View>

      {/* Carousel */}
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

      {/* Download More Button */}
      {isOnline && onDownloadMore && (
        <TouchableOpacity style={styles.downloadMoreButton} onPress={onDownloadMore}>
          <Ionicons name="add-circle-outline" size={18} color="#1967d2" />
          <Text style={styles.downloadMoreText}>Download More Files</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  headerRight: {},
  storageText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  carouselContent: {
    paddingHorizontal: 20,
  },
  cardContainer: {
    width: CARD_WIDTH,
    marginRight: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    alignItems: 'center',
  },
  fileTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  fileTypeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  fileIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  fileMetaRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: '#6b7280',
  },
  cachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 16,
  },
  cachedText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#16a34a',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
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
  },
  shareButton: {
    backgroundColor: '#9333ea',
  },
  deleteButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#d1d5db',
  },
  paginationDotActive: {
    backgroundColor: '#1967d2',
    width: 24,
  },
  downloadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 10,
    marginHorizontal: 20,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderStyle: 'dashed',
  },
  downloadMoreText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1967d2',
  },
});
