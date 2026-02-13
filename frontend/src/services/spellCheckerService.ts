/**
 * Spell Checker Service
 * 
 * Provides spell checking capabilities with support for custom dictionaries
 * and ignore lists.
 */

import { API_BASE_URL } from '../api/client';

export interface SpellingSuggestion {
  word: string;
  suggestions: string[];
  position: number;
  context: string;
}

export interface SpellCheckResult {
  misspellings: SpellingSuggestion[];
}

export class SpellCheckerService {
  private baseUrl: string;
  
  constructor() {
    this.baseUrl = `${API_BASE_URL}/api/v1/text-editor`;
  }
  
  /**
   * Check spelling of text and return suggestions
   */
  async checkText(text: string): Promise<SpellCheckResult> {
    const response = await fetch(`${this.baseUrl}/spell-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to check spelling: ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
      misspellings: data.misspellings,
    };
  }
  
  /**
   * Add a word to the custom dictionary
   */
  async addToDictionary(word: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/spell-check/add-word`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to add word to dictionary: ${response.statusText}`);
    }
  }
  
  /**
   * Add a word to the ignore list for current session
   */
  async ignoreWord(word: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/spell-check/ignore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to ignore word: ${response.statusText}`);
    }
  }
  
  /**
   * Debounced spell check - useful for real-time checking while typing
   */
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  
  async checkTextDebounced(
    text: string,
    callback: (result: SpellCheckResult) => void,
    delay: number = 500,
    key: string = 'default'
  ): Promise<void> {
    // Clear existing timer for this key
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Set new timer
    const timer = setTimeout(async () => {
      try {
        const result = await this.checkText(text);
        callback(result);
      } catch (error) {
        console.error('Spell check error:', error);
      } finally {
        this.debounceTimers.delete(key);
      }
    }, delay);
    
    this.debounceTimers.set(key, timer);
  }
  
  /**
   * Cancel a pending debounced spell check
   */
  cancelDebounced(key: string = 'default'): void {
    const timer = this.debounceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(key);
    }
  }
}

// Export singleton instance
export const spellCheckerService = new SpellCheckerService();
