/**
 * CustomLoadingScreen.tsx
 * 
 * A custom loading animation that replaces Expo's default splash screen.
 * 
 * Animation Flow:
 * 1️⃣ Stage 1 - Bounce-In Logo: Letter "O" scales from 0.5 → 1.2 → 1.0 with fade in (~700ms)
 * 2️⃣ Stage 2 - Loading Spinner: "O" rotates like a loading spinner (2-3 full rotations, ~1.5-2s)
 * 3️⃣ Stage 3 - Morph Transition: "O" crossfades to main OLIN logo (~700ms)
 * 4️⃣ Stage 4 - Final Fade Out: Logo fades/slides out before navigation (~300-400ms)
 */

import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef } from 'react';
import {
    Animated,
    Dimensions,
    Easing,
    Image,
    ImageSourcePropType,
    StyleSheet,
    View,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Animation timing constants (in milliseconds)
const ANIMATION_TIMING = {
  STAGE_1_BOUNCE_IN: 700,        // Bounce-in duration
  STAGE_2_SPINNER: 2000,         // Spinner rotation duration (2-3 rotations)
  STAGE_3_MORPH: 700,            // Morph/crossfade duration
  STAGE_4_FADE_OUT: 350,         // Final fade out duration
  SPINNER_ROTATIONS: 3,          // Number of full rotations
};

// Image assets - Letter O and Main OLIN logo
const LOGO_O: ImageSourcePropType = require('../assets/images/logo-O.png');
const MAIN_LOGO: ImageSourcePropType = require('../assets/images/fullolinlogo.png');

interface CustomLoadingScreenProps {
  /** Callback fired when all animations complete */
  onAnimationComplete?: () => void;
  /** Whether to auto-start the animation sequence */
  autoStart?: boolean;
}

export default function CustomLoadingScreen({
  onAnimationComplete,
  autoStart = true,
}: CustomLoadingScreenProps) {
  // ═══════════════════════════════════════════════════════════════════════════
  // ANIMATION VALUES
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Stage 1: Bounce-in animations for Letter O
  const logoOOpacity = useRef(new Animated.Value(0)).current;
  const logoOScale = useRef(new Animated.Value(0.5)).current;
  
  // Stage 2: Spinner rotation
  const spinnerRotation = useRef(new Animated.Value(0)).current;
  
  // Stage 3: Morph transition - crossfade to main logo
  const mainLogoOpacity = useRef(new Animated.Value(0)).current;
  const mainLogoScale = useRef(new Animated.Value(0.9)).current;
  
  // Stage 4: Final fade/slide out
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const containerTranslateY = useRef(new Animated.Value(0)).current;

  // ═══════════════════════════════════════════════════════════════════════════
  // ANIMATION STAGES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Stage 1: Bounce-In Logo Animation
   * Scale from 0.5 → 1.2 → 1.0 with opacity fade in
   */
  const runStage1BounceIn = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      console.log('🎬 Stage 1: Bounce-In Logo starting...');
      
      Animated.parallel([
        // Fade in opacity
        Animated.timing(logoOOpacity, {
          toValue: 1,
          duration: ANIMATION_TIMING.STAGE_1_BOUNCE_IN * 0.5, // Fade in faster
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        // Bounce scale: 0.5 → 1.2 → 1.0
        Animated.sequence([
          // First: scale up to 1.2 (overshoot)
          Animated.timing(logoOScale, {
            toValue: 1.2,
            duration: ANIMATION_TIMING.STAGE_1_BOUNCE_IN * 0.6,
            easing: Easing.out(Easing.back(1.5)),
            useNativeDriver: true,
          }),
          // Then: settle to 1.0
          Animated.timing(logoOScale, {
            toValue: 1.0,
            duration: ANIMATION_TIMING.STAGE_1_BOUNCE_IN * 0.4,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        console.log('✅ Stage 1: Bounce-In complete');
        resolve();
      });
    });
  }, [logoOOpacity, logoOScale]);

  /**
   * Stage 2: Loading Spinner Animation
   * Rotate the "O" logo like a loading spinner (2-3 full rotations)
   */
  const runStage2Spinner = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      console.log('🎬 Stage 2: Spinner rotation starting...');
      
      Animated.timing(spinnerRotation, {
        toValue: ANIMATION_TIMING.SPINNER_ROTATIONS, // Number of full rotations
        duration: ANIMATION_TIMING.STAGE_2_SPINNER,
        easing: Easing.inOut(Easing.ease), // Smooth acceleration/deceleration
        useNativeDriver: true,
      }).start(() => {
        console.log('✅ Stage 2: Spinner rotation complete');
        resolve();
      });
    });
  }, [spinnerRotation]);

  /**
   * Stage 3: Morph Transition to Main Logo
   * Crossfade from "O" to main OLIN logo with slight scale animation
   */
  const runStage3Morph = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      console.log('🎬 Stage 3: Morph transition starting...');
      
      Animated.parallel([
        // Fade out the "O" logo
        Animated.timing(logoOOpacity, {
          toValue: 0,
          duration: ANIMATION_TIMING.STAGE_3_MORPH * 0.6,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        // Scale up "O" slightly before disappearing
        Animated.timing(logoOScale, {
          toValue: 1.1,
          duration: ANIMATION_TIMING.STAGE_3_MORPH * 0.4,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        // Fade in main logo
        Animated.timing(mainLogoOpacity, {
          toValue: 1,
          duration: ANIMATION_TIMING.STAGE_3_MORPH,
          delay: ANIMATION_TIMING.STAGE_3_MORPH * 0.2, // Slight delay for crossfade effect
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        // Scale main logo from 0.9 → 1.0
        Animated.timing(mainLogoScale, {
          toValue: 1.0,
          duration: ANIMATION_TIMING.STAGE_3_MORPH,
          delay: ANIMATION_TIMING.STAGE_3_MORPH * 0.2,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]).start(() => {
        console.log('✅ Stage 3: Morph transition complete');
        resolve();
      });
    });
  }, [logoOOpacity, logoOScale, mainLogoOpacity, mainLogoScale]);

  /**
   * Stage 4: Final Fade/Slide Out
   * Logo fades out and optionally slides up before navigation
   */
  const runStage4FadeOut = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      console.log('🎬 Stage 4: Final fade out starting...');
      
      Animated.parallel([
        // Fade out entire container
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: ANIMATION_TIMING.STAGE_4_FADE_OUT,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        // Slide up slightly
        Animated.timing(containerTranslateY, {
          toValue: -30,
          duration: ANIMATION_TIMING.STAGE_4_FADE_OUT,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(() => {
        console.log('✅ Stage 4: Final fade out complete');
        resolve();
      });
    });
  }, [containerOpacity, containerTranslateY]);

  /**
   * Run the complete animation sequence
   */
  const runAnimationSequence = useCallback(async () => {
    console.log('🚀 Starting OLIN loading animation sequence...');
    
    try {
      // Stage 1: Bounce-in the "O" logo
      await runStage1BounceIn();
      
      // Stage 2: Spin the "O" logo
      await runStage2Spinner();
      
      // Stage 3: Morph to main logo
      await runStage3Morph();
      
      // Brief pause to let user see the main logo
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      // Stage 4: Fade out
      await runStage4FadeOut();
      
      console.log('🎉 All animation stages complete!');
      
      // Notify parent component that animation is complete
      if (onAnimationComplete) {
        onAnimationComplete();
      }
    } catch (error) {
      console.error('❌ Animation sequence error:', error);
      // Still call completion callback even on error
      if (onAnimationComplete) {
        onAnimationComplete();
      }
    }
  }, [runStage1BounceIn, runStage2Spinner, runStage3Morph, runStage4FadeOut, onAnimationComplete]);

  // ═══════════════════════════════════════════════════════════════════════════
  // EFFECT: Auto-start animation on mount
  // ═══════════════════════════════════════════════════════════════════════════
  
  useEffect(() => {
    if (autoStart) {
      // Small delay to ensure component is fully mounted
      const timer = setTimeout(() => {
        runAnimationSequence();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [autoStart, runAnimationSequence]);

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERPOLATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Convert rotation value to degrees (for 3 full rotations)
  const spinnerRotationInterpolation = spinnerRotation.interpolate({
    inputRange: [0, ANIMATION_TIMING.SPINNER_ROTATIONS],
    outputRange: ['0deg', `${360 * ANIMATION_TIMING.SPINNER_ROTATIONS}deg`],
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  
  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: containerOpacity,
          transform: [{ translateY: containerTranslateY }],
        },
      ]}
    >
      <LinearGradient
        colors={['#F8FAFC', '#E2E8F0', '#CBD5E1']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* Logo Container - holds both logos for crossfade */}
        <View style={styles.logoContainer}>
          {/* Letter "O" Logo - Stages 1 & 2 */}
          <Animated.View
            style={[
              styles.logoWrapper,
              {
                opacity: logoOOpacity,
                transform: [
                  { scale: logoOScale },
                  { rotate: spinnerRotationInterpolation },
                ],
              },
            ]}
          >
            <Image
              source={LOGO_O}
              style={styles.logoO}
              resizeMode="contain"
            />
          </Animated.View>

          {/* Main OLIN Logo - Stage 3 */}
          <Animated.View
            style={[
              styles.mainLogoWrapper,
              {
                opacity: mainLogoOpacity,
                transform: [{ scale: mainLogoScale }],
              },
            ]}
          >
            <Image
              source={MAIN_LOGO}
              style={styles.mainLogo}
              resizeMode="contain"
            />
          </Animated.View>
        </View>

        {/* Optional: Loading indicator dots */}
        <View style={styles.loadingIndicator}>
          <LoadingDots opacity={logoOOpacity} />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

/**
 * LoadingDots - Animated loading indicator dots
 * Shows during stages 1-2, fades with the "O" logo
 */
function LoadingDots({ opacity }: { opacity: Animated.Value }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDots = () => {
      Animated.loop(
        Animated.stagger(150, [
          Animated.sequence([
            Animated.timing(dot1, {
              toValue: 1,
              duration: 300,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(dot1, {
              toValue: 0,
              duration: 300,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(dot2, {
              toValue: 1,
              duration: 300,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(dot2, {
              toValue: 0,
              duration: 300,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(dot3, {
              toValue: 1,
              duration: 300,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(dot3, {
              toValue: 0,
              duration: 300,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    };

    animateDots();
  }, [dot1, dot2, dot3]);

  const dotScale = (animValue: Animated.Value) =>
    animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.3],
    });

  const dotOpacity = (animValue: Animated.Value) =>
    animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.4, 1],
    });

  return (
    <Animated.View style={[styles.dotsContainer, { opacity }]}>
      <Animated.View
        style={[
          styles.dot,
          {
            opacity: dotOpacity(dot1),
            transform: [{ scale: dotScale(dot1) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.dot,
          {
            opacity: dotOpacity(dot2),
            transform: [{ scale: dotScale(dot2) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.dot,
          {
            opacity: dotOpacity(dot3),
            transform: [{ scale: dotScale(dot3) }],
          },
        ]}
      />
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoWrapper: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoO: {
    width: 120,
    height: 120,
  },
  mainLogoWrapper: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainLogo: {
    width: 250,
    height: 100,
  },
  loadingIndicator: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.25,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3B82F6',
  },
});
