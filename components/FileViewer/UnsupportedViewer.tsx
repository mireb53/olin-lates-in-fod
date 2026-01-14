/**
 * UnsupportedViewer Component
 * 
 * Fallback viewer for unsupported file types
 * Shows file info and provides options to:
 * - Download the file
 * - Open with external app
 * - Share the file
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { formatFileSize } from './utils';

interface UnsupportedViewerProps {
  uri: string;
  fileName: string;
  fileSize?: number;
  isCached?: boolean;
  onDownload?: () => void;
  onShare?: () => void;
  onSaveToDevice?: () => void;
  onOpenExternal?: () => void;
  onClose?: () => void;
  isOnline?: boolean;
}

// Get file extension and icon
const getFileInfo = (fileName: string): { extension: string; icon: string } => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  // Map extensions to icons
  const iconMap: Record<string, string> = {
    zip: 'archive',
    rar: 'archive',
    '7z': 'archive',
    tar: 'archive',
    gz: 'archive',
    exe: 'cube',
    dmg: 'cube',
    apk: 'phone-portrait',
    iso: 'disc',
    bin: 'disc',
    svg: 'image',
    ai: 'color-palette',
    psd: 'color-palette',
    sketch: 'color-palette',
    fig: 'color-palette',
    ttf: 'text',
    otf: 'text',
    woff: 'text',
    epub: 'book',
    mobi: 'book',
  };

  return {
    extension: ext.toUpperCase() || 'FILE',
    icon: iconMap[ext] || 'document-attach',
  };
};

export default function UnsupportedViewer({
  uri,
  fileName,
  fileSize,
  isCached = false,
  onDownload,
  onShare,
  onSaveToDevice,
  onOpenExternal,
  onClose,
  isOnline = true,
}: UnsupportedViewerProps) {
  const fileInfo = getFileInfo(fileName);

  return (
    <View style={styles.container}>
      {/* File icon and info */}
      <View style={styles.fileInfoSection}>
        <View style={styles.iconContainer}>
          <Ionicons name={fileInfo.icon as any} size={48} color="#6b7280" />
          <View style={styles.extensionBadge}>
            <Text style={styles.extensionText}>{fileInfo.extension}</Text>
          </View>
        </View>
        
        <Text style={styles.fileName} numberOfLines={2}>{fileName}</Text>
        
        {fileSize && (
          <Text style={styles.fileSize}>{formatFileSize(fileSize)}</Text>
        )}

        {/* Status badge */}
        {isCached ? (
          <View style={styles.cachedBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
            <Text style={styles.cachedText}>Downloaded</Text>
          </View>
        ) : isOnline ? (
          <View style={styles.onlineBadge}>
            <Ionicons name="cloud" size={14} color="#1967d2" />
            <Text style={styles.onlineText}>Available online</Text>
          </View>
        ) : (
          <View style={styles.offlineBadge}>
            <Ionicons name="cloud-offline" size={14} color="#dc2626" />
            <Text style={styles.offlineText}>Offline - Download required</Text>
          </View>
        )}
      </View>

      {/* Message */}
      <View style={styles.messageSection}>
        <Ionicons name="information-circle" size={20} color="#6b7280" />
        <Text style={styles.messageText}>
          This file type cannot be previewed in the app.
          {'\n'}Use the options below to access the file.
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actionsSection}>
        {/* Primary action - Download or Open */}
        {isCached && onOpenExternal ? (
          <TouchableOpacity style={styles.primaryButton} onPress={onOpenExternal}>
            <Ionicons name="open-outline" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Open with Another App</Text>
          </TouchableOpacity>
        ) : onDownload ? (
          <TouchableOpacity 
            style={[styles.primaryButton, !isOnline && styles.disabledButton]} 
            onPress={onDownload}
            disabled={!isOnline}
          >
            <Ionicons name="download" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>
              {isOnline ? 'Download File' : 'No Internet Connection'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Secondary actions */}
        <View style={styles.secondaryActions}>
          {isCached && onSaveToDevice && (
            <TouchableOpacity style={styles.secondaryButton} onPress={onSaveToDevice}>
              <Ionicons name="folder-open-outline" size={18} color="#374151" />
              <Text style={styles.secondaryButtonText}>Save to Device</Text>
            </TouchableOpacity>
          )}
          
          {onShare && (
            <TouchableOpacity style={styles.secondaryButton} onPress={onShare}>
              <Ionicons name="share-outline" size={18} color="#374151" />
              <Text style={styles.secondaryButtonText}>Share</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tips */}
      <View style={styles.tipsSection}>
        <Text style={styles.tipsTitle}>Tips:</Text>
        <View style={styles.tipItem}>
          <Ionicons name="checkmark" size={14} color="#16a34a" />
          <Text style={styles.tipText}>
            Download files for offline access
          </Text>
        </View>
        <View style={styles.tipItem}>
          <Ionicons name="checkmark" size={14} color="#16a34a" />
          <Text style={styles.tipText}>
            Use the Open with option to view in compatible apps
          </Text>
        </View>
        <View style={styles.tipItem}>
          <Ionicons name="checkmark" size={14} color="#16a34a" />
          <Text style={styles.tipText}>
            Share files directly to other apps
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  fileInfoSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  extensionBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#374151',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  extensionText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },
  cachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  onlineText: {
    fontSize: 12,
    color: '#1967d2',
    fontWeight: '600',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  offlineText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600',
  },
  messageSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    gap: 10,
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  actionsSection: {
    marginBottom: 20,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ea4335',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 12,
  },
  disabledButton: {
    backgroundColor: '#d1d5db',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  tipsSection: {
    backgroundColor: '#fefce8',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fef08a',
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#854d0e',
    marginBottom: 8,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  tipText: {
    fontSize: 12,
    color: '#713f12',
  },
});
