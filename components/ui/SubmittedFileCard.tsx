/**
 * SubmittedFileCard Component
 * 
 * Card display for submitted files in assessments
 * Shows file info, type indicator, and actions
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface SubmittedFileCardProps {
  fileName: string;
  fileType?: string;
  fileSize?: string;
  url?: string;
  isLink?: boolean;
  onDownload?: () => void;
  onOpen?: () => void;
  onDelete?: () => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  showCheckbox?: boolean;
  disabled?: boolean;
}

export default function SubmittedFileCard({
  fileName,
  fileType = 'other',
  fileSize,
  url,
  isLink = false,
  onDownload,
  onOpen,
  onDelete,
  isSelected = false,
  onToggleSelect,
  showCheckbox = false,
  disabled = false,
}: SubmittedFileCardProps) {
  
  const getFileTypeIcon = (): keyof typeof Ionicons.glyphMap => {
    if (isLink) return 'link';
    switch (fileType) {
      case 'image': return 'image';
      case 'pdf': return 'document-text';
      case 'document': return 'document';
      case 'video': return 'videocam';
      case 'audio': return 'musical-notes';
      case 'code': return 'code-slash';
      default: return 'attach';
    }
  };

  const getFileTypeColor = (): string => {
    if (isLink) return '#9333ea';
    switch (fileType) {
      case 'image': return '#06b6d4';
      case 'pdf': return '#dc2626';
      case 'document': return '#1967d2';
      case 'video': return '#ea4335';
      case 'audio': return '#9333ea';
      case 'code': return '#6366f1';
      default: return '#6b7280';
    }
  };

  const color = getFileTypeColor();

  return (
    <View style={[styles.container, isSelected && styles.selectedContainer]}>
      {/* Checkbox */}
      {showCheckbox && (
        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={onToggleSelect}
          disabled={disabled}
        >
          <View style={[
            styles.checkbox,
            isSelected && styles.checkboxSelected,
            isSelected && { backgroundColor: color, borderColor: color }
          ]}>
            {isSelected && (
              <Ionicons name="checkmark" size={14} color="#fff" />
            )}
          </View>
        </TouchableOpacity>
      )}

      {/* File icon */}
      <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
        <Ionicons name={getFileTypeIcon()} size={22} color={color} />
      </View>

      {/* File info */}
      <View style={styles.infoContainer}>
        <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">
          {fileName || 'Unknown File'}
        </Text>
        <Text style={styles.fileType}>
          {isLink ? 'External Link' : `${fileType.charAt(0).toUpperCase()}${fileType.slice(1)} file`}
          {fileSize && !isLink && ` • ${fileSize}`}
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.actionsContainer}>
        {onOpen && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: `${color}10` }]}
            onPress={onOpen}
            disabled={disabled}
          >
            <Ionicons name={isLink ? 'open-outline' : 'eye-outline'} size={18} color={color} />
          </TouchableOpacity>
        )}
        {onDownload && !isLink && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: `${color}10` }]}
            onPress={onDownload}
            disabled={disabled}
          >
            <Ionicons name="download-outline" size={18} color={color} />
          </TouchableOpacity>
        )}
        {onDelete && (
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={onDelete}
            disabled={disabled}
          >
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  selectedContainer: {
    borderColor: '#1967d2',
    backgroundColor: '#f0f4ff',
  },
  checkboxContainer: {
    marginRight: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxSelected: {
    borderColor: '#1967d2',
    backgroundColor: '#1967d2',
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
  },
  fileType: {
    fontSize: 12,
    color: '#6b7280',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  actionButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#fef2f2',
  },
});
