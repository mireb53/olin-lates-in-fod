// review-answer.tsx

import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
// Anti-screenshot temporarily disabled. To re-enable, uncomment this import and the effect below.
// import * as ScreenCapture from 'expo-screen-capture';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useNetworkStatus } from '../../../../../context/NetworkContext';
import api, { getUserData } from '../../../../../lib/api';
import { getAssessmentReviewFromDb } from '../../../../../lib/localDb';

// Responsive design helper
const { width: screenWidth } = Dimensions.get('window');
const isTablet = screenWidth >= 768;
const isLargeTablet = screenWidth >= 1024;
const contentMaxWidth = isLargeTablet ? 900 : isTablet ? 700 : screenWidth;

// Define the data structures for clarity
interface OriginalQuestion {
  id: number;
  question_text: string;
  question_type: string;
  correct_answer: string | null; // This holds 'True'/'False' for T/F, option_order for MC, text for ID
  points: number;
  part_id?: number; // Part ID from the question
  part?: { // Part relationship loaded from API
    id: number;
    title: string;
    instructions?: string;
    order?: number;
  };
  // Handle multiple possible field names from Laravel API (snake_case vs camelCase)
  questionOptions?: { id: number; question_id: number; option_text: string; option_order: number }[];
  question_options?: { id: number; question_id: number; option_text: string; option_order: number }[];
  options?: { id: number; question_id: number; option_text: string; option_order: number }[];
  // Enumeration fields
  enumeration_answers?: string[]; // Array of correct answers for enumeration questions
  is_order_sensitive?: boolean; // Whether answer order matters for enumeration
}

interface SubmittedOption {
  id: number;
  question_option_id: number;
  option_text: string;
  is_correct_option: boolean | number | string; // Can be boolean, number (0/1), or string from API
  is_selected: boolean;
  display_order?: number; // For shuffled options order
  // Nested questionOption from Laravel eager loading (camelCase or snake_case)
  questionOption?: { id: number; question_id: number; option_text: string; option_order: number };
  question_option?: { id: number; question_id: number; option_text: string; option_order: number };
}

interface SubmittedQuestion {
  id: number;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'essay' | 'identification' | 'enumeration';
  max_points: number;
  submitted_answer: string | null;
  submitted_answers?: string[]; // For enumeration questions
  is_correct: boolean | null;
  score_earned: number | null;
  // Handle both snake_case and camelCase from Laravel API
  submitted_options?: SubmittedOption[];
  submittedOptions?: SubmittedOption[];
  question?: OriginalQuestion; // Contains the original question details including correct_answer
  // Part information (from mobile-app_latest)
  part_id?: number;
  part_title?: string;
  part_order?: number;
  part_instructions?: string;
  // Enumeration fields
  enumeration_answers?: string[];
  is_order_sensitive?: boolean;
}

interface ReviewData {
  id: number;
  score: number | null;
  status: string;
  can_view_answers?: boolean;
  assessment: {
    title: string;
    points: number;
    type: string;
    passing_score?: number;
    unavailable_at?: string;
  };
  submitted_questions: SubmittedQuestion[];
}

