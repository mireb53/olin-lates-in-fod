// app/(app)/notifications.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNetworkStatus } from '../../context/NetworkContext';
import { API_BASE_URL, getAuthorizationHeader, getUserData } from '../../lib/api';

interface Notification {
  id: string;
  type: 'material' | 'assessment' | 'announcement' | 'general';
  description: string;
  course?: string;
  date: string;
  read: boolean;
  has_file?: boolean;
  item_id?: number;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { netInfo } = useNetworkStatus();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());

  const loadNotifications = useCallback(async () => {
    try {
      if (!netInfo?.isInternetReachable) {
        console.log('🔔 No internet connection - skipping notification fetch');
        setLoading(false);
        return;
      }
      
      const userData = await getUserData();
      if (!userData?.email) {
        console.log('No user data for notifications');
        setLoading(false);
        return;
      }

      console.log('🔔 Loading notifications...');
      const authHeader = await getAuthorizationHeader();
      const response = await fetch(`${API_BASE_URL}/student/notifications`, {
        headers: {
          'Authorization': String(authHeader || ''),
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
      } else {
        console.error('Failed to fetch notifications:', response.status);
        setNotifications([]);
      }
    } catch (error) {
      console.error('❌ Error loading notifications:', error);
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [netInfo?.isInternetReachable]);

  // Auto-refresh when screen is focused (e.g., when clicking notification bell)
  useFocusEffect(
    useCallback(() => {
      console.log('🔔 Notifications screen focused - auto-refreshing...');
      loadNotifications();
    }, [loadNotifications])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadNotifications();
  }, [loadNotifications]);

  const markAsRead = async (id: string) => {
    try {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      
      if (!netInfo?.isInternetReachable) {
        console.log('🔵 No internet connection - marking as read locally only');
        return;
      }

      const authHeader = await getAuthorizationHeader();
      await fetch(`${API_BASE_URL}/student/mark-notification-as-read`, {
        method: 'POST',
        headers: {
          'Authorization': String(authHeader || ''),
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notification_id: id }),
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    const unreadNotifications = notifications.filter((n) => !n.read);
    if (unreadNotifications.length === 0) {
      Alert.alert('All caught up!', 'You have no unread notifications.');
      return;
    }

    try {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

      if (!netInfo?.isInternetReachable) {
        console.log('🔵 No internet connection - marking all as read locally only');
        return;
      }

      const notificationIds = unreadNotifications.map((n) => n.id);
      const authHeader = await getAuthorizationHeader();
      await fetch(`${API_BASE_URL}/student/mark-all-notifications-as-read`, {
        method: 'POST',
        headers: {
          'Authorization': String(authHeader || ''),
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notification_ids: notificationIds }),
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      // Close swipeable first
      const swipeable = swipeableRefs.current.get(id);
      swipeable?.close();
      
      // Remove from local state immediately
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      
      // Haptic feedback
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (!netInfo?.isInternetReachable) {
        console.log('🔵 No internet connection - deleting locally only');
        return;
      }

      const authHeader = await getAuthorizationHeader();
      const response = await fetch(`${API_BASE_URL}/student/notifications/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': String(authHeader || ''),
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('Failed to delete notification on server:', response.status);
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const confirmDeleteNotification = (id: string) => {
    Alert.alert(
      'Delete Notification',
      'Are you sure you want to delete this notification?',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => {
          const swipeable = swipeableRefs.current.get(id);
          swipeable?.close();
        }},
        { text: 'Delete', style: 'destructive', onPress: () => deleteNotification(id) }
      ]
    );
  };

  const handleLongPress = async (id: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (!selectionMode) {
      setSelectionMode(true);
      setSelectedNotifications(new Set([id]));
    }
  };

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedNotifications);
    if (newSelection.has(id)) {
      newSelection.delete(id);
      if (newSelection.size === 0) {
        setSelectionMode(false);
      }
    } else {
      newSelection.add(id);
    }
    setSelectedNotifications(newSelection);
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedNotifications(new Set());
  };

  const deleteSelectedNotifications = async () => {
    if (selectedNotifications.size === 0) return;
    
    Alert.alert(
      'Delete Notifications',
      `Are you sure you want to delete ${selectedNotifications.size} notification${selectedNotifications.size > 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            
            // Remove from local state
            setNotifications((prev) => prev.filter((n) => !selectedNotifications.has(n.id)));
            
            // Delete from server
            if (netInfo?.isInternetReachable) {
              const authHeader = await getAuthorizationHeader();
              for (const id of selectedNotifications) {
                try {
                  await fetch(`${API_BASE_URL}/student/notifications/${id}`, {
                    method: 'DELETE',
                    headers: {
                      'Authorization': String(authHeader || ''),
                      'Accept': 'application/json',
                    },
                  });
                } catch (error) {
                  console.error('Error deleting notification:', id, error);
                }
              }
            }
            
            setSelectionMode(false);
            setSelectedNotifications(new Set());
          }
        }
      ]
    );
  };

  const handleDownloadAttachment = async (item: Notification) => {
    if (!netInfo?.isInternetReachable) {
      Alert.alert('Offline Mode', 'File downloading requires an internet connection.');
      return;
    }
    if (downloadingId) return;

    setDownloadingId(item.id);
    setDownloadProgress(0);

    try {
      const authHeader = await getAuthorizationHeader();
      const materialResponse = await fetch(`${API_BASE_URL}/materials/${item.item_id}`, {
        headers: { 'Authorization': String(authHeader || '') }
      });

      if (!materialResponse.ok) throw new Error('Could not fetch material details.');
      
      const materialData = await materialResponse.json();
      const material = materialData.material;

      if (!material || !material.file_path) throw new Error('No file associated with this material.');
      
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Media library access is needed to save the file.');
        setDownloadingId(null);
        return;
      }

      const downloadUrl = `${API_BASE_URL}/materials/${material.id}/view`;
      const fileExtension = material.file_path.split('.').pop();
      const sanitizedTitle = material.title.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${sanitizedTitle}_${material.id}${fileExtension ? `.${fileExtension}` : ''}`;
      const localUri = FileSystem.documentDirectory + fileName;
      
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (fileInfo.exists) {
        Alert.alert('File Exists', 'This file has already been downloaded.');
        setDownloadingId(null);
        return;
      }

      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl, localUri,
        { headers: { 'Authorization': String(authHeader) } },
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            const progress = totalBytesWritten / totalBytesExpectedToWrite;
            setDownloadProgress(Math.round(progress * 100));
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (result?.uri) {
        Alert.alert('Download Complete!', `"${material.title}" has been saved to the app.`);
      } else {
        throw new Error('Download failed.');
      }
    } catch (err: any) {
      Alert.alert('Download Failed', err.message || 'Could not download the file. Please try again.');
    } finally {
      setDownloadingId(null);
      setDownloadProgress(0);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch(type) {
      case 'material': return 'document-text';
      case 'assessment': return 'clipboard';
      case 'announcement': return 'megaphone';
      default: return 'notifications';
    }
  };

  const getNotificationIconColor = (type: string) => {
    switch(type) {
      case 'material': return '#10b981';
      case 'assessment': return '#7c3aed';
      case 'announcement': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const formatDate = (dateInput: string | Date): string => {
    if (!dateInput) return 'Date unavailable';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'Invalid date';
    
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>, itemId: string) => {
    const trans = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [0, 100],
      extrapolate: 'clamp',
    });
    
    return (
      <Animated.View style={[styles.deleteActionContainer, { transform: [{ translateX: trans }] }]}>
        <TouchableOpacity 
          style={styles.deleteAction}
          onPress={() => confirmDeleteNotification(itemId)}
        >
          <Ionicons name="trash-outline" size={24} color="#ffffff" />
          <Text style={styles.deleteActionText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderNotificationItem = ({ item }: { item: Notification }) => {
    const isSelected = selectedNotifications.has(item.id);
    
    const notificationContent = (
      <TouchableOpacity
        style={[
          styles.notificationCard, 
          !item.read && styles.unreadCard,
          isSelected && styles.selectedCard
        ]}
        onPress={() => {
          if (selectionMode) {
            toggleSelection(item.id);
          } else {
            markAsRead(item.id);
          }
        }}
        onLongPress={() => handleLongPress(item.id)}
        activeOpacity={0.7}
        delayLongPress={500}
      >
        <View style={styles.notificationContent}>
          {/* Selection Checkbox */}
          {selectionMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Ionicons name="checkmark" size={16} color="#ffffff" />}
            </View>
          )}
          
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: `${getNotificationIconColor(item.type)}15` }]}>
            <Ionicons 
              name={getNotificationIcon(item.type) as any} 
              size={24} 
              color={getNotificationIconColor(item.type)} 
            />
          </View>

          {/* Content */}
          <View style={styles.textContainer}>
            <Text style={[styles.notificationText, !item.read && styles.unreadText]}>
              {item.description}
            </Text>
            {item.course && (
              <View style={styles.courseTag}>
                <Ionicons name="book-outline" size={12} color="#6b7280" />
                <Text style={styles.courseText}>{item.course}</Text>
              </View>
            )}
            <Text style={styles.dateText}>{formatDate(item.date)}</Text>
          </View>

          {/* Actions */}
          <View style={styles.actionsContainer}>
            {item.type === 'material' && item.has_file && (
              <View>
                {downloadingId === item.id ? (
                  <View style={styles.progressContainer}>
                    <ActivityIndicator size="small" color="#007bff" />
                    <Text style={styles.progressText}>{downloadProgress}%</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.downloadButton,
                      (!!downloadingId || !netInfo?.isInternetReachable) && styles.downloadButtonDisabled
                    ]}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDownloadAttachment(item);
                    }}
                    disabled={!!downloadingId || !netInfo?.isInternetReachable}
                  >
                    <Ionicons 
                      name="download-outline" 
                      size={20} 
                      color={!!downloadingId || !netInfo?.isInternetReachable ? "#adb5bd" : "#007bff"} 
                    />
                  </TouchableOpacity>
                )}
              </View>
            )}
            {!item.read && !selectionMode && <View style={styles.unreadDot} />}
          </View>
        </View>
      </TouchableOpacity>
    );

    // Don't wrap in Swipeable if in selection mode
    if (selectionMode) {
      return notificationContent;
    }

    return (
      <Swipeable
        ref={(ref) => {
          swipeableRefs.current.set(item.id, ref);
        }}
        renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item.id)}
        rightThreshold={40}
        friction={2}
        overshootRight={false}
      >
        {notificationContent}
      </Swipeable>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="notifications-off-outline" size={64} color="#d1d5db" />
      </View>
      <Text style={styles.emptyTitle}>No Notifications</Text>
      <Text style={styles.emptyText}>
        {netInfo?.isInternetReachable 
          ? "You're all caught up! Check back later for updates."
          : "Connect to the internet to see your notifications."
        }
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.listHeader}>
      {unreadCount > 0 && !selectionMode && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{unreadCount} unread</Text>
        </View>
      )}
      {selectionMode && (
        <View style={styles.selectionInfo}>
          <Text style={styles.selectionText}>
            {selectedNotifications.size} selected
          </Text>
        </View>
      )}
      {!selectionMode && (
        <Text style={styles.swipeHint}>
          <Ionicons name="arrow-back" size={12} color="#9ca3af" /> Swipe left to delete
        </Text>
      )}
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={() => {
                if (selectionMode) {
                  cancelSelection();
                } else {
                  // Navigate back to the source page if specified, otherwise go back
                  if (from) {
                    router.replace(from as any);
                  } else {
                    router.back();
                  }
                }
              }}
            >
              <Ionicons name={selectionMode ? "close" : "arrow-back"} size={24} color="#1f2937" />
            </TouchableOpacity>
          </View>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>
              {selectionMode ? 'Select Notifications' : 'Notifications'}
            </Text>
          </View>
          <View style={styles.headerRight}>
            {selectionMode ? (
              <TouchableOpacity 
                style={[styles.deleteSelectedButton, selectedNotifications.size === 0 && styles.deleteSelectedButtonDisabled]} 
                onPress={deleteSelectedNotifications}
                disabled={selectedNotifications.size === 0}
              >
                <Ionicons name="trash-outline" size={20} color={selectedNotifications.size > 0 ? "#dc2626" : "#9ca3af"} />
              </TouchableOpacity>
            ) : unreadCount > 0 ? (
              <TouchableOpacity style={styles.markAllButton} onPress={markAllAsRead}>
                <Text style={styles.markAllText}>Mark all read</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.placeholder} />
            )}
          </View>
        </View>

        {/* Offline Banner */}
        {!netInfo?.isInternetReachable && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={18} color="#92400e" />
            <Text style={styles.offlineText}>You're offline. Some features are unavailable.</Text>
          </View>
        )}

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007bff" />
            <Text style={styles.loadingText}>Loading notifications...</Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            renderItem={renderNotificationItem}
            ListEmptyComponent={renderEmptyState}
            ListHeaderComponent={notifications.length > 0 ? renderHeader : null}
            contentContainerStyle={[
              styles.listContent,
              notifications.length === 0 && styles.emptyListContent
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#007bff']}
                tintColor="#007bff"
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerLeft: {
    width: 80,
    alignItems: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    width: 80,
    alignItems: 'flex-end',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
  },
  markAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007bff',
  },
  deleteSelectedButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
  },
  deleteSelectedButtonDisabled: {
    backgroundColor: '#f3f4f6',
  },
  placeholder: {
    width: 80,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fef3c7',
    borderBottomWidth: 1,
    borderBottomColor: '#fcd34d',
  },
  offlineText: {
    fontSize: 13,
    color: '#92400e',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  unreadBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  unreadBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  selectionInfo: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  selectionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400e',
  },
  swipeHint: {
    fontSize: 12,
    color: '#9ca3af',
  },
  notificationCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  unreadCard: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1.5,
  },
  selectedCard: {
    backgroundColor: '#fef9c3',
    borderColor: '#fbbf24',
    borderWidth: 1.5,
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  checkboxSelected: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 6,
  },
  notificationText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  unreadText: {
    fontWeight: '600',
    color: '#1f2937',
  },
  courseTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  courseText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  dateText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  downloadButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadButtonDisabled: {
    backgroundColor: '#f3f4f6',
  },
  progressContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  progressText: {
    fontSize: 10,
    color: '#007bff',
    fontWeight: '600',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3b82f6',
  },
  deleteActionContainer: {
    width: 80,
    marginBottom: 12,
  },
  deleteAction: {
    flex: 1,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  deleteActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
  },
});
