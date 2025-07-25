// Import VoiceChangeResult from conversation types to avoid duplication
import type { VoiceChangeResult } from '../../types/conversation';

export type { VoiceChangeResult };

export interface VoiceBiometrics {
  mfccs: number[];
  fundamentalFrequency: number;
  spectralCentroid: number;
  spectralRolloff: number;
  zeroCrossingRate: number;
  voicePrint: Float32Array;
  timestamp: number;
}

export class VoiceBiometricsAnalyzer {
  private baselineVoicePrint: VoiceBiometrics | null = null;
  private similarityThreshold = 0.60;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sampleRate = 44100;
  private isAnalyzing = false; // Prevent concurrent analysis

  constructor() {
    this.initializeAudioContext();
  }

  private initializeAudioContext() {
    try {
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
      console.log('✅ AudioContext initialized for voice analysis');
    } catch (error) {
      console.error('❌ Failed to initialize AudioContext for voice analysis:', error);
    }
  }

  /**
   * Extract complete voice biometrics from audio blob with timeout protection
   */
  async extractVoiceBiometrics(audioBlob: Blob): Promise<VoiceBiometrics> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    if (this.isAnalyzing) {
      throw new Error('Voice analysis already in progress');
    }

    this.isAnalyzing = true;

    try {
      console.log('🔍 Starting voice biometrics extraction...', {
        audioSize: audioBlob.size,
        audioType: audioBlob.type
      });

             // Convert blob to array buffer with timeout
       const arrayBufferPromise = audioBlob.arrayBuffer();
       const timeoutPromise = new Promise<never>((_, reject) => {
         setTimeout(() => reject(new Error('ArrayBuffer conversion timeout')), 1500);
       });
      
      const arrayBuffer = await Promise.race([arrayBufferPromise, timeoutPromise]);
      
      if (arrayBuffer.byteLength === 0) {
        throw new Error('Empty audio buffer received');
      }

      console.log('✅ Audio buffer created, size:', arrayBuffer.byteLength);
      
             // Decode audio data with timeout
       const decodePromise = this.audioContext.decodeAudioData(arrayBuffer.slice(0));
       const decodeTimeoutPromise = new Promise<never>((_, reject) => {
         setTimeout(() => reject(new Error('Audio decode timeout')), 2000);
       });
      
      const audioBuffer = await Promise.race([decodePromise, decodeTimeoutPromise]);
      
      if (audioBuffer.length === 0) {
        throw new Error('Decoded audio buffer is empty');
      }

      console.log('✅ Audio decoded successfully', {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels
      });

      const audioData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;

             // Quick validation
       if (audioData.length < 1000) {
         console.warn('⚠️ Audio data too short for analysis, using minimum baseline');
         // Don't throw error, just create a minimal baseline
       }

      // For now, return simplified biometrics to avoid complex MFCC calculation
      const simplifiedBiometrics = this.extractSimplifiedFeatures(audioData, sampleRate);
      
      console.log('✅ Voice biometrics extracted successfully');
      return simplifiedBiometrics;

    } catch (error) {
      console.error('❌ Voice biometrics extraction failed:', error);
      throw error;
    } finally {
      this.isAnalyzing = false;
    }
  }

  /**
   * Extract simplified voice features (without complex MFCC for now)
   */
  private extractSimplifiedFeatures(audioData: Float32Array, sampleRate: number): VoiceBiometrics {
    // Simple features that are fast to compute
    const fundamentalFrequency = this.estimateFundamentalFrequency(audioData, sampleRate);
    const zeroCrossingRate = this.computeZeroCrossingRate(audioData);
    
    // Simple spectral features
    const spectrum = this.computeSimpleSpectrum(audioData);
    const spectralCentroid = this.computeSpectralCentroid(spectrum, sampleRate);
    const spectralRolloff = this.computeSpectralRolloff(spectrum, sampleRate);
    
    // Simplified "MFCC" - just use energy in different frequency bands
    const mfccs = this.computeSimplifiedMFCC(spectrum);
    
    // Create voice print by combining all features
    const voicePrint = new Float32Array([
      ...mfccs,
      fundamentalFrequency,
      spectralCentroid,
      spectralRolloff,
      zeroCrossingRate
    ]);

    return {
      mfccs,
      fundamentalFrequency,
      spectralCentroid,
      spectralRolloff,
      zeroCrossingRate,
      voicePrint,
      timestamp: Date.now()
    };
  }

  private computeSimpleSpectrum(audioData: Float32Array): Float32Array {
    // Very simple spectrum computation (not full FFT)
    const spectrumSize = 256;
    const spectrum = new Float32Array(spectrumSize);
    const blockSize = Math.floor(audioData.length / spectrumSize);
    
    for (let i = 0; i < spectrumSize; i++) {
      let energy = 0;
      const start = i * blockSize;
      const end = Math.min(start + blockSize, audioData.length);
      
      for (let j = start; j < end; j++) {
        energy += audioData[j] * audioData[j];
      }
      
      spectrum[i] = energy / blockSize;
    }
    
    return spectrum;
  }

  private computeSimplifiedMFCC(spectrum: Float32Array): number[] {
    // Simplified version - just energy in different frequency bands
    const numCoeffs = 13;
    const mfccs = new Array(numCoeffs);
    const bandsPerCoeff = Math.floor(spectrum.length / numCoeffs);
    
    for (let i = 0; i < numCoeffs; i++) {
      let energy = 0;
      const start = i * bandsPerCoeff;
      const end = Math.min(start + bandsPerCoeff, spectrum.length);
      
      for (let j = start; j < end; j++) {
        energy += spectrum[j];
      }
      
      mfccs[i] = Math.log(energy + 1e-10);
    }
    
    return mfccs;
  }

  private estimateFundamentalFrequency(signal: Float32Array, sampleRate: number): number {
    try {
      const minPeriod = Math.floor(sampleRate / 500); // 500 Hz max
      const maxPeriod = Math.floor(sampleRate / 50);  // 50 Hz min
      
      let maxCorrelation = 0;
      let bestPeriod = minPeriod;
      
      // Limit search to prevent hanging
      const searchLength = Math.min(signal.length - maxPeriod, 1000);
      
      for (let period = minPeriod; period <= maxPeriod && period < searchLength; period++) {
        let correlation = 0;
        const samples = Math.min(searchLength, 500); // Limit samples
        
        for (let i = 0; i < samples; i++) {
          correlation += signal[i] * signal[i + period];
        }
        
        if (correlation > maxCorrelation) {
          maxCorrelation = correlation;
          bestPeriod = period;
        }
      }
      
      return sampleRate / bestPeriod;
    } catch (error) {
      console.warn('F0 estimation failed, using default:', error);
      return 150; // Default F0
    }
  }

  private computeSpectralCentroid(spectrum: Float32Array, sampleRate: number): number {
    let weightedSum = 0;
    let magnitudeSum = 0;
    
    for (let i = 0; i < spectrum.length; i++) {
      const frequency = i * sampleRate / (2 * (spectrum.length - 1));
      const magnitude = Math.sqrt(spectrum[i]);
      weightedSum += frequency * magnitude;
      magnitudeSum += magnitude;
    }
    
    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }

  private computeSpectralRolloff(spectrum: Float32Array, sampleRate: number, threshold = 0.85): number {
    const totalEnergy = spectrum.reduce((sum, val) => sum + val, 0);
    const targetEnergy = totalEnergy * threshold;
    
    let cumulativeEnergy = 0;
    for (let i = 0; i < spectrum.length; i++) {
      cumulativeEnergy += spectrum[i];
      if (cumulativeEnergy >= targetEnergy) {
        return i * sampleRate / (2 * (spectrum.length - 1));
      }
    }
    
    return sampleRate / 2;
  }

  private computeZeroCrossingRate(signal: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < signal.length; i++) {
      if ((signal[i] >= 0) !== (signal[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings / signal.length;
  }

  /**
   * Calculate cosine similarity between two voice prints
   */
  private calculateCosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Voice prints must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Calculate weighted similarity considering different feature importance
   */
  private calculateWeightedSimilarity(baseline: VoiceBiometrics, current: VoiceBiometrics): number {
    // Weight different features based on their importance for speaker identification
    // Adjusted weights to be more sensitive to voice differences
    const mfccWeight = 0.5;  // Reduced from 0.6
    const f0Weight = 0.3;    // Increased from 0.2 (fundamental frequency is very distinctive)
    const spectralWeight = 0.15;
    const zcrWeight = 0.05;

    // MFCC similarity
    const mfccBaseline = new Float32Array(baseline.mfccs);
    const mfccCurrent = new Float32Array(current.mfccs);
    const mfccSimilarity = this.calculateCosineSimilarity(mfccBaseline, mfccCurrent);

    // Fundamental frequency similarity (normalized) - more sensitive to pitch differences
    const f0Diff = Math.abs(baseline.fundamentalFrequency - current.fundamentalFrequency);
    const f0Max = Math.max(baseline.fundamentalFrequency, current.fundamentalFrequency, 1);
    // Use smaller divisor to make it more sensitive to pitch differences
    const f0Similarity = Math.max(0, 1 - (f0Diff * 1.5) / f0Max);

    // Spectral centroid similarity (normalized)
    const scDiff = Math.abs(baseline.spectralCentroid - current.spectralCentroid);
    const scMax = Math.max(baseline.spectralCentroid, current.spectralCentroid, 1);
    const scSimilarity = Math.max(0, 1 - scDiff / scMax);

    // Zero crossing rate similarity (normalized)
    const zcrDiff = Math.abs(baseline.zeroCrossingRate - current.zeroCrossingRate);
    const zcrMax = Math.max(baseline.zeroCrossingRate, current.zeroCrossingRate, 1);
    const zcrSimilarity = Math.max(0, 1 - zcrDiff / zcrMax);

    // Weighted combination
    const weightedSimilarity = (
      mfccSimilarity * mfccWeight +
      f0Similarity * f0Weight +
      scSimilarity * spectralWeight +
      zcrSimilarity * zcrWeight
    );

    return Math.max(0, Math.min(1, weightedSimilarity));
  }

  /**
   * Set the baseline voice print (first speaker)
   */
  setBaselineVoice(voiceBiometrics: VoiceBiometrics): void {
    this.baselineVoicePrint = voiceBiometrics;
    console.log('🎯 Baseline voice established:', {
      fundamentalFrequency: voiceBiometrics.fundamentalFrequency.toFixed(2),
      spectralCentroid: voiceBiometrics.spectralCentroid.toFixed(2),
      mfccLength: voiceBiometrics.mfccs.length
    });
  }

  /**
   * Analyze if voice has changed compared to baseline
   */
  async analyzeVoiceChange(audioBlob: Blob): Promise<VoiceChangeResult> {
    try {
      console.log('🔍 Starting voice change analysis...');
      
      const currentVoiceBiometrics = await this.extractVoiceBiometrics(audioBlob);

      // If no baseline, set current as baseline
      if (!this.baselineVoicePrint) {
        this.setBaselineVoice(currentVoiceBiometrics);
        return {
          isVoiceChanged: false,
          similarity: 1.0,
          confidence: 1.0,
          reason: 'Baseline voice established'
        };
      }

      // Calculate similarity
      const similarity = this.calculateWeightedSimilarity(this.baselineVoicePrint, currentVoiceBiometrics);
      const isVoiceChanged = similarity < this.similarityThreshold;
      
      // Calculate confidence based on how far from threshold
      const confidence = Math.abs(similarity - this.similarityThreshold) / this.similarityThreshold;

      console.log('🔍 Voice analysis result:', {
        similarity: similarity.toFixed(3),
        threshold: this.similarityThreshold,
        isVoiceChanged,
        confidence: confidence.toFixed(3),
        currentF0: currentVoiceBiometrics.fundamentalFrequency.toFixed(2),
        baselineF0: this.baselineVoicePrint.fundamentalFrequency.toFixed(2)
      });

      return {
        isVoiceChanged,
        similarity,
        confidence: Math.min(1.0, confidence),
        reason: isVoiceChanged ? 
          `Voice similarity (${similarity.toFixed(3)}) below threshold (${this.similarityThreshold})` :
          'Voice matches baseline'
      };
    } catch (error) {
      console.error('❌ Error analyzing voice change:', error);
      return {
        isVoiceChanged: false,
        similarity: 0,
        confidence: 0,
        reason: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Reset baseline voice (for new interview)
   */
  resetBaseline(): void {
    this.baselineVoicePrint = null;
    this.isAnalyzing = false;
    console.log('🔄 Voice baseline reset');
  }

  /**
   * Update similarity threshold
   */
  setSimilarityThreshold(threshold: number): void {
    this.similarityThreshold = Math.max(0.1, Math.min(0.95, threshold));
    console.log(`🎚️ Voice similarity threshold updated to ${this.similarityThreshold}`);
  }

  /**
   * Get current configuration
   */
  getConfiguration(): { threshold: number; hasBaseline: boolean; isAnalyzing: boolean } {
    return {
      threshold: this.similarityThreshold,
      hasBaseline: this.baselineVoicePrint !== null,
      isAnalyzing: this.isAnalyzing
    };
  }
}

export const voiceBiometricsAnalyzer = new VoiceBiometricsAnalyzer(); 