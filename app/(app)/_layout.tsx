// app/(app)/_layout.tsx
import { CustomHeader } from '@/components/CustomHeader';
import { useNetworkSync } from '@/hooks/useNetworkSync';
import { unregisterBackgroundSync } from '@/lib/backgroundSync';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { Tabs, usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useNetworkStatus } from '../../context/NetworkContext';
import { API_BASE_URL, clearAuthToken, getAuthorizationHeader, getProfile, getServerTime, getUserData } from '../../lib/api';
import { clearOfflineData } from '../../lib/localDb';

export default function AppLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { isConnected, netInfo } = useNetworkStatus();
  const [initials, setInitials] = useState<string>('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isProfileMenuVisible, setIsProfileMenuVisible] = useState<boolean>(false);
  const appState = useRef(AppState.currentState);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);

  useNetworkSync(setIsBackgroundSyncing);

  useEffect(() => {
    // This listener checks if the app is coming from the background
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to the foreground!
        console.log('✅ [GLOBAL] App has come to the foreground!');
        
        // --- START OF FIX ---
        // We MUST check the network state *at this exact moment*
        // by fetching it directly.
        const currentState = await NetInfo.fetch();
        
        if (currentState.isInternetReachable) {
          // If we are ONLINE, we must re-sync with the server time.
          // This establishes a new valid baseline and prevents
          // the time spent in the background from being counted as
          // "offline time".
          console.log('🔄 [GLOBAL] App is ONLINE. Re-syncing server time...');
          try {
            // getServerTime(true) fetches from API and saves the new baseline.
            // This is the correct function to call.
            await getServerTime(true); 
            console.log('✅ [GLOBAL] Server time baseline reset.');
          } catch (error) {
            console.error('❌ [GLOBAL] Failed to re-sync server time on app resume:', error);
          }
        } else {
          // If we are OFFLINE, we must *not* update any time.
          // The app's existing logic (e.g., in [id].tsx) will
          // check validity based on the *last known* server time.
          // Calling updateTimeSync() here would *cause* a
          // false positive for time manipulation.
          console.log('⚠️ [GLOBAL] App is OFFLINE. Skipping time sync to prevent false positive.');
        }
        // --- END OF FIX ---
      }

      // Update the current state
      appState.current = nextAppState;
    });

    return () => {
      // Clean up the listener when the component unmounts
      subscription.remove();
    };
  }, []);
  
  useEffect(() => {
    const fetchUserProfile = async () => {
      let foundName = false; // Flag to track if we set initials
      try {
        // Only fetch and set profile image when online
        if (netInfo?.isInternetReachable) {
          try {
            const profileData = await getProfile();
            if (profileData) {
              // ALWAYS set the profile image from the API response (it's null if not set, which is correct)
              setProfileImage(profileData.profile_image);
              
              // Try to set initials from API
              if (profileData.name) {
                const firstLetter = profileData.name.charAt(0).toUpperCase();
                setInitials(firstLetter);
                foundName = true; // We found a name from the API
              }
              // *** KEY CHANGE: REMOVED THE `return;` STATEMENT ***
              // This allows the code to continue to the fallback logic if no name was found
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
        // Run this if:
        // 1. We are offline.
        // 2. We are online BUT the API didn't provide a name (foundName is false).
        if (!foundName) {
          const userData = await getUserData();
          if (userData && userData.name) {
            const firstLetter = userData.name.charAt(0).toUpperCase();
            setInitials(firstLetter);
            foundName = true; // We found a name from local data
          }
        }

        // If after all checks, we still have no name, set '?'
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

  // Load notification count for badge display
  const loadNotifications = async () => {
    try {
      if (!netInfo?.isInternetReachable) {
        console.log('🔡 No internet connection - skipping notification fetch');
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
      console.log('🔡 Offline mode - notification interval disabled');
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

  // Check if we're on a detail screen (within the courses stack but not the index)
  const isOnCoursesDetailScreen = () => {
    return pathname.includes('/courses/') && 
           !pathname.endsWith('/courses') && 
           !pathname.endsWith('/courses/');
  };

  // Check if we're on the notifications screen
  const isOnNotificationsScreen = () => {
    return pathname.includes('/notifications');
  };

  // Get current screen title based on pathname
  const getScreenTitle = () => {
    if (pathname.includes('/to-do')) return 'To-do';
    if (pathname.includes('/settings')) return 'Settings';
    if (pathname.includes('/notifications')) return 'Notifications';
    if (pathname === '/courses' || pathname === '/courses/') return 'My Courses';
    return 'Dashboard';
  };

  // Check if we should hide notifications (on settings screen or notifications screen)
  const shouldHideNotifications = pathname.includes('/settings') || pathname.includes('/notifications');

  // Only show header on tab screens, NOT on detail screens within courses or notifications page
  const shouldShowHeader = !isOnCoursesDetailScreen() && !isOnNotificationsScreen();

  return (
    <>
      {shouldShowHeader && (
        <CustomHeader
          title={getScreenTitle()}
          initials={initials}
          profileImage={profileImage}
          unreadCount={unreadCount}
          onNotificationPress={netInfo?.isInternetReachable ? navigateToNotifications : () => console.log('🔡 Notifications disabled - no internet')}
          onProfilePress={toggleProfileMenu}
          isInternetReachable={netInfo?.isInternetReachable ?? false}
          hideNotifications={shouldHideNotifications}
        />
      )}
      
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#007bff',
          tabBarInactiveTintColor: '#888',
          tabBarStyle: { 
            backgroundColor: '#fff', 
            borderTopWidth: StyleSheet.hairlineWidth, 
            borderTopColor: '#ccc',
          },
          tabBarLabelStyle: { 
            fontSize: 12, 
            fontWeight: '500',
          },
        }}
      >
        <Tabs.Screen 
          name="index" 
          options={{ 
            tabBarLabel: 'Home', 
            tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} /> 
          }} 
        />
        <Tabs.Screen 
          name="courses" 
          options={{ 
            tabBarLabel: 'Courses', 
            tabBarIcon: ({ color }) => <Ionicons name="book" size={24} color={color} /> 
          }} 
        />
        <Tabs.Screen 
          name="to-do" 
          options={{ 
            tabBarLabel: 'To-do', 
            tabBarIcon: ({ color }) => <Ionicons name="document-text" size={24} color={color} /> 
          }} 
        />
        <Tabs.Screen 
          name="settings" 
          options={{ 
            tabBarLabel: 'Settings', 
            tabBarIcon: ({ color }) => <Ionicons name="settings" size={24} color={color} /> 
          }} 
        />
        {/* Hide notifications from tab bar - it's accessed via header icon */}
        <Tabs.Screen 
          name="notifications" 
          options={{ 
            href: null, // Hide from tab bar
          }} 
        />
      </Tabs>

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

      {isBackgroundSyncing && (
        <View style={styles.syncIndicatorContainer}>
          <View style={styles.syncIndicatorContent}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.syncIndicatorText}>Syncing your work...</Text>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  profileMenuOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  profileMenuContainer: { position: 'absolute', top: 80, right: 16, backgroundColor: '#fff', borderRadius: 14, width: 200, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10, paddingVertical: 10 },
  profileMenuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 },
  profileMenuItemText: { fontSize: 16, color: '#343a40', marginLeft: 14, fontWeight: '500' },
  profileMenuDivider: { height: 1, backgroundColor: '#e9ecef', marginVertical: 6, marginHorizontal: 12 },
  syncIndicatorContainer: {
    position: 'absolute',
    bottom: 70, // Above the tab bar
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999, // Ensure it sits on top of everything
    pointerEvents: 'none', // Let clicks pass through to content behind it if needed
  },
  syncIndicatorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(25, 103, 210, 0.9)', // Brand blue with slight transparency
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  syncIndicatorText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});