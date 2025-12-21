// app/(app)/courses/_layout.tsx
import { CustomHeader } from '@/components/CustomHeader';
import { unregisterBackgroundSync } from '@/lib/backgroundSync';
import { Ionicons } from '@expo/vector-icons';
import { Stack, usePathname, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { useNetworkStatus } from '../../../context/NetworkContext';
import { API_BASE_URL, clearAuthToken, getAuthorizationHeader, getProfile, getUserData } from '../../../lib/api';
import { clearOfflineData } from '../../../lib/localDb';

export default function CoursesLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { isConnected, netInfo } = useNetworkStatus();
  const [initials, setInitials] = useState<string>('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isProfileMenuVisible, setIsProfileMenuVisible] = useState<boolean>(false);

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      // UPDATED TEXT: Reassure the user
      'Are you sure you want to log out? Unsynced work will be saved on this device.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          onPress: async () => {
            try {
              console.log('🔄 Unregistering background sync...');
              await unregisterBackgroundSync();
              
              await clearAuthToken();
              // This calls the UPDATED function in localDb.ts
              await clearOfflineData(); 
              
              router.replace('/login');
            } catch (error) {
              console.error('Logout error:', error);
              router.replace('/login');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  useEffect(() => {
    const fetchUserProfile = async () => {
      let foundName = false; // Flag to track if we set initials
      try {
        // Only fetch and set profile image when online
        if (netInfo?.isInternetReachable) {
          try {
            const profileData = await getProfile();
            if (profileData) {
              // ALWAYS set the profile image from the API response
              setProfileImage(profileData.profile_image);
              
              // Try to set initials from API
              if (profileData.name) {
                const firstLetter = profileData.name.charAt(0).toUpperCase();
                setInitials(firstLetter);
                foundName = true; // We found a name from the API
              }
              // No 'return' here, allowing fallback
            }
          } catch (profileError) {
            console.log('Profile fetch failed, falling back to user data:', profileError);
          }
        }
        
        // If offline, clear the profile image so initials are shown
        if (!netInfo?.isInternetReachable) {
          setProfileImage(null);
        }
        
        // --- FALLBACK LOGIC ---
        // Run this if offline, or if online but no name was found
        if (!foundName) {
          const userData = await getUserData();
          if (userData && userData.name) {
            const firstLetter = userData.name.charAt(0).toUpperCase();
            setInitials(firstLetter);
            foundName = true; // We found a name from local data
          }
        }

        // Final fallback
        if (!foundName) {
          setInitials('?');
        }

      } catch (error) {
        console.error('Error fetching user profile for header:', error);
        setInitials('?'); // Error fallback
      }
    };
    fetchUserProfile();
  }, [netInfo?.isInternetReachable, pathname]);

  const loadNotifications = async () => {
    try {
      if (!netInfo?.isInternetReachable) {
        console.log('🔵 No internet connection - skipping notification fetch');
        return;
      }
      const userData = await getUserData();
      if (!userData?.email) {
        console.log('No user data for notifications');
        return;
      }
      console.log('🔔 Loading notification count...');
      const authHeader = await getAuthorizationHeader();
      const response = await fetch(`${API_BASE_URL}/student/notifications`, {
        headers: {
          'Authorization': String(authHeader || ''),
          'Accept': 'application/json',
        },
      });
      if (response.ok) {
        const data = await response.json();
        const unreadNotifications = (data.notifications || []).filter((n: any) => !n.read);
        setUnreadCount(unreadNotifications.length);
      } else {
        console.error('Failed to fetch notifications:', response.status);
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('❌ Error loading notifications:', error);
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    let notificationInterval: ReturnType<typeof setInterval> | null = null;
    const startNotificationInterval = () => {
      loadNotifications();
      if (netInfo?.isInternetReachable) {
        notificationInterval = setInterval(() => {
          if (netInfo?.isInternetReachable) {
            loadNotifications();
          }
        }, 30000);
      }
    };
    if (netInfo?.isInternetReachable) {
      startNotificationInterval();
    } else {
      if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;
      }
      console.log('🔵 Offline mode - notification interval disabled');
    }
    return () => {
      if (notificationInterval) {
        clearInterval(notificationInterval);
      }
    };
  }, [netInfo?.isInternetReachable]);

  // Navigate to notifications page
  const navigateToNotifications = () => {
    setUnreadCount(0); // Optimistic update: Clear badge immediately
    router.push('/notifications' as any);
  };
  
  const toggleProfileMenu = () => setIsProfileMenuVisible(!isProfileMenuVisible);

  // Check if we're on a detail screen (not the courses index)
  const isOnDetailScreen = () => {
    return pathname.includes('/materials/') || 
           pathname.includes('/assessments/') || 
           (pathname.includes('/courses/') && !pathname.endsWith('/courses') && !pathname.endsWith('/courses/'));
  };

  // Get title for detail screens
  const getDetailScreenTitle = () => {
    if (pathname.includes('/materials/')) return 'Material Details';
    if (pathname.includes('/assessments/')) return 'Assessment Details';
    return 'Course Details';
  };

  const handleBackPress = () => {
    router.back();
  };

  return (
    <>
      {/* Only show CustomHeader on detail screens */}
      {isOnDetailScreen() && (
        <>
          <StatusBar barStyle="light-content" backgroundColor="#007bff" translucent={false} />
          <CustomHeader
            title={getDetailScreenTitle()}
            initials={initials}
            profileImage={profileImage}
            unreadCount={unreadCount}
            onNotificationPress={netInfo?.isInternetReachable ? navigateToNotifications : () => console.log('🔵 Notifications disabled - no internet')}
            onProfilePress={toggleProfileMenu}
            showBackButton={true}
            onBackPress={handleBackPress}
            isInternetReachable={netInfo?.isInternetReachable ?? false}
          />
        </>
      )}
      
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="[id]" />
        <Stack.Screen name="assessments/[assessmentId]" />
        <Stack.Screen name="materials/[materialId]" />
      </Stack>

      {/* Profile Dropdown Menu Modal */}
      <Modal visible={isProfileMenuVisible} transparent={true} animationType="fade" onRequestClose={toggleProfileMenu}>
        <TouchableOpacity style={styles.profileMenuOverlay} activeOpacity={1} onPress={toggleProfileMenu}>
          <View style={styles.profileMenuContainer}>
            <TouchableOpacity style={styles.profileMenuItem} onPress={() => { toggleProfileMenu(); router.push('/settings'); }}>
              <Ionicons name="person-circle-outline" size={22} color="#495057" />
              <Text style={styles.profileMenuItemText}>Profile</Text>
            </TouchableOpacity>
            <View style={styles.profileMenuDivider} />
            <TouchableOpacity style={styles.profileMenuItem} onPress={() => { toggleProfileMenu(); handleLogout(); }}>
              <Ionicons name="log-out-outline" size={22} color="#dc3545" />
              <Text style={[styles.profileMenuItemText, { color: '#dc3545' }]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  profileMenuOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  profileMenuContainer: { position: 'absolute', top: 80, right: 16, backgroundColor: '#fff', borderRadius: 14, width: 200, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10, paddingVertical: 10 },
  profileMenuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 },
  profileMenuItemText: { fontSize: 16, color: '#343a40', marginLeft: 14, fontWeight: '500' },
  profileMenuDivider: { height: 1, backgroundColor: '#e9ecef', marginVertical: 6, marginHorizontal: 12 },
});