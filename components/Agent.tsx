"use client";

import Image from "next/image";
import { useState, useEffect, useCallback, useRef, useMemo, useReducer } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as faceapi from 'face-api.js';

import { cn } from "@/lib/utils";
import { conversationHandler } from "@/lib/services/conversation_handler";
import { interviewer } from "@/constants";
import { clientFeedbackGenerator } from "@/lib/services/client_feedback_generator";
import { CallStatus, ConversationMessage, Message, VoiceChangeResult } from "../types/conversation";

interface SavedMessage {
  role: "user" | "system" | "assistant";
  content: string;
}

// Warning levels for inappropriate behavior
enum WarningLevel {
  NONE = 0,
  FIRST = 1,
  SECOND = 2,
  TERMINATED = 3
}

// 🚀 PERFORMANCE OPTIMIZATION: State reducer to minimize re-renders
interface AgentState {
  callStatus: CallStatus;
  messages: SavedMessage[];
  isSpeaking: boolean;
  lastMessage: string;
  isRecording: boolean;
  isTranscribing: boolean;
  isGenerating: boolean;
  warningLevel: WarningLevel;
  isGeneratingFeedback: boolean;
}

type AgentAction = 
  | { type: 'SET_CALL_STATUS'; payload: CallStatus }
  | { type: 'ADD_MESSAGE'; payload: SavedMessage }
  | { type: 'SET_SPEAKING'; payload: boolean }
  | { type: 'SET_RECORDING'; payload: boolean }
  | { type: 'SET_TRANSCRIBING'; payload: boolean }
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'INCREMENT_WARNING' }
  | { type: 'RESET_WARNING' }
  | { type: 'SET_GENERATING_FEEDBACK'; payload: boolean }
  | { type: 'RESET_ALL' };

function agentReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case 'SET_CALL_STATUS':
      return { ...state, callStatus: action.payload };
    case 'ADD_MESSAGE':
      const newMessages = [...state.messages, action.payload];
      return { 
        ...state, 
        messages: newMessages,
        lastMessage: action.payload.content
      };
    case 'SET_SPEAKING':
      return { ...state, isSpeaking: action.payload };
    case 'SET_RECORDING':
      return { ...state, isRecording: action.payload };
    case 'SET_TRANSCRIBING':
      return { ...state, isTranscribing: action.payload };
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.payload };
    case 'INCREMENT_WARNING':
      return { ...state, warningLevel: state.warningLevel + 1 };
    case 'RESET_WARNING':
      return { ...state, warningLevel: WarningLevel.NONE };
    case 'SET_GENERATING_FEEDBACK':
      return { ...state, isGeneratingFeedback: action.payload };
    case 'RESET_ALL':
      return {
        callStatus: CallStatus.INACTIVE,
        messages: [],
        isSpeaking: false,
        lastMessage: "",
        isRecording: false,
        isTranscribing: false,
        isGenerating: false,
        warningLevel: WarningLevel.NONE,
        isGeneratingFeedback: false
      };
    default:
      return state;
  }
}