export default function ReviewAnswerScreen() {
  const { assessmentId, submittedAssessmentId, isOffline } = useLocalSearchParams<{
    assessmentId: string;
    submittedAssessmentId?: string;
    isOffline?: string;
  }>();
  const router = useRouter();
  const { netInfo } = useNetworkStatus();
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [canViewAnswers, setCanViewAnswers] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // TODO: Re-enable anti-screenshot when needed
  // useEffect(() => {
  //   const activateScreenshotPrevention = async () => { await ScreenCapture.preventScreenCaptureAsync(); };
  //   const deactivateScreenshotPrevention = async () => { await ScreenCapture.allowScreenCaptureAsync(); };
  //   activateScreenshotPrevention();
  //   const subscription = ScreenCapture.addScreenshotListener(() => {
  //     Alert.alert('Screenshot Not Allowed', 'For security reasons, taking screenshots is not allowed during assessment review. This attempt has been noted.', [{ text: 'OK' }]);
  //   });
  //   return () => { deactivateScreenshotPrevention(); subscription.remove(); };
  // }, []);

  // fetchReviewData useEffect (with canViewAnswers support)
  useEffect(() => {
    const fetchReviewData = async () => {
      setLoading(true); setError(null);
      const user = await getUserData();
      if (!assessmentId || !user?.email) { setError('Required information is missing.'); setLoading(false); return; }
      try {
        let data: ReviewData | null = null;
        if (isOffline === 'true') {
          console.log(`📘 Offline: Fetching review data for assessment ${assessmentId} from local DB.`);
          data = await getAssessmentReviewFromDb(Number(assessmentId), user.email);
          if (!data) setError('Review data for this assessment is not available offline. Please sync online first.');
          // Offline: check if we have correct_answer data cached or if assessment is past due date
          const hasCorrectAnswerData = data?.submitted_questions?.some(q => q.question?.correct_answer);
          const isPastDueDate = data?.assessment?.unavailable_at ? new Date(data.assessment.unavailable_at) < new Date() : false;
          setCanViewAnswers(hasCorrectAnswerData || isPastDueDate);
        } else {
          if (!submittedAssessmentId) { setError('Submission ID is missing for online review.'); setLoading(false); return; }
          console.log(`🧠 Online: Fetching review data for submission ${submittedAssessmentId} from API.`);
          const response = await api.get(`/submitted-assessments/${submittedAssessmentId}`);
          if (response.status === 200 && response.data.submitted_assessment) {
            data = response.data.submitted_assessment;
            // Check both can_view_answers flag and if due date has passed
            const apiCanViewAnswers = response.data.can_view_answers === true;
            const isPastDueDate = data?.assessment?.unavailable_at ? new Date(data.assessment.unavailable_at) < new Date() : false;
            setCanViewAnswers(apiCanViewAnswers || isPastDueDate);
          }
          else setError('Failed to load review data from the server.');
        }
        setReviewData(data);
      } catch (err) { console.error('Failed to load review data:', err); setError('An error occurred while loading the review.'); }
      finally { setLoading(false); }
    };
    fetchReviewData();
  }, [assessmentId, submittedAssessmentId, isOffline]);

  // Loading/Error states (no changes)
  if (loading) return <View style={styles.centerContainer}><ActivityIndicator size="large" color="#007bff" /><Text style={styles.loadingText}>Loading Review...</Text></View>;
  if (error || !reviewData) return <View style={styles.centerContainer}><Ionicons name="alert-circle-outline" size={48} color="#d93025" /><Text style={styles.errorText}>{error || 'Review data not found.'}</Text><TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Text style={styles.backButtonText}>Go Back</Text></TouchableOpacity></View>;

  const totalPoints = Math.round(reviewData.submitted_questions.reduce((sum, q) => sum + (q.max_points || 0), 0));
  const finalScore = reviewData.score !== null ? Math.round(reviewData.score) : null;
  const passingScore = reviewData.assessment.passing_score || null;
  
  // Determine if passed
  let hasPassed: boolean | null = null;
  if (finalScore !== null && passingScore !== null && totalPoints > 0) {
    const scorePercentage = (finalScore / totalPoints) * 100;
    hasPassed = scorePercentage >= passingScore;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollViewContent}>
      <Stack.Screen options={{ title: `${reviewData.assessment.title} - Review` }} />

      {/* Header Card with Pass/Fail Badge */}
      <View style={styles.headerCard}>
        <Text style={styles.quizTitle}>{reviewData.assessment.title}</Text>
        
        {/* Score and Badge Container */}
        <View style={styles.scoreContainer}>
          <Text style={styles.finalScoreText}>
            Final Score: {finalScore !== null ? finalScore : 'N/A'} / {totalPoints}
          </Text>
          
          {/* Passing Badge */}
          {hasPassed !== null && (
            <View style={[styles.passingBadge, hasPassed ? styles.passedBadge : styles.failedBadge]}>
              <Ionicons 
                name={hasPassed ? "checkmark-circle" : "close-circle"} 
                size={isTablet ? 22 : 20} 
                color="#fff" 
              />
              <Text style={styles.passingBadgeText}>
                {hasPassed ? '✓ PASSED' : '✗ FAILED'}
              </Text>
            </View>
          )}
        </View>
        
        {/* Passing Score Info */}
        {passingScore !== null && (
          <Text style={styles.passingScoreInfo}>
            Passing Score: {passingScore}%
          </Text>
        )}
        
        {finalScore !== null && totalPoints > 0 && (
          <Text style={styles.percentageText}>
            Percentage: {Math.round((finalScore / totalPoints) * 100)}%
          </Text>
        )}
        
        <Text style={styles.quizStatus}>Status: {reviewData.status.replace('_', ' ')}</Text>
        {!netInfo?.isInternetReachable && <Text style={styles.offlineStatus}>⚠️ Viewing offline version</Text>}
        
        {/* Message when answers can't be viewed yet */}
        {!canViewAnswers && (
          <View style={styles.answersLockedContainer}>
            <Ionicons name="lock-closed" size={18} color="#B06000" />
            <Text style={styles.answersLockedText}>
              Correct answers will be available after the assessment due date.
            </Text>
          </View>
        )}
      </View>

      {reviewData.submitted_questions.map((question, qIndex) => {
        // Extract part data from nested question.question.part structure (from API)
        // or directly from question if already flattened (from offline DB)
        const partId = question.part_id ?? question.question?.part_id ?? question.question?.part?.id;
        const partTitle = question.part_title ?? question.question?.part?.title;
        const partInstructions = question.part_instructions ?? question.question?.part?.instructions;
        
        // Check if we need to show Part header
        const prevQuestion = qIndex > 0 ? reviewData.submitted_questions[qIndex - 1] : null;
        const prevPartId = prevQuestion?.part_id ?? prevQuestion?.question?.part_id ?? prevQuestion?.question?.part?.id;
        const showPartHeader = partId && (!prevQuestion || prevPartId !== partId);
        
        // Determine correctness based on score
        let isQuestionCorrect: boolean | null;
        if (question.score_earned !== null && question.max_points > 0) isQuestionCorrect = question.score_earned >= question.max_points;
        else isQuestionCorrect = null;
        if (question.question_type === 'essay') isQuestionCorrect = null;

        // Handle both snake_case and camelCase field names from Laravel API
        let optionsToRender = question.submitted_options || question.submittedOptions || [];
        
        // DEBUG: Log question data to diagnose orange highlight issue
        if (qIndex === 0 && (question.question_type === 'multiple_choice' || question.question_type === 'true_false')) {
          console.log('🔍 DEBUG Q1 Data:', {
            question_type: question.question_type,
            correct_answer: question.question?.correct_answer,
            isQuestionCorrect,
            submitted_options_count: optionsToRender.length,
            submitted_options: optionsToRender.map(o => ({
              id: o.id,
              option_text: o.option_text,
              is_selected: o.is_selected,
              is_correct_option: o.is_correct_option,
              question_option_id: o.question_option_id
            })),
            questionOptions: question.question?.questionOptions || question.question?.question_options || [],
          });
        }
        if (question.question_type === 'true_false' && (optionsToRender.length === 0 || optionsToRender.length === 1 || optionsToRender.length === 2 && !optionsToRender.find(o => o.option_text === 'True'))) {
          const submittedAnswerText = question.submitted_answer; let selectedId: number | null = null;
          
          // --- MODIFICATION: Make comparison case-insensitive ---
          if (submittedAnswerText?.toLowerCase() === 'true') {
            selectedId = 1;
          } else if (submittedAnswerText?.toLowerCase() === 'false') {
            selectedId = 2;
          }
          // --- END MODIFICATION ---

          // Determine which option is correct based on original question's correct_answer
          const correctAnswer = question.question?.correct_answer;
          const correctAnswerStr = String(correctAnswer || '').toLowerCase().trim();
          // Correct answer can be "true", "false", "0" (True), or "1" (False)
          const trueIsCorrect = correctAnswerStr === 'true' || correctAnswerStr === '0';
          const falseIsCorrect = correctAnswerStr === 'false' || correctAnswerStr === '1';

          optionsToRender = [
            { id: question.id * 100 + 1, question_option_id: 1, option_text: 'True', is_selected: selectedId === 1, is_correct_option: trueIsCorrect },
            { id: question.id * 100 + 2, question_option_id: 2, option_text: 'False', is_selected: selectedId === 2, is_correct_option: falseIsCorrect }
          ];
        }

        let correctAnswerText: string | null = null;
        const originalQ = question.question; // Shortcut for original question data
        
        // Helper: Get question options from any of the possible field names (Laravel snake_case vs camelCase)
        const getQuestionOptions = () => {
          return originalQ?.questionOptions || originalQ?.question_options || originalQ?.options || [];
        };

        if (originalQ?.correct_answer !== null && originalQ?.correct_answer !== undefined) {
          if (question.question_type === 'identification') {
            correctAnswerText = originalQ.correct_answer;
          } else if (question.question_type === 'true_false') {
            correctAnswerText = originalQ.correct_answer; // Direct text "True" or "False"
          } else if (question.question_type === 'multiple_choice') {
            // Find the option text using the option_order saved in correct_answer
            const correctOptionOrder = originalQ.correct_answer; // This is '0', '1', '2'...
            const allOptions = getQuestionOptions();
            const correctOption = allOptions.find(opt => String(opt.option_order) === String(correctOptionOrder));
            correctAnswerText = correctOption?.option_text || null; // Get the text
          }
        }
        // --- END MODIFIED ---

        return (
          <React.Fragment key={question.id}>
            {/* Part Header */}
            {showPartHeader && partTitle && (
              <View style={styles.partHeader}>
                <Text style={styles.partTitle}>{partTitle}</Text>
                {partInstructions && (
                  <Text style={styles.partInstructions}>{partInstructions}</Text>
                )}
              </View>
            )}
            
            <View style={styles.questionCard}>
              <Text style={styles.questionText}>Q{qIndex + 1}. {question.question_text}</Text>

            {/* Multiple Choice & True/False Options */}
            {(question.question_type === 'multiple_choice' || question.question_type === 'true_false') && (
              <View style={styles.optionsContainer}>
                {(optionsToRender || []).map((option) => {
                  const isSelectedByUser = !!option.is_selected;

                  // Determine if this is the actual correct option using multiple sources
                  const correctOptionValue = originalQ?.correct_answer;
                  let isCorrectOption = false;
                  
                  // Get all question options (handle different field names from Laravel API)
                  const allQuestionOptions = originalQ?.questionOptions || originalQ?.question_options || originalQ?.options || [];

                  // Method 1 (PRIMARY): Use is_correct_option flag from submitted options
                  // This is set correctly by the backend during quiz start
                  // Handle both boolean true and string "true" / number 1
                  if (option.is_correct_option === true || option.is_correct_option === 1 || option.is_correct_option === '1' || option.is_correct_option === 'true') {
                    isCorrectOption = true;
                  }
                  
                  // Method 2 (FALLBACK): For True/False, compare option text with correct_answer
                  // correct_answer can be "True"/"False" text OR "0"/"1" option_order
                  if (!isCorrectOption && question.question_type === 'true_false' && correctOptionValue !== null && correctOptionValue !== undefined) {
                    const correctStr = String(correctOptionValue).toLowerCase().trim();
                    const optionStr = option.option_text.toLowerCase().trim();
                    
                    // Direct text match
                    if (optionStr === correctStr) {
                      isCorrectOption = true;
                    }
                    // Handle numeric option_order (0 = True, 1 = False typically)
                    else if (correctStr === '0' && optionStr === 'true') {
                      isCorrectOption = true;
                    } else if (correctStr === '1' && optionStr === 'false') {
                      isCorrectOption = true;
                    }
                    // Handle "true"/"false" mapping
                    else if (correctStr === 'true' && optionStr === 'true') {
                      isCorrectOption = true;
                    } else if (correctStr === 'false' && optionStr === 'false') {
                      isCorrectOption = true;
                    }
                  }
                  
                  // Method 3 (FALLBACK): For Multiple Choice, match option_order with correct_answer
                  if (!isCorrectOption && question.question_type === 'multiple_choice' && correctOptionValue !== null && correctOptionValue !== undefined) {
                    // Find the original option by question_option_id to get its option_order
                    const matchedOption = allQuestionOptions.find(opt => opt.id === option.question_option_id);
                    if (matchedOption && !isNaN(Number(correctOptionValue))) {
                      isCorrectOption = matchedOption.option_order === Number(correctOptionValue);
                    }
                  }
                  
                  // Method 4 (FALLBACK): Use nested questionOption data if available (loaded by API)
                  // This handles cases where the submitted option has a nested questionOption with option_order
                  if (!isCorrectOption && correctOptionValue !== null && correctOptionValue !== undefined) {
                    const nestedOption = (option as any).questionOption || (option as any).question_option;
                    if (nestedOption && nestedOption.option_order !== undefined) {
                      if (question.question_type === 'multiple_choice' && !isNaN(Number(correctOptionValue))) {
                        isCorrectOption = nestedOption.option_order === Number(correctOptionValue);
                      } else if (question.question_type === 'true_false') {
                        // For T/F, option_order 0 = True, 1 = False
                        const correctStr = String(correctOptionValue).toLowerCase().trim();
                        if ((correctStr === '0' || correctStr === 'true') && nestedOption.option_order === 0) {
                          isCorrectOption = true;
                        } else if ((correctStr === '1' || correctStr === 'false') && nestedOption.option_order === 1) {
                          isCorrectOption = true;
                        }
                      }
                    }
                  }
                  
                  // Method 5 (LAST RESORT): Find correct option by option_order from original questionOptions
                  // This compares the current option's text with the option that has the correct option_order
                  if (!isCorrectOption && question.question_type === 'multiple_choice' && correctOptionValue !== null && correctOptionValue !== undefined && allQuestionOptions.length > 0) {
                    // Find the option with the correct option_order
                    const correctOption = allQuestionOptions.find(opt => 
                      opt.option_order === Number(correctOptionValue) || 
                      String(opt.option_order) === String(correctOptionValue)
                    );
                    // Check if current option's text matches the correct option's text
                    if (correctOption && option.option_text.toLowerCase().trim() === correctOption.option_text.toLowerCase().trim()) {
                      isCorrectOption = true;
                    }
                  }

                  // DEBUG: Log detection result for Q1 options
                  if (qIndex === 0 && !isSelectedByUser) {
                    console.log(`🟠 Q1 Option "${option.option_text}" detection:`, {
                      is_correct_option_raw: option.is_correct_option,
                      isCorrectOption_result: isCorrectOption,
                      correctOptionValue,
                      canViewAnswers,
                      isQuestionCorrect,
                      shouldShowMissedCorrect: canViewAnswers && isCorrectOption && !isSelectedByUser && isQuestionCorrect === false
                    });
                  }

                  // Determine styling - ALWAYS show correct answer when canViewAnswers is true
                  const shouldShowGreen = isSelectedByUser && isQuestionCorrect === true;
                  const shouldShowRed = isSelectedByUser && isQuestionCorrect === false;
                  // Show the correct answer (orange) when user got it wrong AND this is the correct option
                  const shouldShowMissedCorrect = canViewAnswers && isCorrectOption && !isSelectedByUser && isQuestionCorrect === false;

                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.optionButton,
                        shouldShowGreen && styles.correctOption,
                        shouldShowRed && styles.incorrectOption,
                        shouldShowMissedCorrect && styles.missedCorrectOption,
                      ]}
                      disabled
                    >
                      <View style={[styles.radioCircle, shouldShowMissedCorrect && styles.missedCorrectRadio]}>
                        {isSelectedByUser && <View style={styles.radioChecked} />}
                        {shouldShowMissedCorrect && !isSelectedByUser && <Ionicons name="checkmark" size={14} color="#f97316" />}
                      </View>
                      <Text style={[styles.optionText, shouldShowMissedCorrect && styles.missedCorrectText]}>{option.option_text}</Text>
                      {shouldShowGreen && <Ionicons name="checkmark-circle" size={22} color="#137333" style={styles.correctnessIcon} />}
                      {shouldShowRed && <Ionicons name="close-circle" size={22} color="#d93025" style={styles.correctnessIcon} />}
                      {shouldShowMissedCorrect && <Text style={styles.correctAnswerBadge}>Correct Answer</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Identification & Essay Answer Display */}
            {['identification', 'essay'].includes(question.question_type) && (
              <View style={styles.answerContainer}>
                <Text style={styles.answerLabel}>Your Answer:</Text>
                <Text style={[styles.answerText,
                  isQuestionCorrect === false && question.question_type === 'identification' && styles.incorrectAnswerText,
                  isQuestionCorrect === true && question.question_type === 'identification' && styles.correctAnswerBox
                ]}>
                  {question.submitted_answer || '(No answer provided)'}
                </Text>
                {/* Show correct answer for identification when wrong */}
                {canViewAnswers && question.question_type === 'identification' && isQuestionCorrect === false && correctAnswerText && (
                  <View style={styles.correctAnswerContainer}>
                    <Text style={styles.correctAnswerLabel}>✓ Correct Answer:</Text>
                    <Text style={styles.correctAnswerText}>{correctAnswerText}</Text>
                  </View>
                )}
                {question.question_type === 'essay' && (
                  <View style={styles.essayNoteContainer}>
                    <Ionicons name="information-circle-outline" size={18} color="#00579b" />
                    <Text style={styles.essayNoteText}>Note: This question is for manual checking by your instructor.</Text>
                  </View>
                )}
              </View>
            )}

            {/* Enumeration Answer Display */}
            {question.question_type === 'enumeration' && (() => {
              // Get enumeration data from original question or submitted question (for offline compatibility)
              const enumerationAnswers = originalQ?.enumeration_answers || question.enumeration_answers || [];
              const isOrderSensitive = originalQ?.is_order_sensitive ?? question.is_order_sensitive ?? false;
              const submittedAnswers = question.submitted_answers || [];
              
              // Check if any answer is wrong (to decide whether to show correct answers)
              const hasWrongAnswer = submittedAnswers.some((answer, idx) => {
                if (!answer) return true; // Empty answer is wrong
                const answerLower = answer.toLowerCase().trim();
                if (isOrderSensitive) {
                  return answerLower !== enumerationAnswers[idx]?.toLowerCase().trim();
                } else {
                  return !enumerationAnswers.some(correctAns => correctAns.toLowerCase().trim() === answerLower);
                }
              }) || submittedAnswers.length < enumerationAnswers.length; // Also wrong if missing answers
              
              return (
                <View style={styles.enumerationReviewContainer}>
                  <View style={styles.enumerationHeader}>
                    <Text style={styles.answerLabel}>Your Answers</Text>
                    {isOrderSensitive && (
                      <Text style={styles.orderHint}>(Order matters)</Text>
                    )}
                  </View>
                  {submittedAnswers.map((answer, idx) => {
                    const isCorrect = isOrderSensitive
                      ? answer?.toLowerCase().trim() === enumerationAnswers[idx]?.toLowerCase().trim()
                      : enumerationAnswers.some(correctAns => correctAns.toLowerCase().trim() === answer?.toLowerCase().trim());
                    
                    return (
                      <View key={idx} style={styles.enumerationAnswerRow}>
                        <View style={styles.answerNumberBadge}>
                          <Text style={styles.answerNumber}>{idx + 1}</Text>
                        </View>
                        <View style={styles.enumerationAnswerBox}>
                          <Text style={[styles.answerText, isCorrect && styles.correctAnswerBox, !isCorrect && styles.incorrectAnswerText]}>
                            {answer || '(No answer)'}
                          </Text>
                        </View>
                        {canViewAnswers && isCorrect && <Ionicons name="checkmark-circle" size={22} color="#137333" style={styles.correctnessIcon} />}
                        {canViewAnswers && !isCorrect && <Ionicons name="close-circle" size={22} color="#d93025" style={styles.correctnessIcon} />}
                      </View>
                    );
                  })}
                  {/* Show correct answers in orange when canViewAnswers is true AND there's at least one wrong answer */}
                  {canViewAnswers && hasWrongAnswer && enumerationAnswers.length > 0 && (
                    <View style={styles.correctAnswerContainer}>
                      <Text style={styles.correctAnswerLabel}>✓ Correct Answers:</Text>
                      {enumerationAnswers.map((answer, idx) => (
                        <Text key={idx} style={styles.correctAnswerText}>{idx + 1}. {answer}</Text>
                      ))}
                    </View>
                  )}
                </View>
              );
            })()}

            {/*
              <View style={styles.correctAnswerContainer}>
                <Text style={styles.correctAnswerLabel}>Correct Answer:</Text>
                <Text style={styles.correctAnswerText}>{correctAnswerText}</Text>
              </View>
            )} */}


            {/* Score Display */}
            <View style={styles.pointsContainer}>
              {question.question_type === 'essay' ? (
                <Text style={[styles.scoreText, styles.pendingScore]}>Score: Pending Review ({Math.round(question.max_points)} pts possible)</Text>
              ) : (
                <Text style={[ styles.scoreText, isQuestionCorrect === true ? styles.correctScore : (isQuestionCorrect === false ? styles.incorrectScore : null) ]}>
                  Score: {question.score_earned !== null ? Math.round(question.score_earned) : 'N/A'} / {Math.round(question.max_points)}
                  {isQuestionCorrect === true && ' ✓'}
                  {isQuestionCorrect === false && ' ✗'}
                </Text>
              )}
            </View>
          </View>
        </React.Fragment>
        );
      })}

      {/* Back Button (no changes) */}
      <TouchableOpacity onPress={() => router.replace(`/courses/assessments/${assessmentId}`)} style={styles.backButton}>
        <Text style={styles.backButtonText}>Back to Assessment</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// Responsive Styles
const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f8f9fa',
    alignItems: isTablet ? 'center' : 'stretch',
  },
  scrollViewContent: { 
    padding: isTablet ? 24 : 16, 
    paddingBottom: 32,
    width: isTablet ? contentMaxWidth : '100%',
    alignSelf: 'center',
  },
  centerContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: isTablet ? 32 : 24 
  },
  loadingText: { 
    marginTop: 12, 
    fontSize: isTablet ? 18 : 16, 
    color: '#5f6368' 
  },
  errorText: { 
    fontSize: isTablet ? 18 : 16, 
    color: '#d93025', 
    textAlign: 'center', 
    marginBottom: 16 
  },
  headerCard: { 
    backgroundColor: '#fff', 
    borderRadius: isTablet ? 12 : 8, 
    padding: isTablet ? 28 : 20, 
    marginBottom: isTablet ? 24 : 16, 
    borderWidth: 1, 
    borderColor: '#e0e0e0' 
  },
  quizTitle: { 
    fontSize: isTablet ? 28 : 24, 
    fontWeight: '600', 
    color: '#202124', 
    marginBottom: isTablet ? 16 : 12 
  },
  scoreContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 12,
  },
  finalScoreText: { 
    fontSize: isTablet ? 22 : 20, 
    color: '#1967d2', 
    fontWeight: '700', 
  },
  passingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: isTablet ? 16 : 12,
    paddingVertical: isTablet ? 8 : 6,
    borderRadius: 20,
    gap: 6,
  },
  passedBadge: { backgroundColor: '#137333' },
  failedBadge: { backgroundColor: '#d93025' },
  passingBadgeText: { 
    color: '#fff', 
    fontSize: isTablet ? 16 : 14, 
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  passingScoreInfo: { 
    fontSize: isTablet ? 15 : 14, 
    color: '#5f6368', 
    marginBottom: 4,
    fontWeight: '500',
  },
  percentageText: { 
    fontSize: isTablet ? 16 : 15, 
    color: '#202124', 
    marginBottom: 8,
    fontWeight: '600',
  },
  quizStatus: { 
    fontSize: isTablet ? 16 : 14, 
    color: '#5f6368', 
    textTransform: 'capitalize' 
  },
  offlineStatus: { 
    fontSize: isTablet ? 16 : 14, 
    color: '#e37400', 
    marginTop: 6, 
    fontWeight: '600' 
  },
  answersLockedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: isTablet ? 16 : 12,
    padding: isTablet ? 16 : 12,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#F57C00',
    gap: 8,
  },
  answersLockedText: {
    flex: 1,
    fontSize: isTablet ? 14 : 13,
    color: '#B06000',
    lineHeight: isTablet ? 22 : 18,
  },
  partHeader: { 
    backgroundColor: '#1967d2', 
    borderRadius: isTablet ? 12 : 8, 
    padding: isTablet ? 20 : 16, 
    marginBottom: isTablet ? 20 : 16, 
    marginTop: isTablet ? 12 : 8,
  },
  partTitle: { 
    fontSize: isTablet ? 20 : 18, 
    fontWeight: '700', 
    color: '#fff',
    marginBottom: 4,
  },
  partInstructions: { 
    fontSize: isTablet ? 15 : 14, 
    color: '#e8f0fe',
    lineHeight: isTablet ? 24 : 20,
    marginTop: 4,
  },
  questionCard: { 
    backgroundColor: '#fff', 
    borderRadius: isTablet ? 12 : 8, 
    padding: isTablet ? 24 : 16, 
    marginBottom: isTablet ? 20 : 16, 
    borderWidth: 1, 
    borderColor: '#e0e0e0' 
  },
  questionText: { 
    fontSize: isTablet ? 18 : 16, 
    fontWeight: '500', 
    color: '#202124', 
    lineHeight: isTablet ? 28 : 24, 
    marginBottom: isTablet ? 20 : 16 
  },
  optionsContainer: { gap: isTablet ? 12 : 8 },
  optionButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: isTablet ? 16 : 12, 
    marginBottom: isTablet ? 10 : 8, 
    backgroundColor: '#f8f9fa', 
    borderRadius: isTablet ? 10 : 8, 
    borderWidth: 1.5, 
    borderColor: '#e0e0e0' 
  },
  correctOption: { borderColor: '#137333', backgroundColor: '#e6f4ea' },
  incorrectOption: { borderColor: '#d93025', backgroundColor: '#fce8e6' },
  missedCorrectOption: { 
    borderColor: '#f97316', 
    backgroundColor: '#ffedd5', 
    borderWidth: 2,
  },
  missedCorrectRadio: {
    borderColor: '#f97316',
    backgroundColor: '#ffedd5',
  },
  missedCorrectText: {
    color: '#ea580c',
    fontWeight: '600',
  },
  correctAnswerBadge: {
    fontSize: isTablet ? 12 : 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#f97316',
    paddingHorizontal: isTablet ? 10 : 8,
    paddingVertical: isTablet ? 5 : 4,
    borderRadius: 12,
    marginLeft: 8,
    overflow: 'hidden',
  },
  optionText: { 
    flex: 1, 
    fontSize: isTablet ? 17 : 15, 
    color: '#202124', 
    lineHeight: isTablet ? 26 : 22 
  },
  correctnessIcon: { marginLeft: 'auto', paddingLeft: isTablet ? 14 : 10 },
  radioCircle: { 
    width: isTablet ? 24 : 20, 
    height: isTablet ? 24 : 20, 
    borderRadius: isTablet ? 12 : 10, 
    borderWidth: 2, 
    borderColor: '#5f6368', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginRight: isTablet ? 16 : 12 
  },
  radioChecked: { 
    width: isTablet ? 12 : 10, 
    height: isTablet ? 12 : 10, 
    borderRadius: isTablet ? 6 : 5, 
    backgroundColor: '#1967d2' 
  },
  checkboxSquare: { 
    width: isTablet ? 24 : 20, 
    height: isTablet ? 24 : 20, 
    borderRadius: 4, 
    borderWidth: 2, 
    borderColor: '#5f6368', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginRight: isTablet ? 16 : 12 
  },
  checkboxCheck: { color: '#1967d2', fontSize: isTablet ? 16 : 14, fontWeight: 'bold' },
  answerContainer: { marginTop: isTablet ? 12 : 8, gap: isTablet ? 10 : 8 },
  answerLabel: { fontSize: isTablet ? 15 : 13, color: '#5f6368', fontWeight: 'bold' },
  answerText: { 
    fontSize: isTablet ? 17 : 15, 
    color: '#202124', 
    padding: isTablet ? 14 : 10, 
    backgroundColor: '#f1f3f4', 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: '#e0e0e0' 
  },
  incorrectAnswerText: { borderColor: '#d93025', backgroundColor: '#fce8e6' },
  correctAnswerBox: { borderColor: '#137333', backgroundColor: '#e6f4ea' },
  correctAnswerContainer: { 
    marginTop: isTablet ? 16 : 12, 
    padding: isTablet ? 14 : 10, 
    backgroundColor: '#ffedd5', 
    borderRadius: 8, 
    borderLeftWidth: 4, 
    borderLeftColor: '#f97316',
  },
  correctAnswerLabel: { fontSize: isTablet ? 15 : 13, fontWeight: 'bold', color: '#ea580c' },
  correctAnswerText: { fontSize: isTablet ? 17 : 15, color: '#c2410c' },
  essayNoteContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginTop: isTablet ? 16 : 12, 
    padding: isTablet ? 14 : 10, 
    backgroundColor: '#e8f0fe', 
    borderRadius: 8, 
    borderLeftWidth: 4, 
    borderLeftColor: '#1967d2' 
  },
  essayNoteText: { 
    flex: 1, 
    fontSize: isTablet ? 15 : 13, 
    color: '#00579b', 
    marginLeft: 8, 
    lineHeight: isTablet ? 22 : 18 
  },
  pointsContainer: { alignItems: 'flex-end', marginTop: isTablet ? 16 : 12 },
  scoreText: { fontSize: isTablet ? 16 : 14, fontWeight: '600' },
  correctScore: { color: '#137333' },
  incorrectScore: { color: '#d93025' },
  pendingScore: { color: '#00579b', fontStyle: 'italic' },
  backButton: { 
    backgroundColor: '#1967d2', 
    paddingVertical: isTablet ? 18 : 14, 
    borderRadius: isTablet ? 10 : 8, 
    alignItems: 'center', 
    marginTop: isTablet ? 24 : 16 
  },
  backButtonText: { 
    color: '#fff', 
    fontSize: isTablet ? 18 : 16, 
    fontWeight: '600' 
  },
  // Enumeration styles
  enumerationReviewContainer: {
    marginTop: isTablet ? 12 : 8,
  },
  enumerationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: isTablet ? 12 : 8,
    gap: 8,
  },
  orderHint: {
    fontSize: isTablet ? 13 : 12,
    fontWeight: '400',
    color: '#6366F1',
    fontStyle: 'italic',
  },
  enumerationAnswerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: isTablet ? 14 : 10,
    gap: isTablet ? 16 : 12,
  },
  answerNumberBadge: {
    width: isTablet ? 36 : 32,
    height: isTablet ? 36 : 32,
    borderRadius: isTablet ? 18 : 16,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  answerNumber: {
    fontSize: isTablet ? 16 : 14,
    fontWeight: 'bold',
    color: '#6366F1',
  },
  enumerationAnswerBox: {
    flex: 1,
  },
});