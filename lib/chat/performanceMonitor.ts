/**
 * Chat Performance Monitor
 * Tracks quick response usage and API call savings
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { nowTimestamp } from '../date/DateService';

interface ChatMetrics {
  quickResponsesServed: number;
  apiCallsSaved: number;
  apiCallsMade: number;
  totalInteractions: number;
  totalResponseTime: number;
  lastResetDate: string;
}

const METRICS_KEY = '@gremly/chat_performance_metrics';
const DEFAULT_METRICS: ChatMetrics = {
  quickResponsesServed: 0,
  apiCallsSaved: 0,
  apiCallsMade: 0,
  totalInteractions: 0,
  totalResponseTime: 0,
  lastResetDate: nowTimestamp(),
};

class ChatPerformanceMonitor {
  private metrics: ChatMetrics = { ...DEFAULT_METRICS };
  private isLoaded = false;

  async init() {
    if (this.isLoaded) return;

    try {
      const stored = await AsyncStorage.getItem(METRICS_KEY);
      if (stored) {
        this.metrics = JSON.parse(stored);
      }
      this.isLoaded = true;
    } catch (error) {
      console.error('[PerfMonitor] Failed to load metrics:', error);
      this.metrics = { ...DEFAULT_METRICS };
    }
  }

  /**
   * Record a quick response being used (no API call)
   */
  async recordQuickResponse() {
    await this.init();

    this.metrics.quickResponsesServed++;
    this.metrics.apiCallsSaved++;
    this.metrics.totalInteractions++;

    await this.saveMetrics();

    if (__DEV__) {
      console.log('[PerfMonitor] Quick response served', {
        total: this.metrics.quickResponsesServed,
        savingsRate: this.getQuickResponseRate(),
      });
    }
  }

  /**
   * Record an API call being made
   * @param duration - Response time in milliseconds
   */
  async recordApiCall(duration: number) {
    await this.init();

    this.metrics.apiCallsMade++;
    this.metrics.totalInteractions++;
    this.metrics.totalResponseTime += duration;

    await this.saveMetrics();

    if (__DEV__) {
      console.log('[PerfMonitor] API call recorded', {
        duration: `${duration}ms`,
        avgResponseTime: `${this.getAverageResponseTime()}ms`,
      });
    }
  }

  /**
   * Get current performance statistics
   */
  getStats() {
    const quickResponseRate = this.getQuickResponseRate();
    const avgResponseTime = this.getAverageResponseTime();

    // Estimate cost savings (assuming $0.002 per API call average)
    const estimatedCostSavings = this.metrics.apiCallsSaved * 0.002;

    // Estimate time saved (assuming avg API call takes 1.5s vs 300ms for quick response)
    const avgApiTime = 1500; // ms
    const avgQuickTime = 300; // ms
    const timeSavedMs = this.metrics.quickResponsesServed * (avgApiTime - avgQuickTime);
    const timeSavedSeconds = Math.round(timeSavedMs / 1000);

    return {
      quickResponsesServed: this.metrics.quickResponsesServed,
      apiCallsMade: this.metrics.apiCallsMade,
      apiCallsSaved: this.metrics.apiCallsSaved,
      totalInteractions: this.metrics.totalInteractions,
      quickResponseRate,
      averageResponseTime: avgResponseTime,
      estimatedCostSavings,
      timeSavedSeconds,
      lastResetDate: this.metrics.lastResetDate,
    };
  }

  /**
   * Get quick response usage rate (percentage)
   */
  private getQuickResponseRate(): number {
    if (this.metrics.totalInteractions === 0) return 0;
    return (this.metrics.quickResponsesServed / this.metrics.totalInteractions) * 100;
  }

  /**
   * Get average API call response time
   */
  private getAverageResponseTime(): number {
    if (this.metrics.apiCallsMade === 0) return 0;
    return Math.round(this.metrics.totalResponseTime / this.metrics.apiCallsMade);
  }

  /**
   * Reset metrics (useful for testing or periodic resets)
   */
  async resetMetrics() {
    this.metrics = {
      ...DEFAULT_METRICS,
      lastResetDate: nowTimestamp(),
    };
    await this.saveMetrics();
    console.log('[PerfMonitor] Metrics reset');
  }

  /**
   * Save metrics to AsyncStorage
   */
  private async saveMetrics() {
    try {
      await AsyncStorage.setItem(METRICS_KEY, JSON.stringify(this.metrics));
    } catch (error) {
      console.error('[PerfMonitor] Failed to save metrics:', error);
    }
  }

  /**
   * Log current stats to console (for debugging)
   */
  logStats() {
    const stats = this.getStats();
    console.log('[PerfMonitor] Performance Stats:', {
      quickResponses: stats.quickResponsesServed,
      apiCalls: stats.apiCallsMade,
      quickResponseRate: `${stats.quickResponseRate.toFixed(1)}%`,
      avgResponseTime: `${stats.averageResponseTime}ms`,
      costSavings: `$${stats.estimatedCostSavings.toFixed(3)}`,
      timeSaved: `${stats.timeSavedSeconds}s`,
    });
  }
}

// Singleton instance
export const perfMonitor = new ChatPerformanceMonitor();
