// _layout.tsx

import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import NetInfo from '@react-native-community/netinfo';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Asset } from 'expo-asset';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import CustomLoadingScreen from '@/components/CustomLoadingScreen';
import { useColorScheme } from '@/hooks/useColorScheme';
import { AppProvider } from '../context/AppContext';
import { NetworkProvider } from '../context/NetworkContext';
import { OAuthProvider } from '../context/OAuthContext';
import api, { clearAuthData, getAuthToken, getUserData, initializeAuth } from '../lib/api';
import { initDb } from '../lib/localDb';

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTANT: Prevent auto-hiding of Expo splash screen
// This allows us to fully control the custom animation before revealing the app
// ═══════════════════════════════════════════════════════════════════════════
SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore errors - splash screen may already be hidden
  console.log('⚠️ SplashScreen.preventAutoHideAsync() warning (safe to ignore)');
});

export default function RootLayout() {
  // ═══════════════════════════════════════════════════════════════════════════
  // STATE & REFS
  // ═══════════════════════════════════════════════════════════════════════════
  
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  const [isInitializing, setIsInitializing] = useState(true);
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);
  const initStartTime = useRef<number>(Date.now());

  // ═══════════════════════════════════════════════════════════════════════════
  // PRELOAD ASSETS (Logo images for smooth animation)
  // ═══════════════════════════════════════════════════════════════════════════
  
  useEffect(() => {
    const preloadAssets = async () => {
      try {
        console.log('📦 Preloading animation assets...');
        
        // Preload the logo images used in the custom loading screen
        await Asset.loadAsync([
          require('../assets/images/logo-O.png'),
          require('../assets/images/fullolinlogo.png'),
        ]);
        
        console.log('✅ Animation assets preloaded');
        setAssetsLoaded(true);
      } catch (error) {
        console.error('❌ Failed to preload assets:', error);
        // Continue even if asset preload fails
        setAssetsLoaded(true);
      }
    };

    preloadAssets();
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // HIDE NATIVE SPLASH SCREEN
  // Hide as soon as fonts and assets are loaded so custom animation can show
  // ═══════════════════════════════════════════════════════════════════════════
  
  useEffect(() => {
    const hideNativeSplash = async () => {
      if (loaded && assetsLoaded && !nativeSplashHidden) {
        console.log('🙈 Hiding native Expo splash screen...');
        try {
          await SplashScreen.hideAsync();
          setNativeSplashHidden(true);
          console.log('✅ Native splash screen hidden, custom animation will show');
        } catch (error) {
          console.error('❌ Error hiding splash screen:', error);
          setNativeSplashHidden(true);
        }
      }
    };

    hideNativeSplash();
  }, [loaded, assetsLoaded, nativeSplashHidden]);

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZE APP (Check auth status)
  // ═══════════════════════════════════════════════════════════════════════════
  
  useEffect(() => {
    const initializeApp = async () => {
      initStartTime.current = Date.now();
      
      try {
        console.log('🚀 Initializing app...');

        await initDb();
        console.log('✅ Database initialized');

        await initializeAuth();
        console.log('✅ Auth initialized');

        const token = await getAuthToken();
        const userData = await getUserData();

        if (token && userData) {
          console.log('✅ Existing authentication found for user:', userData.email);

          try {
            console.log('🛡️ Validating token with a protected endpoint (/my-courses)...');
            await api.get('/my-courses');
            console.log('✅ Token is valid.');

            console.log('Checking user verification status...');
            const verificationResponse = await api.get('/user/verification-status');
            const isVerified = verificationResponse.data.is_verified;

            if (isVerified) {
              console.log('✅ User is verified - Redirecting to app dashboard');
              setInitialRoute('(app)');
            } else {
              console.log('⚠️ User is not verified - Redirecting to verify-notice');
              setInitialRoute('(auth)/verify-notice');
            }
          } catch (error: any) {
            console.error('❌ Error during initial auth check:', error.message);

            if (error.response?.status === 401 || error.response?.status === 403) {
              console.log('🛡️ Auth error detected (401/403). Clearing data.');
              await clearAuthData();
              console.log('🔄 Redirecting to login');
              setInitialRoute('(auth)/login');
            } else if (!error.response) {
              console.log('⚠️ Network error during auth check. Performing direct network check...');
              const netState = await NetInfo.fetch();

              if (netState.isInternetReachable) {
                console.log('...Network IS reachable. Assuming flaky connection or invalid token. Redirecting to login.');
                await clearAuthData();
                setInitialRoute('(auth)/login');
              } else {
                console.log('...Network IS NOT reachable. Proceeding to app in offline mode.');
                setInitialRoute('(app)');
              }
            } else {
              console.log(`Server error (${error.response?.status}) during auth check. Redirecting to login.`);
              await clearAuthData();
              setInitialRoute('(auth)/login');
            }
          }
        } else {
          console.log('❌ No existing authentication found');
          console.log('🔄 Redirecting to login');
          setInitialRoute('(auth)/login');
        }
      } catch (error) {
        console.error('❌ App initialization error:', error);
        setInitialRoute('(auth)/login');
      } finally {
        const elapsedTime = Date.now() - initStartTime.current;
        console.log(`⏱️ App initialization completed in ${elapsedTime}ms`);
        setIsInitializing(false);
      }
    };

    if (loaded && assetsLoaded) {
      initializeApp();
    }
  }, [loaded, assetsLoaded]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ANIMATION COMPLETE HANDLER
  // Called when the custom loading animation finishes all stages
  // ═══════════════════════════════════════════════════════════════════════════
  
  const handleAnimationComplete = useCallback(() => {
    console.log('🎉 Custom loading animation complete');
    setAnimationComplete(true);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER LOGIC
  // ═══════════════════════════════════════════════════════════════════════════

  // Show nothing until fonts and assets are loaded (native splash still showing)
  if (!loaded || !assetsLoaded) {
    return null;
  }

  // Show custom loading animation while initializing OR animation not complete
  // The animation continues until BOTH: initialization is done AND animation finished
  if (isInitializing || initialRoute === null || !animationComplete) {
    return (
      <CustomLoadingScreen
        onAnimationComplete={handleAnimationComplete}
        autoStart={nativeSplashHidden} // Only start animation after native splash is hidden
      />
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN APP RENDER
  // Ready state: initialization complete + animation finished
  // ═══════════════════════════════════════════════════════════════════════════
  
  return (
    <View style={{ flex: 1 }}>
      <AppNavigator initialRoute={initialRoute} />
    </View>
  );
}

// --- NEW COMPONENT ---
// This component holds all the providers and the Stack navigator.
// It is *only* rendered by RootLayout *after* initialization is complete.
function AppNavigator({ initialRoute }: { initialRoute: string }) {
  const colorScheme = useColorScheme();

  return (
    <NetworkProvider>
      <AppProvider>
        <OAuthProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DefaultTheme : DarkTheme}>
            <Stack
              initialRouteName={initialRoute} // <-- Receives the correct route as a prop
              screenOptions={{ headerShown: false }}
            >
              <Stack.Screen name="(auth)/login" options={{ title: 'Login' }} />
              <Stack.Screen name="(auth)/signup" options={{ title: 'Sign Up' }} />
              <Stack.Screen name="(auth)/verify-notice" options={{ title: 'Verification Notice' }} />
              <Stack.Screen name="(app)" />
            </Stack>
            <StatusBar style="auto" />
          </ThemeProvider>
        </OAuthProvider>
      </AppProvider>
    </NetworkProvider>
  );
}