/**
 * FileCard Component
 * 
 * Beautiful card display for files with actions
 * Shows file info, download status, and action buttons
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type FileType = 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'code' | 'other';

interface FileCardProps {
  fileName: string;
  fileSize?: string;
  fileType?: FileType;
  isCached?: boolean;
  isDownloading?: boolean;
  downloadProgress?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  onDownload?: () => void;
  onView?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
  compact?: boolean;
  isSelected?: boolean;
}

export default function FileCard({
  fileName,
  fileSize,
  fileType = 'other',
  isCached = false,
  isDownloading = false,
  downloadProgress = 0,
  onPress,
  onLongPress,
  onDownload,
  onView,
  onShare,
  onDelete,
  showActions = true,
  compact = false,
  isSelected = false,
}: FileCardProps) {
  const [scaleAnim] = useState(new Animated.Value(1));

  const getFileTypeIcon = (): keyof typeof Ionicons.glyphMap => {
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

  const getFileTypeColor = (): string => {
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

  const getFileTypeLabel = (): string => {
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

  const color = getFileTypeColor();

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  if (compact) {
    return (
      <TouchableOpacity
        onPress={onPress || onView}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.8}
      >
        <Animated.View 
          style={[
            styles.compactContainer, 
            isSelected && styles.selectedContainer,
            { transform: [{ scale: scaleAnim }] }
          ]}
        >
          <View style={[styles.compactIcon, { backgroundColor: `${color}15` }]}>
            <Ionicons name={getFileTypeIcon()} size={20} color={color} />
          </View>
          <View style={styles.compactInfo}>
            <Text style={styles.compactFileName} numberOfLines={1}>{fileName}</Text>
            <View style={styles.compactMeta}>
              {fileSize && <Text style={styles.compactFileSize}>{fileSize}</Text>}
              {isCached && (
                <View style={styles.compactCachedBadge}>
                  <Ionicons name="checkmark-circle" size={12} color="#16a34a" />
                </View>
              )}
            </View>
          </View>
          {isDownloading ? (
            <ActivityIndicator size="small" color={color} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          )}
        </Animated.View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress || onView}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.9}
    >
      <Animated.View 
        style={[
          styles.container, 
          isSelected && styles.selectedContainer,
          { transform: [{ scale: scaleAnim }] }
        ]}
      >
        {/* File type indicator */}
        <View style={[styles.typeIndicator, { backgroundColor: color }]} />

        {/* Main content */}
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
              <Ionicons name={getFileTypeIcon()} size={24} color={color} />
            </View>
            <View style={styles.fileInfo}>
              <Text style={styles.fileName} numberOfLines={2}>{fileName}</Text>
              <View style={styles.metaRow}>
                <Text style={[styles.fileType, { color }]}>{getFileTypeLabel()}</Text>
                {fileSize && (
                  <>
                    <Text style={styles.dot}>•</Text>
                    <Text style={styles.fileSize}>{fileSize}</Text>
                  </>
                )}
              </View>
            </View>
          </View>

          {/* Status badges */}
          <View style={styles.statusRow}>
            {isCached && (
              <View style={styles.cachedBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                <Text style={styles.cachedText}>Downloaded</Text>
              </View>
            )}
            {!isCached && !isDownloading && (
              <View style={styles.onlineBadge}>
                <Ionicons name="cloud" size={14} color="#1967d2" />
                <Text style={styles.onlineText}>Online only</Text>
              </View>
            )}
            {isDownloading && (
              <View style={styles.downloadingBadge}>
                <ActivityIndicator size="small" color="#f97316" />
                <Text style={styles.downloadingText}>
                  Downloading {downloadProgress > 0 ? `${Math.round(downloadProgress * 100)}%` : '...'}
                </Text>
              </View>
            )}
          </View>

          {/* Download progress bar */}
          {isDownloading && downloadProgress > 0 && (
            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <Animated.View 
                  style={[
                    styles.progressFill, 
                    { width: `${downloadProgress * 100}%`, backgroundColor: color }
                  ]} 
                />
              </View>
            </View>
          )}

          {/* Action buttons */}
          {showActions && !isDownloading && (
            <View style={styles.actions}>
              {!isCached && onDownload && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: `${color}10` }]}
                  onPress={onDownload}
                  activeOpacity={0.7}
                >
                  <Ionicons name="download-outline" size={18} color={color} />
                  <Text style={[styles.actionText, { color }]}>Download</Text>
                </TouchableOpacity>
              )}
              {onView && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.primaryAction, { backgroundColor: color }]}
                  onPress={onView}
                  activeOpacity={0.7}
                >
                  <Ionicons name="eye-outline" size={18} color="#fff" />
                  <Text style={[styles.actionText, styles.primaryActionText]}>View</Text>
                </TouchableOpacity>
              )}
              {isCached && onShare && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: `${color}10` }]}
                  onPress={onShare}
                  activeOpacity={0.7}
                >
                  <Ionicons name="share-outline" size={18} color={color} />
                </TouchableOpacity>
              )}
              {isCached && onDelete && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={onDelete}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  selectedContainer: {
    borderWidth: 2,
    borderColor: '#1967d2',
  },
  typeIndicator: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 20,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileType: {
    fontSize: 13,
    fontWeight: '500',
  },
  dot: {
    marginHorizontal: 6,
    color: '#d1d5db',
  },
  fileSize: {
    fontSize: 13,
    color: '#6b7280',
  },
  statusRow: {
    flexDirection: 'row',
    marginTop: 10,
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
    fontWeight: '500',
    color: '#16a34a',
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
    fontWeight: '500',
    color: '#1967d2',
  },
  downloadingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  downloadingText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ea580c',
  },
  progressContainer: {
    marginTop: 10,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  primaryAction: {
    flex: 1,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  primaryActionText: {
    color: '#ffffff',
  },
  deleteButton: {
    backgroundColor: '#fef2f2',
  },

  // Compact styles
  compactContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  compactIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  compactInfo: {
    flex: 1,
  },
  compactFileName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  compactMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactFileSize: {
    fontSize: 12,
    color: '#6b7280',
  },
  compactCachedBadge: {
    marginLeft: 4,
  },
});
