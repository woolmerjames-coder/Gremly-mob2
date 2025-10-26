import AsyncStorage from '@react-native-async-storage/async-storage';

interface SearchableMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  type?: 'habit' | 'note' | 'task' | 'person';
  metadata?: any;
}

class MessageSearchIndex {
  private index: SearchableMessage[] = [];
  private readonly INDEX_KEY = '@gremly/chat_search_index';
  private readonly MAX_INDEX_SIZE = 1000;

  async initialize() {
    try {
      const saved = await AsyncStorage.getItem(this.INDEX_KEY);
      if (saved) {
        this.index = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load search index:', error);
    }
  }

  async addMessage(message: SearchableMessage) {
    // Add to index
    this.index.push({
      id: message.id,
      content: message.content.toLowerCase(), // Store lowercase for searching
      role: message.role,
      timestamp: message.timestamp,
      type: message.type,
      metadata: message.metadata,
    });

    // Trim if too large (keep recent messages)
    if (this.index.length > this.MAX_INDEX_SIZE) {
      this.index = this.index.slice(-this.MAX_INDEX_SIZE);
    }

    await this.persist();
  }

  search(
    query: string,
    filters?: {
      type?: string;
      role?: 'user' | 'assistant';
      dateFrom?: number;
      dateTo?: number;
    },
  ): SearchableMessage[] {
    const searchTerms = query.toLowerCase().split(' ');

    const results = this.index.filter((msg) => {
      // Check if all search terms appear in content
      const matchesQuery = searchTerms.every((term) => msg.content.includes(term));

      if (!matchesQuery) return false;

      // Apply filters
      if (filters) {
        if (filters.type && msg.type !== filters.type) return false;
        if (filters.role && msg.role !== filters.role) return false;
        if (filters.dateFrom && msg.timestamp < filters.dateFrom) return false;
        if (filters.dateTo && msg.timestamp > filters.dateTo) return false;
      }

      return true;
    });

    // Sort by relevance (how many terms match) and recency
    results.sort((a, b) => {
      const aMatches = searchTerms.filter((term) => a.content.includes(term)).length;
      const bMatches = searchTerms.filter((term) => b.content.includes(term)).length;

      if (aMatches !== bMatches) {
        return bMatches - aMatches; // More matches first
      }

      return b.timestamp - a.timestamp; // More recent first
    });

    return results.slice(0, 50); // Limit results
  }

  getRecentByType(type: string, limit: number = 10): SearchableMessage[] {
    return this.index
      .filter((msg) => msg.type === type)
      .slice(-limit)
      .reverse();
  }

  private async persist() {
    try {
      await AsyncStorage.setItem(this.INDEX_KEY, JSON.stringify(this.index));
    } catch (error) {
      console.error('Failed to persist search index:', error);
    }
  }

  async clear() {
    this.index = [];
    await AsyncStorage.removeItem(this.INDEX_KEY);
  }
}

export const searchIndex = new MessageSearchIndex();
export type { SearchableMessage };