const Agent = ({
  userName,
  userId,
  interviewId,
  feedbackId,
  type,
  questions,
}: AgentProps) => {
  const router = useRouter();
  
  // 🚀 PERFORMANCE OPTIMIZATION: Use useReducer to minimize re-renders
  const [state, dispatch] = useReducer(agentReducer, {
    callStatus: CallStatus.INACTIVE,
    messages: [],
    isSpeaking: false,
    lastMessage: "",
    isRecording: false,
    isTranscribing: false,
    isGenerating: false,
    warningLevel: WarningLevel.NONE,
    isGeneratingFeedback: false
  });
  
  // Camera state
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [videoElementReady, setVideoElementReady] = useState(false);
  
  // Face detection state
  const [faceApiLoaded, setFaceApiLoaded] = useState(false);
  const [faceCount, setFaceCount] = useState(0);
  const [isFaceDetected, setIsFaceDetected] = useState(true);
  const [faceDetectionRunning, setFaceDetectionRunning] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const keydownRef = useRef<boolean>(false);

  // Camera functionality
  const startCamera = useCallback(async () => {
    console.log('🎥 === CAMERA START PROCESS BEGIN ===');
    console.log('🎥 Current state - Loading:', cameraLoading, 'Stream exists:', !!cameraStream);
    
    if (cameraLoading || cameraStream) {
      console.log('🎥 ABORT: Camera already loading or stream exists');
      return; // Prevent multiple calls
    }
    
    // Clear any existing timeout
    if (cameraTimeoutRef.current) {
      console.log('🎥 Clearing existing timeout');
      clearTimeout(cameraTimeoutRef.current);
      cameraTimeoutRef.current = null;
    }
    
    console.log('🎥 Setting loading state to true');
    setCameraLoading(true);
    setCameraError(null);
    setPermissionDenied(false);
    
    try {
      // Check if browser supports getUserMedia
      console.log('🎥 Checking browser support...');
      console.log('🎥 navigator.mediaDevices:', !!navigator.mediaDevices);
      console.log('🎥 getUserMedia:', !!navigator.mediaDevices?.getUserMedia);
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported by browser');
      }

      console.log('🎥 Requesting camera access with constraints...');
      const constraints = { 
        video: { 
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          facingMode: 'user'
        },
        audio: false 
      };
      console.log('🎥 Constraints:', constraints);

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      console.log('🎥 ✅ Camera stream obtained!');
      console.log('🎥 Stream details:', {
        id: stream.id,
        active: stream.active,
        tracks: stream.getTracks().length,
        videoTracks: stream.getVideoTracks().length,
      });
      
      // Log each track details
      stream.getTracks().forEach((track, index) => {
        console.log(`🎥 Track ${index}:`, {
          kind: track.kind,
          label: track.label,
          enabled: track.enabled,
          readyState: track.readyState,
          settings: track.getSettings?.()
        });
      });
      
      setCameraStream(stream);
      setCameraError(null);
      console.log('🎥 Stream set in state');
      
      if (videoRef.current) {
        console.log('🎥 Video element found, setting up...');
        console.log('🎥 Video element before setup:', {
          readyState: videoRef.current.readyState,
          videoWidth: videoRef.current.videoWidth,
          videoHeight: videoRef.current.videoHeight,
          currentTime: videoRef.current.currentTime,
          duration: videoRef.current.duration,
          paused: videoRef.current.paused,
        });
        
        // Clear any existing event listeners
        videoRef.current.onloadedmetadata = null;
        videoRef.current.onerror = null;
        videoRef.current.oncanplay = null;
        videoRef.current.onloadstart = null;
        videoRef.current.onloadeddata = null;
        
        console.log('🎥 Setting srcObject...');
        videoRef.current.srcObject = stream;
        
        // Add event listeners for video
        videoRef.current.onloadedmetadata = () => {
          console.log('🎥 📊 onloadedmetadata triggered');
          if (videoRef.current) {
            console.log('🎥 Video metadata:', {
              videoWidth: videoRef.current.videoWidth,
              videoHeight: videoRef.current.videoHeight,
              duration: videoRef.current.duration,
              readyState: videoRef.current.readyState,
            });
            console.log('🎥 Attempting to play...');
            videoRef.current.play().then(() => {
              console.log('🎥 ✅ Video play() succeeded');
            }).catch((playError) => {
              console.error('🎥 ❌ Video play() failed:', playError);
              // Try to play again after a short delay
              setTimeout(() => {
                if (videoRef.current) {
                  console.log('🎥 Retrying play...');
                  videoRef.current.play().catch(console.error);
                }
              }, 100);
            });
          }
        };
        
        videoRef.current.onerror = (error) => {
          console.error('🎥 ❌ Video element error:', error);
          console.error('🎥 Video error details:', {
            error: videoRef.current?.error,
            networkState: videoRef.current?.networkState,
            readyState: videoRef.current?.readyState,
          });
          setCameraError('Video display failed');
        };
        
        // Add additional event listeners for debugging
        videoRef.current.oncanplay = () => {
          console.log('🎥 📊 oncanplay - Video can play, forcing play');
          if (videoRef.current) {
            console.log('🎥 Video state on canplay:', {
              readyState: videoRef.current.readyState,
              currentTime: videoRef.current.currentTime,
              paused: videoRef.current.paused,
            });
          }
          videoRef.current?.play().catch(console.error);
        };
        
        videoRef.current.onloadstart = () => {
          console.log('🎥 📊 onloadstart - Video load started');
        };
        
        videoRef.current.onloadeddata = () => {
          console.log('🎥 📊 onloadeddata - Video data loaded');
          if (videoRef.current) {
            console.log('🎥 Video state on loadeddata:', {
              readyState: videoRef.current.readyState,
              currentTime: videoRef.current.currentTime,
              videoWidth: videoRef.current.videoWidth,
              videoHeight: videoRef.current.videoHeight,
            });
          }
        };
        
        videoRef.current.oncanplaythrough = () => {
          console.log('🎥 📊 oncanplaythrough - Video can play through');
        };
        
        videoRef.current.onplay = () => {
          console.log('🎥 📊 onplay - Video started playing');
        };
        
        videoRef.current.onplaying = () => {
          console.log('🎥 📊 onplaying - Video is playing');
        };
        
        videoRef.current.onwaiting = () => {
          console.log('🎥 📊 onwaiting - Video is waiting for data');
        };
        
        videoRef.current.onstalled = () => {
          console.log('🎥 📊 onstalled - Video stalled');
        };
        
        videoRef.current.onsuspend = () => {
          console.log('🎥 📊 onsuspend - Video suspended');
        };
        
        videoRef.current.onabort = () => {
          console.log('🎥 📊 onabort - Video aborted');
        };
        
        videoRef.current.onemptied = () => {
          console.log('🎥 📊 onemptied - Video emptied');
        };
        
        // Force immediate play attempt
        setTimeout(() => {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            console.log('🎥 Force playing video after timeout, readyState:', videoRef.current.readyState);
            videoRef.current.play().catch(console.error);
          } else {
            console.log('🎥 Cannot force play, readyState:', videoRef.current?.readyState);
          }
        }, 100);
        
        // Additional timeout to check progress
        setTimeout(() => {
          if (videoRef.current) {
            console.log('🎥 Video status after 500ms:', {
              readyState: videoRef.current.readyState,
              currentTime: videoRef.current.currentTime,
              paused: videoRef.current.paused,
              videoWidth: videoRef.current.videoWidth,
              videoHeight: videoRef.current.videoHeight,
              networkState: videoRef.current.networkState,
            });
          }
        }, 500);
        
        // Force load the video
        console.log('🎥 Calling video.load()...');
        videoRef.current.load();
        
        console.log('🎥 Video element setup complete');
      } else {
        console.log('🎥 ❌ No video element found!');
      }
    } catch (error: any) {
      console.error('🎥 ❌ Camera access failed:', error);
      console.error('🎥 Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        console.log('🎥 Permission denied detected');
        setCameraError('Camera access denied. Please allow camera access and refresh the page.');
        setPermissionDenied(true);
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        console.log('🎥 No camera found');
        setCameraError('No camera found on this device');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        console.log('🎥 Camera in use by another app');
        setCameraError('Camera is being used by another application');
      } else {
        console.log('🎥 Unknown camera error');
        setCameraError(`Camera error: ${error.message || 'Unknown error'}`);
      }
      
      setCameraStream(null);
    } finally {
      console.log('🎥 Setting loading state to false');
      setCameraLoading(false);
      console.log('🎥 === CAMERA START PROCESS END ===');
    }
  }, [cameraLoading, cameraStream]);

  const stopCamera = useCallback(() => {
    console.log('🎥 === CAMERA STOP PROCESS BEGIN ===');
    
    // Clear any pending camera start
    if (cameraTimeoutRef.current) {
      console.log('🎥 Clearing timeout ref');
      clearTimeout(cameraTimeoutRef.current);
      cameraTimeoutRef.current = null;
    }
    
    if (cameraStream) {
      console.log('🎥 Stopping camera stream with', cameraStream.getTracks().length, 'tracks');
      // Stop all tracks to free up the camera
      cameraStream.getTracks().forEach((track, index) => {
        console.log(`🎥 Stopping track ${index}:`, track.kind, track.readyState);
        track.stop();
      });
      setCameraStream(null);
      console.log('🎥 Camera stream cleared from state');
    } else {
      console.log('🎥 No camera stream to stop');
    }
    
    if (videoRef.current) {
      console.log('🎥 Cleaning up video element');
      videoRef.current.srcObject = null;
      videoRef.current.onloadedmetadata = null;
      videoRef.current.onerror = null;
      console.log('🎥 Video element cleared');
    } else {
      console.log('🎥 No video element to clean up');
    }
    
    setCameraError(null);
    setCameraLoading(false);
    console.log('🎥 === CAMERA STOP PROCESS END ===');
  }, [cameraStream]);

  // Add camera refresh function
  const refreshCamera = useCallback(async () => {
    console.log('🔄 === CAMERA REFRESH PROCESS BEGIN ===');
    setCameraLoading(true);
    
    // Stop current stream completely
    if (cameraStream) {
      console.log('🔄 Stopping existing stream for refresh');
      cameraStream.getTracks().forEach(track => {
        console.log('🔄 Stopping track for refresh:', track.kind);
        track.stop();
      });
      setCameraStream(null);
    }
    
    // Clear video element completely
    if (videoRef.current) {
      console.log('🔄 Completely resetting video element');
      console.log('🔄 Video state before reset:', {
        readyState: videoRef.current.readyState,
        currentTime: videoRef.current.currentTime,
        paused: videoRef.current.paused,
        networkState: videoRef.current.networkState,
      });
      
      videoRef.current.srcObject = null;
      videoRef.current.onloadedmetadata = null;
      videoRef.current.onerror = null;
      videoRef.current.oncanplay = null;
      videoRef.current.onloadstart = null;
      videoRef.current.onloadeddata = null;
      videoRef.current.load(); // Reset video element
      
      console.log('🔄 Video element reset complete');
    }
    
    setCameraError(null);
    
    // Wait a bit before restarting to ensure cleanup
    console.log('🔄 Waiting 1 second before restart...');
    setTimeout(() => {
      console.log('🔄 Starting camera after refresh delay');
      setCameraLoading(false);
      startCamera();
    }, 1000);
    console.log('🔄 === CAMERA REFRESH PROCESS END ===');
  }, [cameraStream, startCamera]);

  // Face API initialization
  const loadFaceApiModels = useCallback(async () => {
    console.log('👤 === FACE API INITIALIZATION ===');
    try {
      console.log('👤 Loading face-api.js models...');
      
      // Load models from the public folder
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        faceapi.nets.faceExpressionNet.loadFromUri('/models'),
      ]);
      
      console.log('👤 ✅ Face-api.js models loaded successfully');
      setFaceApiLoaded(true);
    } catch (error) {
      console.error('👤 ❌ Failed to load face-api.js models:', error);
      // Continue without face detection if models fail to load
      setFaceApiLoaded(false);
    }
  }, []);

  // Face detection function
  const detectFaces = useCallback(async () => {
    if (!faceApiLoaded || !videoRef.current || !cameraStream || faceDetectionRunning) {
      return;
    }

    try {
      setFaceDetectionRunning(true);
      
      const detections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceExpressions();

      const faceCount = detections.length;
      console.log('👤 Face detection result:', {
        facesDetected: faceCount,
        timestamp: new Date().toISOString()
      });

      setFaceCount(faceCount);
      setIsFaceDetected(faceCount === 1);

      // Optional: Draw detection results on canvas for debugging
      if (canvasRef.current && process.env.NODE_ENV === 'development') {
        const displaySize = {
          width: videoRef.current.videoWidth,
          height: videoRef.current.videoHeight
        };
        
        faceapi.matchDimensions(canvasRef.current, displaySize);
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          faceapi.draw.drawDetections(canvas, resizedDetections);
          faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
        }
      }

    } catch (error) {
      console.error('👤 Face detection error:', error);
    } finally {
      setFaceDetectionRunning(false);
    }
  }, [faceApiLoaded, cameraStream, faceDetectionRunning]);

  // Start face detection interval
  const startFaceDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    
    console.log('👤 Starting face detection interval');
    detectionIntervalRef.current = setInterval(detectFaces, 1000); // Detect every 1 second
  }, [detectFaces]);

  // Stop face detection interval
  const stopFaceDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      console.log('👤 Stopping face detection interval');
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  }, []);

  // NEW: Effect to assign stream to video element when both exist
  useEffect(() => {
    console.log('🔗 === STREAM ASSIGNMENT EFFECT ===');
    console.log('🔗 Checking - Stream:', !!cameraStream, 'Video element ready:', videoElementReady);
    
    if (cameraStream && videoElementReady && videoRef.current && !videoRef.current.srcObject) {
      console.log('🔗 Both stream and video element exist, assigning stream...');
      console.log('🔗 Video element before assignment:', {
        readyState: videoRef.current.readyState,
        videoWidth: videoRef.current.videoWidth,
        videoHeight: videoRef.current.videoHeight,
        currentTime: videoRef.current.currentTime,
        duration: videoRef.current.duration,
        paused: videoRef.current.paused,
      });
      
      // Clear any existing event listeners
      videoRef.current.onloadedmetadata = null;
      videoRef.current.onerror = null;
      videoRef.current.oncanplay = null;
      videoRef.current.onloadstart = null;
      videoRef.current.onloadeddata = null;
      
      console.log('🔗 Setting srcObject...');
      videoRef.current.srcObject = cameraStream;
      
      // Add event listeners for video
      videoRef.current.onloadedmetadata = () => {
        console.log('🔗 📊 onloadedmetadata triggered from assignment effect');
        if (videoRef.current) {
          console.log('🔗 Video metadata:', {
            videoWidth: videoRef.current.videoWidth,
            videoHeight: videoRef.current.videoHeight,
            duration: videoRef.current.duration,
            readyState: videoRef.current.readyState,
          });
          console.log('🔗 Attempting to play...');
          videoRef.current.play().then(() => {
            console.log('🔗 ✅ Video play() succeeded from assignment effect');
          }).catch((playError) => {
            console.error('🔗 ❌ Video play() failed from assignment effect:', playError);
            // Try to play again after a short delay
            setTimeout(() => {
              if (videoRef.current) {
                console.log('🔗 Retrying play from assignment effect...');
                videoRef.current.play().catch(console.error);
              }
            }, 100);
          });
        }
      };
      
      videoRef.current.onerror = (error) => {
        console.error('🔗 ❌ Video element error from assignment effect:', error);
        console.error('🔗 Video error details:', {
          error: videoRef.current?.error,
          networkState: videoRef.current?.networkState,
          readyState: videoRef.current?.readyState,
        });
        setCameraError('Video display failed');
      };
      
      // Add additional event listeners for debugging
      videoRef.current.oncanplay = () => {
        console.log('🔗 📊 oncanplay from assignment effect - Video can play, forcing play');
        if (videoRef.current) {
          console.log('🔗 Video state on canplay:', {
            readyState: videoRef.current.readyState,
            currentTime: videoRef.current.currentTime,
            paused: videoRef.current.paused,
          });
        }
        videoRef.current?.play().catch(console.error);
      };
      
      videoRef.current.onloadstart = () => {
        console.log('🔗 📊 onloadstart from assignment effect - Video load started');
      };
      
      videoRef.current.onloadeddata = () => {
        console.log('🔗 📊 onloadeddata from assignment effect - Video data loaded');
        if (videoRef.current) {
          console.log('🔗 Video state on loadeddata:', {
            readyState: videoRef.current.readyState,
            currentTime: videoRef.current.currentTime,
            videoWidth: videoRef.current.videoWidth,
            videoHeight: videoRef.current.videoHeight,
          });
        }
      };
      
      videoRef.current.oncanplaythrough = () => {
        console.log('🔗 📊 oncanplaythrough from assignment effect - Video can play through');
      };
      
      videoRef.current.onplay = () => {
        console.log('🔗 📊 onplay from assignment effect - Video started playing');
      };
      
      videoRef.current.onplaying = () => {
        console.log('🔗 📊 onplaying from assignment effect - Video is playing');
      };
      
      videoRef.current.onwaiting = () => {
        console.log('🔗 📊 onwaiting from assignment effect - Video is waiting for data');
      };
      
      videoRef.current.onstalled = () => {
        console.log('🔗 📊 onstalled from assignment effect - Video stalled');
      };
      
      videoRef.current.onsuspend = () => {
        console.log('🔗 📊 onsuspend from assignment effect - Video suspended');
      };
      
      videoRef.current.onabort = () => {
        console.log('🔗 📊 onabort from assignment effect - Video aborted');
      };
      
      videoRef.current.onemptied = () => {
        console.log('🔗 📊 onemptied from assignment effect - Video emptied');
      };
      
      // Force immediate play attempt
      setTimeout(() => {
        if (videoRef.current && videoRef.current.readyState >= 2) {
          console.log('🔗 Force playing video after timeout from assignment effect, readyState:', videoRef.current.readyState);
          videoRef.current.play().catch(console.error);
        } else {
          console.log('🔗 Cannot force play from assignment effect, readyState:', videoRef.current?.readyState);
        }
      }, 100);
      
      // Additional timeout to check progress
      setTimeout(() => {
        if (videoRef.current) {
          console.log('🔗 Video status after 500ms from assignment effect:', {
            readyState: videoRef.current.readyState,
            currentTime: videoRef.current.currentTime,
            paused: videoRef.current.paused,
            videoWidth: videoRef.current.videoWidth,
            videoHeight: videoRef.current.videoHeight,
            networkState: videoRef.current.networkState,
          });
        }
      }, 500);
      
      // Force load the video
      console.log('🔗 Calling video.load() from assignment effect...');
      videoRef.current.load();
      
      console.log('🔗 Stream assignment complete');
    } else {
      console.log('🔗 Stream assignment skipped:', {
        hasStream: !!cameraStream,
        videoElementReady: videoElementReady,
        hasVideoElement: !!videoRef.current,
        videoAlreadyHasStream: !!videoRef.current?.srcObject
      });
    }
  }, [cameraStream, videoElementReady]); // Watch for stream and video ready state changes

  // Initialize face-api.js on mount
  useEffect(() => {
    console.log('👤 Face-api.js initialization effect');
    loadFaceApiModels();
  }, [loadFaceApiModels]);

  // Start/stop face detection based on video playing state
  useEffect(() => {
    if (faceApiLoaded && cameraStream && videoRef.current && videoRef.current.readyState >= 2) {
      console.log('👤 Starting face detection - conditions met');
      // Delay start to ensure video is actually playing
      setTimeout(() => {
        if (videoRef.current && !videoRef.current.paused) {
          startFaceDetection();
        }
      }, 2000);
    } else {
      console.log('👤 Stopping face detection - conditions not met', {
        faceApiLoaded,
        cameraStream: !!cameraStream,
        videoElement: !!videoRef.current,
        readyState: videoRef.current?.readyState
      });
      stopFaceDetection();
    }

    return () => {
      stopFaceDetection();
    };
  }, [faceApiLoaded, cameraStream, videoElementReady, startFaceDetection, stopFaceDetection]);

  // Cleanup face detection on unmount
  useEffect(() => {
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, []);

  // Add video stuck detection
  useEffect(() => {
    console.log('🔍 Video stuck detection effect triggered');
    console.log('🔍 Current state - Stream:', !!cameraStream, 'Video element:', !!videoRef.current);
    
    if (cameraStream && videoRef.current) {
      console.log('🔍 Setting up video stuck detection timer');
      const checkVideoPlaying = () => {
        if (videoRef.current && cameraStream) {
          const readyState = videoRef.current.readyState;
          const currentTime = videoRef.current.currentTime;
          const paused = videoRef.current.paused;
          const networkState = videoRef.current.networkState;
          
          console.log('🔍 === VIDEO STUCK CHECK ===');
          console.log('🔍 Video check details:', {
            readyState,
            currentTime,
            paused,
            networkState,
            videoWidth: videoRef.current.videoWidth,
            videoHeight: videoRef.current.videoHeight,
            streamActive: cameraStream.active,
            streamTracks: cameraStream.getTracks().length
          });
          
          // ReadyState meanings:
          // 0 = HAVE_NOTHING
          // 1 = HAVE_METADATA  
          // 2 = HAVE_CURRENT_DATA
          // 3 = HAVE_FUTURE_DATA
          // 4 = HAVE_ENOUGH_DATA
          
          const isVideoStuck = readyState >= 2 && currentTime === 0 && paused;
          const hasNoData = readyState === 0;
          
          console.log('🔍 Analysis:', {
            isVideoStuck,
            hasNoData,
            shouldRefresh: isVideoStuck || (hasNoData && cameraStream.active)
          });
          
          // If video has data but isn't playing after 3 seconds, force refresh
          if (isVideoStuck) {
            console.log('🔍 ⚠️ Video appears stuck (has data but not playing), triggering refresh...');
            refreshCamera();
          } else if (hasNoData && cameraStream.active) {
            console.log('🔍 ⚠️ Video has no data but stream is active, triggering refresh...');
            refreshCamera();
          } else {
            console.log('🔍 ✅ Video appears to be working normally');
          }
          
          console.log('🔍 === VIDEO STUCK CHECK END ===');
        } else {
          console.log('🔍 Video stuck check skipped - missing video element or stream');
        }
      };
      
      // Check after 3 seconds
      console.log('🔍 Setting 3-second timer for video check');
      const timeoutId = setTimeout(checkVideoPlaying, 3000);
      
      return () => {
        console.log('🔍 Clearing video stuck detection timer');
        clearTimeout(timeoutId);
      };
    } else {
      console.log('🔍 Video stuck detection not setup - missing requirements');
    }
  }, [cameraStream, refreshCamera]);

  // Initialize camera on mount (only once)
  useEffect(() => {
    console.log('🎬 === CAMERA INITIALIZATION EFFECT ===');
    let mounted = true;
    
    const initCamera = async () => {
      console.log('🎬 Camera initialization starting...');
      // Small delay to ensure component is fully mounted
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (mounted) {
        console.log('🎬 Component still mounted, calling startCamera');
        startCamera();
      } else {
        console.log('🎬 Component unmounted, skipping camera start');
      }
    };
    
    console.log('🎬 Setting up camera initialization');
    initCamera();
    
    // Cleanup on unmount
    return () => {
      console.log('🎬 Camera initialization cleanup');
      mounted = false;
      if (cameraTimeoutRef.current) {
        console.log('🎬 Clearing timeout on unmount');
        clearTimeout(cameraTimeoutRef.current);
      }
      if (cameraStream) {
        console.log('🎬 Stopping camera stream on unmount');
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []); // Empty dependency array - only run once on mount

  // Cleanup camera when call ends or component unmounts
  useEffect(() => {
    if (state.callStatus === CallStatus.FINISHED) {
      // Optional: Keep camera running even after interview ends
      // Uncomment the line below if you want to stop camera when interview ends
      // stopCamera();
    }
  }, [state.callStatus]);

  // Memory cleanup - prevent memory leaks
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [cameraStream]);

  // Function to detect inappropriate content
  const detectAIWarningResponse = (text: string): boolean => {
    // Detect when AI interviewer is giving warnings based on response content
    const warningIndicators = [
      /that language is.*unacceptable/i,
      /inappropriate.*behavior/i,
      /this is your.*warning/i,
      /unprofessional.*conduct/i,
      /interview.*terminated/i,
      /further inappropriate/i,
      /completely unacceptable/i,
      /professional.*setting/i,
      /warning.*termination/i,
      /inappropriate.*comments/i
    ];

    return warningIndicators.some(pattern => pattern.test(text));
  };

  // 🚀 OPTIMIZED: Handle warning system with reduced dependencies
  const handleInappropriateBehavior = useCallback(() => {
    dispatch({ type: 'INCREMENT_WARNING' });

    if (state.warningLevel + 1 >= WarningLevel.TERMINATED) {
      // Automatically terminate interview
      setTimeout(() => {
        handleDisconnect();
      }, 3000); // Give 3 seconds for the termination message to be heard
    }
  }, [state.warningLevel]);

  // 🚀 OPTIMIZED: Memoize warning indicator to prevent unnecessary recalculations
  const warningIndicator = useMemo(() => {
    switch (state.warningLevel) {
      case WarningLevel.FIRST:
        return { color: "bg-yellow-500", text: "Warning 1/2", pulse: "animate-pulse" };
      case WarningLevel.SECOND:
        return { color: "bg-orange-500", text: "Final Warning", pulse: "animate-pulse" };
      case WarningLevel.TERMINATED:
        return { color: "bg-red-500", text: "Interview Terminated", pulse: "animate-pulse" };
      default:
        return null;
    }
  }, [state.warningLevel]);

  // 🚀 OPTIMIZED: Debug method with single dispatch call
  const debugResetStates = useCallback(() => {
    console.log("🔧 DEBUG: Force resetting all states");
    dispatch({ type: 'RESET_ALL' });
    keydownRef.current = false;
    conversationHandler.resetStates();
  }, []);

  // Expose debug function globally for console access
  useEffect(() => {
    (window as any).debugResetInterviewStates = debugResetStates;
    return () => {
      delete (window as any).debugResetInterviewStates;
    };
  }, [debugResetStates]);

  // 🚀 OPTIMIZED: Hold-to-speak functionality with optimized dependencies
  const startRecording = useCallback(() => {
    console.log("Starting recording attempt...", {
      callStatus: state.callStatus,
      isTranscribing: state.isTranscribing,
      isGenerating: state.isGenerating,
      isRecording: state.isRecording,
      keydownRef: keydownRef.current
    });
    
    if (state.callStatus === CallStatus.ACTIVE && !state.isTranscribing && !state.isGenerating && !state.isRecording && state.warningLevel < WarningLevel.TERMINATED) {
      console.log("✅ Starting recording");
      dispatch({ type: 'SET_RECORDING', payload: true });
      conversationHandler.startManualRecording();
    } else {
      console.log("❌ Recording blocked:", {
        callStatus: state.callStatus,
        isTranscribing: state.isTranscribing,
        isGenerating: state.isGenerating,
        isRecording: state.isRecording,
        warningLevel: state.warningLevel
      });
    }
  }, [state.callStatus, state.isTranscribing, state.isGenerating, state.isRecording, state.warningLevel]);

  const stopRecording = useCallback(() => {
    console.log("Stopping recording attempt...", { isRecording: state.isRecording });
    if (state.isRecording) {
      console.log("✅ Stopping recording");
      dispatch({ type: 'SET_RECORDING', payload: false });
      conversationHandler.stopManualRecording();
    }
  }, [state.isRecording]);

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !keydownRef.current) {
        console.log("Spacebar down - starting recording");
        keydownRef.current = true;
        startRecording();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" && keydownRef.current) {
        console.log("Spacebar up - stopping recording");
        keydownRef.current = false;
        stopRecording();
      }
    };

    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("keypress", handleKeyPress);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("keypress", handleKeyPress);
    };
  }, [startRecording, stopRecording]);

  // 🚀 OPTIMIZED: Event handlers with single dispatch calls
  useEffect(() => {
    const onCallStart = () => {
      console.log("Conversation started");
      dispatch({ type: 'SET_CALL_STATUS', payload: CallStatus.ACTIVE });
    };

    const onCallEnd = () => {
      console.log("Conversation ended");
      dispatch({ type: 'SET_CALL_STATUS', payload: CallStatus.FINISHED });
    };

    const onMessage = (message: Message) => {
      console.log("Message received:", message);

      if (message.type === "transcript" && message.transcriptType === "final") {
        const newMessage: SavedMessage = {
          role: message.role,
          content: message.transcript,
        };

        // Check for AI warning responses instead of user content
        if (message.role === "assistant" && detectAIWarningResponse(message.transcript)) {
          console.log("🚨 AI issued warning response:", message.transcript);
          handleInappropriateBehavior();
        }

        dispatch({ type: 'ADD_MESSAGE', payload: newMessage });

        if (message.role === "user") {
          console.log("User message received - starting AI generation");
          dispatch({ type: 'SET_GENERATING', payload: true });
          dispatch({ type: 'SET_TRANSCRIBING', payload: false });
        } else if (message.role === "assistant") {
          console.log("Assistant response received - resetting all states");
          dispatch({ type: 'SET_GENERATING', payload: false });
          dispatch({ type: 'SET_TRANSCRIBING', payload: false });
          dispatch({ type: 'SET_RECORDING', payload: false });
        }
      }
    };

    const onSpeechStart = () => {
      console.log("Speech started (TTS playing)");
      dispatch({ type: 'SET_SPEAKING', payload: true });
    };

    const onSpeechEnd = () => {
      console.log("Speech ended (TTS finished)");
      dispatch({ type: 'SET_SPEAKING', payload: false });
    };

    const onError = (error: Error) => {
      console.error("Conversation error:", error);
      dispatch({ type: 'SET_CALL_STATUS', payload: CallStatus.FINISHED });
    };

    // Voice change detection callback
    const onVoiceChangeDetected = (result: VoiceChangeResult) => {
      console.warn("🚨 Voice change detected:", result);
      
      // Show warning toast with detailed information
      toast.warning("⚠️ Different Speaker Detected!", {
        description: `Voice similarity: ${(result.similarity * 100).toFixed(1)}%. ${result.reason || 'The voice pattern has changed during the interview.'}`,
        duration: 10000, // Show for 10 seconds
        action: {
          label: "Acknowledge",
          onClick: () => {
            console.log("Voice change warning acknowledged by user");
            // You could add additional actions here like:
            // - Log the incident
            // - Pause the interview
            // - Send alert to admin
          },
        },
        style: {
          backgroundColor: '#ff6b6b',
          color: 'white',
          fontWeight: 'bold'
        }
      });

      // Also show console warning for debugging
      console.table({
        'Voice Changed': result.isVoiceChanged ? '🚨 YES' : '✅ No',
        'Similarity': `${(result.similarity * 100).toFixed(2)}%`,
        'Confidence': `${(result.confidence * 100).toFixed(2)}%`,
        'Reason': result.reason,
        'Timestamp': new Date().toISOString()
      });

      // Optional: Additional actions when voice change is detected
      if (result.isVoiceChanged && result.confidence > 0.7) {
        console.warn("🔴 HIGH CONFIDENCE voice change detected - this likely indicates a different person is speaking");
        
        // You could add more severe actions here like:
        // - dispatch({ type: 'INCREMENT_WARNING' });
        // - Automatically pause interview
        // - etc.
      }
    };

    conversationHandler.on("call-start", onCallStart);
    conversationHandler.on("call-end", onCallEnd);
    conversationHandler.on("message", onMessage);
    conversationHandler.on("speech-start", onSpeechStart);
    conversationHandler.on("speech-end", onSpeechEnd);
    conversationHandler.on("error", onError);
    conversationHandler.on("voice-change", onVoiceChangeDetected);

    return () => {
      // Clean up event listeners
      conversationHandler.off("call-start", onCallStart);
      conversationHandler.off("call-end", onCallEnd);
      conversationHandler.off("message", onMessage);
      conversationHandler.off("speech-start", onSpeechStart);
      conversationHandler.off("speech-end", onSpeechEnd);
      conversationHandler.off("error", onError);
      conversationHandler.off("voice-change", onVoiceChangeDetected);
    };
  }, [handleInappropriateBehavior]);

  // 🚀 OPTIMIZED: Effect with reduced dependencies
  useEffect(() => {

    const handleGenerateFeedback = async (messages: SavedMessage[]) => {
      console.log("handleGenerateFeedback - client-side");

      try {
        // Step 1: Generate feedback using client-side Ollama
        console.log("Generating feedback with client-side Ollama...");
        const feedbackData = await clientFeedbackGenerator.generateFeedback(messages);
        
        console.log("Feedback generated:", feedbackData);

        // Step 2: Save feedback to database via API
        console.log("Saving feedback to database...");
        const response = await fetch("/api/save-feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            interviewId: interviewId!,
            userId: userId!,
            feedbackId,
            totalScore: feedbackData.totalScore,
            categoryScores: feedbackData.categoryScores,
            strengths: feedbackData.strengths,
            areasForImprovement: feedbackData.areasForImprovement,
            finalAssessment: feedbackData.finalAssessment,
          }),
        });

        const result = await response.json();
        console.log("Save feedback response:", result);

        if (result.success && result.feedbackId) {
          router.push(`/interview/${interviewId}/feedback`);
        } else {
          console.log("Error saving feedback:", result.error);
          router.push("/");
        }
      } catch (error) {
        console.error("Error generating feedback:", error);
        
        // Provide more specific error messages
        if (error instanceof Error) {
          if (error.message.includes("fetch failed") || error.message.includes("NetworkError")) {
            console.error("Cannot connect to Ollama service for feedback generation");
          }
        }
        
        router.push("/");
              } finally {
          dispatch({ type: 'SET_GENERATING_FEEDBACK', payload: false });
        }
    };

    if (state.callStatus === CallStatus.FINISHED) {
      if (type === "generate") {
        router.push("/");
      } else {
        // Only generate feedback if there was actual meaningful conversation
        // Check if there are user messages (indicating actual interview interaction)
        const userMessages = state.messages.filter(msg => msg.role === "user");
        const assistantMessages = state.messages.filter(msg => msg.role === "assistant");
        
        if (userMessages.length > 0 && assistantMessages.length > 1) {
          // There was actual conversation, immediately start generating feedback
          // This prevents the glitch where interview screen shows briefly
          dispatch({ type: 'SET_GENERATING_FEEDBACK', payload: true });
          handleGenerateFeedback(state.messages);
        } else {
          // No meaningful conversation happened, just go back to home or allow retry
          console.log("No meaningful conversation detected, not generating feedback");
          // Reset call status to allow retry
          dispatch({ type: 'SET_CALL_STATUS', payload: CallStatus.INACTIVE });
        }
      }
    }
  }, [state.messages, state.callStatus, feedbackId, interviewId, router, type, userId]);

  const handleCall = async () => {
    try {
      console.log("Starting conversation...");
      dispatch({ type: 'SET_CALL_STATUS', payload: CallStatus.CONNECTING });
      dispatch({ type: 'RESET_WARNING' }); // Reset warning level

      if (type === "generate") {
        // For generate type, use a default workflow with conversation handler
        console.log("Starting general conversation mode");
        await conversationHandler.start("default", {
          variableValues: {
            username: userName || "User",
            userid: userId || "unknown",
          },
        });
      } else {
        let formattedQuestions = "";
        if (questions) {
          formattedQuestions = questions
            .map((question) => `- ${question}`)
            .join("\n");
        }

        console.log("Interviewer config:", interviewer);
        console.log("Formatted questions:", formattedQuestions);

        // Fallback configuration if interviewer is undefined
        const interviewConfig = interviewer || {
          systemPrompt: `You are a professional job interviewer conducting a real-time voice interview with a candidate. Your goal is to assess their qualifications, motivation, and fit for the role.

Interview Guidelines:
Follow the structured question flow:
{{questions}}

Engage naturally & react appropriately:
Listen actively to responses and acknowledge them before moving forward.
Ask brief follow-up questions if a response is vague or requires more detail.
Keep the conversation flowing smoothly while maintaining control.
Be professional, yet warm and welcoming:

Use official yet friendly language.
Keep responses concise and to the point (like in a real voice interview).
Avoid robotic phrasing—sound natural and conversational.

Handle unprofessional behavior with ZERO TOLERANCE:
If a candidate uses profanity, sexual language, inappropriate comments, or behaves unprofessionally:
- Issue an IMMEDIATE, FIRM warning without any politeness or apologies
- Be direct, authoritative, and assertive - you are in complete control
- NEVER say "I apologize" or "I understand you're frustrated" - DO NOT make excuses for their behavior
- Make it clear this behavior is completely unacceptable and will result in interview termination
- Examples of firm responses:
  * "That language is completely unacceptable in a professional interview. This is your first warning. Any further inappropriate behavior will result in immediate termination of this interview."
  * "Your behavior is unprofessional and inappropriate. This is your second warning. One more incident and this interview will be terminated immediately."
  * "This interview is being terminated due to your continued inappropriate behavior. This is unacceptable in any professional setting."
- Track warnings internally and terminate after the third offense
- Do NOT continue with interview questions after giving a warning - wait for their response first

Handle company-specific questions with strict boundaries:
- For salary, compensation, benefits: "I cannot provide specific compensation information. HR will discuss all compensation details during the next phase if you advance."
- For company policies, specific benefits, work environment: "I'm not authorized to discuss those specifics. HR will provide comprehensive information about company policies and culture."
- For role responsibilities: You can discuss general job duties and what the role typically involves
- CRITICAL: NEVER make up or invent specific salary figures, benefit amounts, company policies, or organizational details
- If you don't know something specific about the company, always redirect to HR or state you cannot provide that information
- NEVER hallucinate or create fictional company information

IMPORTANT RESPONSE RULES:
- Be firm and authoritative when dealing with misconduct - you control this interview
- Keep all your responses short and simple. Use official language, but be kind and welcoming.
- This is a voice conversation, so keep your responses short, like in a real conversation. Don't ramble for too long.
- NEVER include stage directions, parenthetical notes, or bracketed text in your responses.
- Speak only what should be heard by the candidate - no internal thoughts or directions.
- Do not use phrases like "(pause)", "(maintaining calm tone)", "[smiling]", etc.
- Your responses should be direct speech only.
- Do not apologize for candidate misconduct - be firm and professional instead.`,
          useStreaming: false,
        };

        console.log("Starting interview with config:", interviewConfig);
        await conversationHandler.start(interviewConfig, {
          variableValues: {
            questions: formattedQuestions,
          },
        });
      }
    } catch (error) {
      console.error("Failed to start conversation:", error);
      dispatch({ type: 'SET_CALL_STATUS', payload: CallStatus.FINISHED });
    }
  };

  const handleDisconnect = async () => {
    try {
      console.log("Stopping conversation...");
      await conversationHandler.stop();
      dispatch({ type: 'SET_CALL_STATUS', payload: CallStatus.FINISHED });
    } catch (error) {
      console.error("Error stopping conversation:", error);
      dispatch({ type: 'SET_CALL_STATUS', payload: CallStatus.FINISHED });
    }
  };

  // 🚀 OPTIMIZED: Memoize processing state and indicators
  const processingState = useMemo(() => {
    if (state.isTranscribing) return "Transcribing...";
    if (state.isGenerating) return "Generating response...";
    return "Hold to Speak";
  }, [state.isTranscribing, state.isGenerating]);

  const isAnyProcessing = useMemo(() => 
    state.isTranscribing || state.isGenerating, 
    [state.isTranscribing, state.isGenerating]
  );

  // 🚀 OPTIMIZED: Debug logging with memoization to reduce log spam
  const debugInfo = useMemo(() => ({
    callStatus: state.callStatus,
    isRecording: state.isRecording,
    isTranscribing: state.isTranscribing,
    isGenerating: state.isGenerating,
    isSpeaking: state.isSpeaking,
    warningLevel: state.warningLevel,
    messagesCount: state.messages.length,
    lastMessage: state.lastMessage ? state.lastMessage.slice(0, 50) + "..." : "No message"
  }), [state]);

  // Only log on state changes, not every render
  useEffect(() => {
    console.log("Agent state changed:", debugInfo);
  }, [debugInfo]);

  // Show feedback generation loader
  if (state.isGeneratingFeedback) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900 z-50">
        <div className="flex flex-col items-center justify-center space-y-8 p-8">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 w-20 h-20 border-4 border-transparent border-r-blue-300 rounded-full animate-ping"></div>
          </div>
          <div className="text-center max-w-md">
            <h3 className="text-2xl font-bold text-white mb-3">Generating Your Feedback</h3>
            <p className="text-gray-300 mb-6 text-lg">Our AI is analyzing your interview performance and preparing detailed insights...</p>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="new-interview-layout">
        {/* Warning Indicator */}
        {warningIndicator && (
          <div className={cn(
            "fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-white font-semibold shadow-lg",
            warningIndicator.color,
            warningIndicator.pulse
          )}>
            {warningIndicator.text}
          </div>
        )}

        {/* Main Content Area */}
        <div className="interview-main-content">
          {/* Camera Preview Area */}
          <div className="camera-preview-area">
            <div className={cn(
              "camera-preview",
              !isFaceDetected && faceApiLoaded && "no-face"
            )}>
              {/* Camera Feed or Fallback */}
              <div className="user-in-camera">
                {cameraLoading ? (
                  // Loading state
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-600/20 to-blue-800/20 flex items-center justify-center mb-4 border-4 border-blue-500/20 shadow-2xl">
                      <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <h3 className="text-white text-xl font-semibold tracking-wide">Initializing Camera...</h3>
                    <p className="text-gray-400 text-sm mt-2">Please allow camera access if prompted</p>
                  </div>
                ) : cameraStream ? (
                  // Real camera feed
                  <div className="relative w-full h-full flex items-center justify-center">
                    <video
                      ref={(el) => {
                        console.log('🎥 Video ref callback called with element:', !!el);
                        if (el) {
                          console.log('🎥 Video element created/updated:', {
                            readyState: el.readyState,
                            networkState: el.networkState,
                            currentTime: el.currentTime,
                          });
                          setVideoElementReady(true);
                        } else {
                          setVideoElementReady(false);
                        }
                        videoRef.current = el;
                      }}
                      autoPlay
                      playsInline
                      muted
                      controls={false}
                      preload="auto"
                      webkit-playsinline="true"
                      className="w-full h-full object-cover rounded-xl"
                      onLoadedMetadata={() => {
                        console.log('🎥 Video metadata loaded');
                        if (videoRef.current) {
                          videoRef.current.play().catch(console.error);
                        }
                      }}
                      onError={(e) => {
                        console.error('🎥 Video error:', e);
                        setCameraError('Video display error');
                      }}
                      onCanPlay={() => {
                        console.log('🎥 Video can play');
                      }}
                      onPlaying={() => {
                        console.log('🎥 Video is playing');
                        // Start face detection when video starts playing
                        if (faceApiLoaded && cameraStream) {
                          console.log('👤 Video playing - starting face detection');
                          setTimeout(() => startFaceDetection(), 1000);
                        }
                      }}
                      onWaiting={() => {
                        console.log('🎥 Video is waiting for data');
                      }}
                      onStalled={() => {
                        console.log('🎥 Video stalled');
                      }}
                    />
                    
                    {/* Debug canvas for face detection - only in development */}
                    {process.env.NODE_ENV === 'development' && (
                      <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full pointer-events-none opacity-50"
                      />
                    )}
                  </div>
                ) : (
                  // Fallback when camera is not available
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-gray-600/20 to-gray-800/20 flex items-center justify-center mb-4 border-4 border-white/10 shadow-2xl">
                      {permissionDenied ? (
                        <svg className="w-16 h-16 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 14l8.5 0M5 14l0-4l8.5 0" />
                        </svg>
                      ) : (
                        <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                    </div>
                    <h3 className="text-white text-xl font-semibold tracking-wide">{userName}</h3>
                    {cameraError && (
                      <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg max-w-sm">
                        <p className="text-red-400 text-sm text-center">
                          {cameraError}
                        </p>
                        {permissionDenied && (
                          <button
                            onClick={() => window.location.reload()}
                            className="mt-2 px-3 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-full border border-red-500/30 transition-colors duration-200 w-full"
                          >
                            Refresh Page
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Recording indicators - always show when active */}
                {state.isRecording && (
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 px-3 py-1 bg-red-500/20 rounded-full border border-red-500/30 backdrop-blur-sm">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-red-400 font-medium">Recording</span>
                  </div>
                )}
                {state.isTranscribing && (
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 px-3 py-1 bg-blue-500/20 rounded-full border border-blue-500/30 backdrop-blur-sm">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-blue-400 font-medium">Transcribing</span>
                  </div>
                )}
                {state.isGenerating && (
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 px-3 py-1 bg-green-500/20 rounded-full border border-green-500/30 backdrop-blur-sm">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-green-400 font-medium">AI Thinking</span>
                  </div>
                )}
              </div>
            </div>

            {/* Status Text Below Camera Preview */}
            <div className="status-text">
              <div className="flex items-center justify-between w-full">
                <span>Status: {state.callStatus} | Recording: {state.isRecording ? 'Yes' : 'No'} | Transcribing: {state.isTranscribing ? 'Yes' : 'No'} | Generating: {state.isGenerating ? 'Yes' : 'No'} | Warnings: {state.warningLevel}/2</span>
                
                {/* Face detection warning badges */}
                {faceApiLoaded && faceCount > 1 && (
                  <div className="warning-badge ml-2">
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                      Multiple Faces
                    </span>
                  </div>
                )}
                
                {faceApiLoaded && faceCount === 0 && (
                  <div className="away-badge ml-2">
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                      Interviewee Away
                    </span>
                  </div>
                )}

                {!cameraLoading && (
                  <button
                    onClick={cameraStream ? stopCamera : startCamera}
                    disabled={cameraLoading}
                    className="ml-4 px-3 py-1 text-xs bg-primary-200/20 hover:bg-primary-200/30 text-primary-200 rounded-full border border-primary-200/30 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cameraStream ? (
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M15 8v8H5V8h10m1-2H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1z"/>
                          <path d="M18 8l4-4v12l-4-4V8z"/>
                        </svg>
                        Camera On
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M15 8v8H5V8h10m1-2H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1z"/>
                          <path d="M18 8l4-4v12l-4-4V8z"/>
                          <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                        Enable Camera
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="right-sidebar">
            {/* Single Full-Height AI Interviewer Box */}
            <div className="sidebar-box-full">
              <div className="sidebar-box-content">
                <div className="avatar">
                  <Image
                    src="/ai-avatar.png"
                    alt="profile-image"
                    width={65}
                    height={54}
                    className="object-cover"
                  />
                  {state.isSpeaking && <span className="animate-speak" />}
                </div>
                <h3>AI Interviewer</h3>
                {state.isSpeaking && (
                  <div className="flex items-center gap-1 mt-2">
                    <div className="w-1 h-3 bg-primary-200 animate-pulse rounded-full"></div>
                    <div className="w-1 h-4 bg-primary-200 animate-pulse rounded-full" style={{animationDelay: '0.2s'}}></div>
                    <div className="w-1 h-2 bg-primary-200 animate-pulse rounded-full" style={{animationDelay: '0.4s'}}></div>
                    <div className="w-1 h-4 bg-primary-200 animate-pulse rounded-full" style={{animationDelay: '0.6s'}}></div>
                    <div className="w-1 h-3 bg-primary-200 animate-pulse rounded-full" style={{animationDelay: '0.8s'}}></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Transcript Section - Always show when there are messages */}
        {state.messages.length > 0 && state.lastMessage && (
          <div className="transcript-border">
            <div className="transcript">
              <p
                key={state.lastMessage}
                className={cn(
                  "transition-opacity duration-500 opacity-0",
                  "animate-fadeIn opacity-100"
                )}
              >
                {state.lastMessage}
              </p>
            </div>
          </div>
        )}

        {/* Control Buttons */}
        <div className="interview-controls">
          {state.callStatus !== CallStatus.ACTIVE ? (
            <button className="relative btn-call" onClick={() => handleCall()}>
              <span
                className={cn(
                  "absolute animate-ping rounded-full opacity-75",
                  state.callStatus !== CallStatus.CONNECTING && "hidden"
                )}
              />

              <span className="relative text-black">
                {state.callStatus === CallStatus.INACTIVE || state.callStatus === CallStatus.FINISHED
                  ? "Start Interview"
                  : "Connecting..."}
              </span>
            </button>
          ) : (
            <div className="flex flex-col items-center gap-3">
              {/* Buttons Row */}
              <div className="controls-row">
                {/* Hold to Speak Button */}
                <button
                  className={cn(
                    "mic-button",
                    state.isRecording && "recording",
                    (isAnyProcessing || state.warningLevel >= WarningLevel.TERMINATED) && "opacity-50 cursor-not-allowed"
                  )}
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onMouseLeave={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  disabled={isAnyProcessing || state.warningLevel >= WarningLevel.TERMINATED}
                >
                  {state.warningLevel >= WarningLevel.TERMINATED ? (
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                  ) : (
                    <svg 
                      className="w-6 h-6 text-white" 
                      fill="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                    </svg>
                  )}
                </button>

                {/* End Interview Button */}
                <button
                  className="end-button"
                  onClick={handleDisconnect}
                >
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                  End Interview
                </button>
              </div>

              {/* Instructions */}
              <p className="text-xs text-gray-500 text-center max-w-md">
                {state.warningLevel >= WarningLevel.TERMINATED 
                  ? "This interview has been terminated due to inappropriate behavior."
                  : "Hold the microphone button or press and hold SPACEBAR to speak"
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Agent;
