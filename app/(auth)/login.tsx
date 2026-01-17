// (auth)/login.tsx

import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import {
    Alert,
    Animated,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import api, { googleAuth, prepareOfflineMode, storeAuthToken, storeUserData } from '@/lib/api';
import { registerBackgroundSync } from '@/lib/backgroundSync';
import { useNetworkStatus } from '../../context/NetworkContext';
import { useOAuth } from '../../context/OAuthContext'; // Correct import
import { initDb, resetTimeCheckData } from '../../lib/localDb';

WebBrowser.maybeCompleteAuthSession();

const googleConfig = {
  androidClientId: '194606315101-b2ihku865cct78jmvnu9abl6niqed24f.apps.googleusercontent.com',
  webClientId: '194606315101-t6942gavub8kh16dogd0k600upkctcf2.apps.googleusercontent.com', 
};

interface Errors {
  email?: string;
  password?: string;
  [key: string]: string | undefined;
}

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<Errors>({});
  const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest(googleConfig);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  
  // Animation values
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(50)).current;

  const { isConnected, netInfo } = useNetworkStatus();
  const { startProcessing, stopProcessing } = useOAuth(); // Use global OAuth context

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // UPDATED: This useEffect now handles success, cancellation, or failure
  React.useEffect(() => {
    if (googleResponse?.type === 'success') {
      handleGoogleSuccess(googleResponse.authentication?.accessToken);
    } else if (googleResponse?.type === 'dismiss' || googleResponse?.type === 'cancel' || googleResponse?.type === 'error') {
      console.log('Google Auth was dismissed, cancelled, or failed:', googleResponse.type);
      stopProcessing(); // Hide the loading overlay
    }
  }, [googleResponse]);

  // UPDATED: Starts the loading overlay with a specific message
  const handleGoogleLogin = () => {
    if (!isConnected) {
      Alert.alert(
        "No Network Connection",
        "You need an internet connection to sign in with Google."
      );
      return;
    }
    
    // UPDATED: Pass a message to startProcessing
    startProcessing('Contacting Google...'); // Show loading overlay immediately
    googlePromptAsync();
  };

  const handleGoogleSuccess = async (accessToken: string | undefined) => {
    if (!accessToken) {
      Alert.alert('Error', 'Google authentication failed - no access token received');
      stopProcessing(); // Make sure to stop processing on failure
      return;
    }
    
    try {
      // UPDATED: Show a new message while we verify with our backend
      startProcessing('Verifying your account...');

      const userInfoResponse = await fetch(
        `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`
      );
      const googleUserData = await userInfoResponse.json();
      
      console.log('📋 Google user data:', googleUserData);
      
      const result = await googleAuth({
        id: googleUserData.id,
        email: googleUserData.email,
        name: googleUserData.name,
        picture: googleUserData.picture,
        given_name: googleUserData.given_name,
        family_name: googleUserData.family_name,
      });

      if (result.success) {
        console.log('✅ Google auth result:', result);

        // --- THIS IS THE KEY CHANGE ---
        // UPDATED: Show a specific message based on sign-up or sign-in
        const setupMessage = result.isNewUser 
          ? 'Finalizing account setup...' 
          : 'Preparing your app...';
        startProcessing(setupMessage);
        // -----------------------------

        await resetTimeCheckData(result.user.email);
        
        // Initialize database and prepare offline mode
        await initDb();
        await prepareOfflineMode();
        
        // Register background sync for offline work
        console.log('🔄 Registering background sync for Google user...');
        const syncRegistered = await registerBackgroundSync();
        if (syncRegistered) {
          console.log('✅ Background sync enabled - will sync even when app is closed');
        } else {
          console.log('⚠️ Background sync registration failed - only foreground sync available');
        }
        
        stopProcessing(); // Hide overlay before showing alert
        
        if (result.isVerified) {
          Alert.alert(
            'Success', 
            // UPDATED: Custom alert text
            result.isNewUser ? 'Account created successfully!' : 'Signed in successfully!', 
            [
              {
                text: 'OK',
                onPress: () => {
                  console.log('➡️ Navigating to /(app)');
                  router.replace({
                    pathname: '/(app)',
                    params: { isNewUser: result.isNewUser ? 'true' : 'false' }
                  });
                }
              }
            ]
          );
        } else {
          Alert.alert(
            result.isNewUser ? 'Account Created' : 'Verify Your Email', 
            'Please check your email for a verification code to complete your registration.',
            [
              {
                text: 'OK',
                onPress: () => {
                  console.log('➡️ Navigating to /(auth)/verify-notice');
                  router.replace('/(auth)/verify-notice');
                }
              }
            ]
          );
        }
      } else {
        stopProcessing(); // Stop on failure
        console.error('❌ Google auth failed:', result.message);
        
        if (result.error === 'invalid_role') {
          Alert.alert(
            'Access Denied', 
            result.message || 'This mobile app is only available for students. Please use the web portal.',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Authentication Failed', result.message || 'Google sign-in failed');
        }
      }
    } catch (error: any) {
      stopProcessing(); // Stop on error
      console.error('Google auth error:', error);
      Alert.alert('Error', 'Failed to authenticate with Google. Please try again.');
    }
  };

  const handleLogin = async () => {
    if (!netInfo?.isInternetReachable) {
      Alert.alert(
        "No Network Connection",
        "You must be connected to the internet to log in for the first time or to restore your session."
      );
      return;
    }
    
    setLoading(true);
    setErrors({});

    try {
      const response = await api.post('/login', { email, password });
      const { user, token } = response.data;
      
      await storeAuthToken(token);
      await storeUserData(user);

      const verificationResponse = await api.get('/user/verification-status');
      const isVerified = verificationResponse.data.is_verified;

      // Initialize database and prepare offline mode
      await initDb();
      await prepareOfflineMode();
      
      // Register background sync for offline work
      console.log('🔄 Registering background sync...');
      const syncRegistered = await registerBackgroundSync();
      if (syncRegistered) {
        console.log('✅ Background sync enabled - will sync even when app is closed');
      } else {
        console.log('⚠️ Background sync registration failed - only foreground sync available');
      }

      if (isVerified) {
        Alert.alert('Success', 'Logged in successfully!');
        await resetTimeCheckData(user.email);
        router.replace('/(app)');
      } else {
        Alert.alert('Pending Verification', 'Please check your email to verify your account.');
        router.replace('/(auth)/verify-notice');
      }
    } catch (err: any) {
      console.error('Login error:', err.response?.data || err.message);
      
      if (err.response?.status === 403 && err.response?.data?.error === 'invalid_role') {
        Alert.alert(
          'Access Denied',
          err.response.data.message || 'This mobile app is only available for students. Please use the web portal.',
          [{ text: 'OK' }]
        );
      } else if (err.response && err.response.data && err.response.data.errors) {
        const validationErrors: Errors = {};
        for (const key in err.response.data.errors) {
          validationErrors[key as keyof Errors] = err.response.data.errors[key][0];
        }
        setErrors(validationErrors);
      } else {
        Alert.alert('Login Failed', err.response?.data?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={["#F1F5F9", "#E2E8F0"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View 
            style={[
              styles.contentContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }]
              }
            ]}
          >
            {/* Welcome Title */}
            <Text style={styles.welcomeTitle}>Welcome to OLIN LMS</Text>

            {/* Logo Image */}
            <View style={styles.logoContainer}>
              <Image
                source={require('@/assets/images/fullolinlogo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>

            {/* Subtitle Text */}
            <View style={styles.subtitleContainer}>
              <Text style={styles.subtitleText}>Your learning journey starts here.</Text>
              <Text style={styles.subtitleText}>Sign in with your registered Google account to continue.</Text>
            </View>
            
            {/* Offline Notice */}
            {!isConnected && (
              <View style={styles.offlineNotice}>
                <Ionicons name="cloud-offline-outline" size={20} color="#5f6368" />
                <Text style={styles.offlineText}>You are offline. Connect to sign in.</Text>
              </View>
            )}
            
            {/* Google Sign In Button */}
            <TouchableOpacity 
              testID="google-login-button"
              style={[styles.googleButtonDark, (loading || !isConnected) && styles.buttonDisabled]} 
              onPress={handleGoogleLogin}
              disabled={loading || !isConnected}
            >
              <View style={styles.googleButtonContent}>
                <Ionicons name="logo-google" size={20} color="#fff" />
                <Text style={styles.googleButtonTextDark}>Continue with Google</Text>
              </View>
            </TouchableOpacity>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

// Clean, modern styles matching the OLIN LMS design
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardContainer: { 
    flex: 1,
  },
  scrollContainer: { 
    flexGrow: 1, 
    justifyContent: 'center', 
    paddingHorizontal: 30,
    paddingVertical: 50,
  },
  contentContainer: {
    alignItems: 'center',
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    color: '#111827',
    marginBottom: 40,
    letterSpacing: 0.5,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  logoImage: {
    width: 280,
    height: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  subtitleContainer: {
    alignItems: 'center',
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  subtitleText: {
    fontSize: 16,
    color: '#111827',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400',
  },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginBottom: 20,
    gap: 10,
  },
  offlineText: {
    fontSize: 14,
    color: '#5f6368',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 30,
    borderRadius: 8,
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#dadce0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  googleButtonDark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    paddingVertical: 16,
    paddingHorizontal: 30,
    borderRadius: 8,
    width: '100%',
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  googleIcon: {
    width: 20,
    height: 20,
  },
  googleButtonText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '600',
  },
  googleButtonTextDark: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  footerContainer: {
    marginTop: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  footerLink: {
    color: '#3B82F6',
    fontWeight: '500',
    fontSize: 12,
  },
  legalLinksContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  },
});