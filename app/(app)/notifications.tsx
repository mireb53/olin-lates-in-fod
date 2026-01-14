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
  Dimensions,
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

const { width: screenWidth } = Dimensions.get('window');
const isTablet = screenWidth >= 768;
const isLargeTablet = screenWidth >= 1024;
const contentMaxWidth = isLargeTablet ? 900 : isTablet ? 700 : screenWidth;

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
      case 'material': return '#1967d2';
      case 'assessment': return '#7c3aed';
      case 'announcement': return '#ea4335';
      default: return '#5f6368';
    }
  };

  const getNotificationGradient = (type: string) => {
    switch(type) {
      case 'material': return ['#e3f2fd', '#bbdefb'];
      case 'assessment': return ['#f3e5f5', '#e1bee7'];
      case 'announcement': return ['#ffebee', '#ffcdd2'];
      default: return ['#f5f5f5', '#eeeeee'];
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
    const iconColor = getNotificationIconColor(item.type);
    
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
        activeOpacity={0.85}
        delayLongPress={500}
      >
        <View style={styles.notificationContent}>
          {/* Selection Checkbox */}
          {selectionMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Ionicons name="checkmark" size={18} color="#ffffff" />}
            </View>
          )}
          
          {/* Icon with gradient background */}
          <View style={[styles.iconContainer, { backgroundColor: `${iconColor}12` }]}>
            <View style={[styles.iconInner, { backgroundColor: `${iconColor}20` }]}>
              <Ionicons 
                name={getNotificationIcon(item.type) as any} 
                size={28} 
                color={iconColor} 
              />
            </View>
          </View>

          {/* Content */}
          <View style={styles.textContainer}>
            <View style={styles.notificationHeader}>
              <Text style={[styles.notificationText, !item.read && styles.unreadText]}>
                {item.description}
              </Text>
              {!item.read && !selectionMode && <View style={styles.unreadDot} />}
            </View>
            {item.course && (
              <View style={styles.courseTag}>
                <Ionicons name="book-outline" size={14} color="#5f6368" />
                <Text style={styles.courseText}>{item.course}</Text>
              </View>
            )}
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={12} color="#9aa0a6" />
              <Text style={styles.dateText}>{formatDate(item.date)}</Text>
            </View>
          </View>

          {/* Actions */}
          {item.type === 'material' && item.has_file && (
            <View style={styles.actionsContainer}>
              {downloadingId === item.id ? (
                <View style={styles.progressContainer}>
                  <ActivityIndicator size="small" color="#1967d2" />
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
                    size={22} 
                    color={!!downloadingId || !netInfo?.isInternetReachable ? "#9aa0a6" : "#1967d2"} 
                  />
                </TouchableOpacity>
              )}
            </View>
          )}
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
        <View style={styles.emptyIconInner}>
          <Ionicons 
            name={netInfo?.isInternetReachable ? "notifications-off-outline" : "cloud-offline-outline"} 
            size={80} 
            color="#9aa0a6" 
          />
        </View>
      </View>
      <Text style={styles.emptyTitle}>
        {netInfo?.isInternetReachable ? "All Caught Up!" : "You're Offline"}
      </Text>
      <Text style={styles.emptyText}>
        {netInfo?.isInternetReachable 
          ? "No new notifications. Check back later for updates from your courses."
          : "Connect to the internet to see your latest notifications and updates."
        }
      </Text>
      {netInfo?.isInternetReachable && (
        <TouchableOpacity style={styles.emptyRefreshButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={18} color="#1967d2" />
          <Text style={styles.emptyRefreshText}>Refresh</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderHeader = () => (
    <View style={styles.listHeader}>
      <View style={styles.listHeaderLeft}>
        {unreadCount > 0 && !selectionMode && (
          <View style={styles.unreadBadge}>
            <View style={styles.unreadDotBadge} />
            <Text style={styles.unreadBadgeText}>{unreadCount} unread</Text>
          </View>
        )}
        {selectionMode && (
          <View style={styles.selectionInfo}>
            <Ionicons name="checkmark-circle" size={16} color="#ea8600" />
            <Text style={styles.selectionText}>
              {selectedNotifications.size} selected
            </Text>
          </View>
        )}
      </View>
      {!selectionMode && (
        <View style={styles.swipeHintContainer}>
          <Ionicons name="arrow-back" size={14} color="#9aa0a6" />
          <Text style={styles.swipeHint}>Swipe to delete</Text>
        </View>
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
    backgroundColor: '#f8f9fa',
    alignItems: isTablet ? 'center' : 'stretch',
  },
  header: {
    width: '100%',
    maxWidth: contentMaxWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: isTablet ? 24 : 16,
    paddingVertical: isTablet ? 16 : 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  headerLeft: {
    width: isTablet ? 100 : 80,
    alignItems: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    width: isTablet ? 140 : 120,
    alignItems: 'flex-end',
  },
  backButton: {
    width: isTablet ? 44 : 40,
    height: isTablet ? 44 : 40,
    borderRadius: isTablet ? 22 : 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f3f4',
  },
  headerTitle: {
    fontSize: isTablet ? 24 : 20,
    fontWeight: '700',
    color: '#202124',
    textAlign: 'center',
  },
  markAllButton: {
    paddingHorizontal: isTablet ? 16 : 12,
    paddingVertical: isTablet ? 10 : 8,
    borderRadius: isTablet ? 10 : 8,
    backgroundColor: '#e8f0fe',
  },
  markAllText: {
    fontSize: isTablet ? 15 : 14,
    fontWeight: '600',
    color: '#1967d2',
  },
  deleteSelectedButton: {
    width: isTablet ? 44 : 40,
    height: isTablet ? 44 : 40,
    borderRadius: isTablet ? 22 : 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fce8e6',
  },
  deleteSelectedButtonDisabled: {
    backgroundColor: '#f1f3f4',
  },
  placeholder: {
    width: isTablet ? 140 : 120,
  },
  offlineBanner: {
    width: '100%',
    maxWidth: contentMaxWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: isTablet ? 14 : 12,
    paddingHorizontal: isTablet ? 24 : 16,
    backgroundColor: '#fef3c7',
    borderBottomWidth: 1,
    borderBottomColor: '#fcd34d',
  },
  offlineText: {
    fontSize: isTablet ? 15 : 13,
    color: '#78350f',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: isTablet ? 16 : 12,
  },
  loadingText: {
    fontSize: isTablet ? 18 : 16,
    color: '#5f6368',
    fontWeight: '500',
  },
  listContent: {
    width: '100%',
    maxWidth: contentMaxWidth,
    padding: isTablet ? 24 : 16,
    gap: isTablet ? 16 : 12,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: isTablet ? 16 : 12,
    paddingHorizontal: isTablet ? 4 : 0,
  },
  listHeaderLeft: {
    flex: 1,
  },
  unreadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f0fe',
    paddingHorizontal: isTablet ? 14 : 12,
    paddingVertical: isTablet ? 8 : 6,
    borderRadius: isTablet ? 20 : 16,
    gap: 6,
    alignSelf: 'flex-start',
  },
  unreadDotBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1967d2',
  },
  unreadBadgeText: {
    fontSize: isTablet ? 15 : 13,
    fontWeight: '600',
    color: '#1967d2',
  },
  selectionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: isTablet ? 14 : 12,
    paddingVertical: isTablet ? 8 : 6,
    borderRadius: isTablet ? 20 : 16,
    gap: 6,
    alignSelf: 'flex-start',
  },
  selectionText: {
    fontSize: isTablet ? 15 : 13,
    fontWeight: '600',
    color: '#ea8600',
  },
  swipeHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swipeHint: {
    fontSize: isTablet ? 13 : 12,
    color: '#9aa0a6',
    fontWeight: '500',
  },
  notificationCard: {
    backgroundColor: '#ffffff',
    borderRadius: isTablet ? 14 : 12,
    padding: isTablet ? 20 : 16,
    marginBottom: isTablet ? 16 : 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  unreadCard: {
    backgroundColor: '#e8f0fe',
    borderColor: '#aecbfa',
    borderWidth: 1.5,
    shadowOpacity: 0.12,
  },
  selectedCard: {
    backgroundColor: '#fff9e6',
    borderColor: '#fbbf24',
    borderWidth: 2,
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: isTablet ? 16 : 14,
  },
  checkbox: {
    width: isTablet ? 28 : 24,
    height: isTablet ? 28 : 24,
    borderRadius: isTablet ? 14 : 12,
    borderWidth: 2,
    borderColor: '#dadce0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: isTablet ? 6 : 4,
  },
  checkboxSelected: {
    backgroundColor: '#1967d2',
    borderColor: '#1967d2',
  },
  iconContainer: {
    width: isTablet ? 64 : 56,
    height: isTablet ? 64 : 56,
    borderRadius: isTablet ? 32 : 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: isTablet ? 52 : 44,
    height: isTablet ? 52 : 44,
    borderRadius: isTablet ? 26 : 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: isTablet ? 8 : 6,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  notificationText: {
    flex: 1,
    fontSize: isTablet ? 17 : 15,
    color: '#3c4043',
    lineHeight: isTablet ? 25 : 22,
    fontWeight: '400',
  },
  unreadText: {
    fontWeight: '600',
    color: '#202124',
  },
  courseTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: isTablet ? 6 : 4,
    paddingHorizontal: isTablet ? 10 : 8,
    backgroundColor: '#f1f3f4',
    borderRadius: isTablet ? 8 : 6,
    alignSelf: 'flex-start',
  },
  courseText: {
    fontSize: isTablet ? 14 : 12,
    color: '#5f6368',
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dateText: {
    fontSize: isTablet ? 13 : 12,
    color: '#9aa0a6',
    fontWeight: '400',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  downloadButton: {
    width: isTablet ? 48 : 44,
    height: isTablet ? 48 : 44,
    borderRadius: isTablet ? 24 : 22,
    backgroundColor: '#e8f0fe',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d2e3fc',
  },
  downloadButtonDisabled: {
    backgroundColor: '#f1f3f4',
    borderColor: '#e0e0e0',
  },
  progressContainer: {
    width: isTablet ? 48 : 44,
    height: isTablet ? 48 : 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  progressText: {
    fontSize: isTablet ? 11 : 10,
    color: '#1967d2',
    fontWeight: '700',
  },
  unreadDot: {
    width: isTablet ? 12 : 10,
    height: isTablet ? 12 : 10,
    borderRadius: isTablet ? 6 : 5,
    backgroundColor: '#1967d2',
    marginTop: 4,
  },
  deleteActionContainer: {
    width: isTablet ? 100 : 80,
    marginBottom: isTablet ? 16 : 12,
  },
  deleteAction: {
    flex: 1,
    backgroundColor: '#d93025',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: isTablet ? 14 : 12,
    borderBottomRightRadius: isTablet ? 14 : 12,
    gap: 4,
  },
  deleteActionText: {
    color: '#ffffff',
    fontSize: isTablet ? 14 : 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: isTablet ? 60 : 40,
    paddingBottom: isTablet ? 80 : 60,
  },
  emptyIconContainer: {
    width: isTablet ? 160 : 140,
    height: isTablet ? 160 : 140,
    borderRadius: isTablet ? 80 : 70,
    backgroundColor: '#f1f3f4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isTablet ? 32 : 24,
  },
  emptyIconInner: {
    width: isTablet ? 120 : 100,
    height: isTablet ? 120 : 100,
    borderRadius: isTablet ? 60 : 50,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: isTablet ? 26 : 22,
    fontWeight: '700',
    color: '#202124',
    marginBottom: isTablet ? 12 : 10,
  },
  emptyText: {
    fontSize: isTablet ? 17 : 15,
    color: '#5f6368',
    textAlign: 'center',
    lineHeight: isTablet ? 26 : 22,
    marginBottom: isTablet ? 32 : 24,
  },
  emptyRefreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: isTablet ? 24 : 20,
    paddingVertical: isTablet ? 14 : 12,
    backgroundColor: '#e8f0fe',
    borderRadius: isTablet ? 12 : 10,
    borderWidth: 1,
    borderColor: '#d2e3fc',
  },
  emptyRefreshText: {
    fontSize: isTablet ? 17 : 15,
    color: '#1967d2',
    fontWeight: '600',
  },
});
