/**
 * FileActionSheet Component
 * 
 * A beautiful bottom action sheet for file operations
 * Replaces Alert.alert for better UX
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    Dimensions,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ActionItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}

interface FileActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  actions: ActionItem[];
  fileName?: string;
  fileSize?: string;
  fileType?: string;
  isCached?: boolean;
}

export default function FileActionSheet({
  visible,
  onClose,
  title = 'File Options',
  subtitle,
  actions,
  fileName,
  fileSize,
  fileType,
  isCached,
}: FileActionSheetProps) {
  const insets = useSafeAreaInsets();

  const getFileTypeIcon = (type?: string): keyof typeof Ionicons.glyphMap => {
    switch (type?.toLowerCase()) {
      case 'image': return 'image';
      case 'video': return 'videocam';
      case 'audio': return 'musical-notes';
      case 'pdf': return 'document-text';
      case 'document': return 'document';
      case 'code': return 'code-slash';
      default: return 'attach';
    }
  };

  const getFileTypeColor = (type?: string): string => {
    switch (type?.toLowerCase()) {
      case 'image': return '#06b6d4';
      case 'video': return '#ea4335';
      case 'audio': return '#9333ea';
      case 'pdf': return '#dc2626';
      case 'document': return '#1967d2';
      case 'code': return '#6366f1';
      default: return '#6b7280';
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
              {/* Handle bar */}
              <View style={styles.handleBar} />

              {/* Header with file info */}
              {fileName && (
                <View style={styles.header}>
                  <View style={[styles.fileIconContainer, { backgroundColor: `${getFileTypeColor(fileType)}15` }]}>
                    <Ionicons 
                      name={getFileTypeIcon(fileType)} 
                      size={28} 
                      color={getFileTypeColor(fileType)} 
                    />
                  </View>
                  <View style={styles.headerInfo}>
                    <Text style={styles.fileName} numberOfLines={2}>{fileName}</Text>
                    <View style={styles.metaRow}>
                      {fileSize && (
                        <Text style={styles.fileMeta}>{fileSize}</Text>
                      )}
                      {fileSize && isCached !== undefined && (
                        <Text style={styles.metaDivider}>•</Text>
                      )}
                      {isCached !== undefined && (
                        <View style={[styles.statusBadge, isCached ? styles.cachedBadge : styles.onlineBadge]}>
                          <Ionicons 
                            name={isCached ? 'checkmark-circle' : 'cloud'} 
                            size={12} 
                            color={isCached ? '#16a34a' : '#1967d2'} 
                          />
                          <Text style={[styles.statusText, isCached ? styles.cachedText : styles.onlineText]}>
                            {isCached ? 'Downloaded' : 'Online'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              )}

              {/* Title if no file info */}
              {!fileName && title && (
                <View style={styles.titleContainer}>
                  <Text style={styles.title}>{title}</Text>
                  {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                </View>
              )}

              {/* Divider */}
              <View style={styles.divider} />

              {/* Actions */}
              <View style={styles.actionsContainer}>
                {actions.map((action, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.actionItem,
                      action.disabled && styles.actionItemDisabled,
                    ]}
                    onPress={() => {
                      if (!action.disabled) {
                        action.onPress();
                        onClose();
                      }
                    }}
                    disabled={action.disabled}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.actionIconContainer,
                      { backgroundColor: `${action.color || '#1967d2'}10` }
                    ]}>
                      <Ionicons
                        name={action.icon}
                        size={22}
                        color={action.disabled ? '#9ca3af' : (action.color || '#1967d2')}
                      />
                    </View>
                    <View style={styles.actionTextContainer}>
                      <Text style={[
                        styles.actionLabel,
                        action.disabled && styles.actionLabelDisabled
                      ]}>
                        {action.label}
                      </Text>
                      {action.subtitle && (
                        <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
                      )}
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={action.disabled ? '#d1d5db' : '#9ca3af'}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Cancel button */}
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    maxHeight: '80%',
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#d1d5db',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  fileIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  headerInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  fileMeta: {
    fontSize: 13,
    color: '#6b7280',
  },
  metaDivider: {
    marginHorizontal: 8,
    color: '#d1d5db',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  cachedBadge: {
    backgroundColor: '#dcfce7',
  },
  onlineBadge: {
    backgroundColor: '#dbeafe',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  cachedText: {
    color: '#16a34a',
  },
  onlineText: {
    color: '#1967d2',
  },
  titleContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginHorizontal: 20,
  },
  actionsContainer: {
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  actionItemDisabled: {
    opacity: 0.5,
  },
  actionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  actionLabelDisabled: {
    color: '#9ca3af',
  },
  actionSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  cancelButton: {
    marginTop: 8,
    marginHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
});
