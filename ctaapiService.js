const https = require('https');
const http = require('http');

class CTAAPIService {
  constructor() {
    this.baseUrl = process.env.CTAAPI_URL || 'http://jamess-mac-mini.local:3001';
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    this.endpoints = {
      transit: '/api/data',
      events: '/api/events', 
      tasks: '/api/habitica'
    };
  }

  async fetchWithCache(endpoint, cacheKey) {
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log(`[CTAAAPI] Using cached data for ${cacheKey}`);
      return cached.data;
    }

    try {
      const data = await this.makeRequest(endpoint);
      // Store in cache
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
      console.log(`[CTAAAPI] Fetched fresh data for ${cacheKey}`);
      return data;
    } catch (error) {
      console.error(`[CTAAAPI] Error fetching ${cacheKey}:`, error.message);
      
      // Return cached data if available, even if expired
      if (cached) {
        console.log(`[CTAAAPI] Using expired cache for ${cacheKey} due to error`);
        return cached.data;
      }
      
      // Return null if no cached data available
      return null;
    }
  }

  makeRequest(endpoint) {
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${endpoint}`;
      console.log(`[CTAAAPI] Making request to ${url}`);
      
      const request = http.get(url, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          } catch (parseError) {
            reject(new Error(`Failed to parse JSON: ${parseError.message}`));
          }
        });
      });

      request.on('error', (error) => {
        reject(error);
      });

      request.setTimeout(10000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  async getTransitData() {
    return this.fetchWithCache(this.endpoints.transit, 'transit');
  }

  async getEventsData() {
    return this.fetchWithCache(this.endpoints.events, 'events');
  }

  async getTasksData() {
    return this.fetchWithCache(this.endpoints.tasks, 'tasks');
  }

  // Transform CTA transit data to card format
  transformTransitData(data) {
    if (!data || !Array.isArray(data)) {
      return {
        title: "CTA Transit",
        content: "Transit data unavailable",
        items: []
      };
    }

    const items = data.slice(0, 5).map(stop => ({
      route: stop.route || 'Unknown Route',
      destination: stop.destination || 'Unknown Destination', 
      arrivalTime: stop.arrival_time || stop.arrivalTime || 'TBD',
      minutes: stop.minutes_away || stop.minutesAway || 'N/A'
    }));

    return {
      title: "CTA Transit",
      subtitle: `Next ${items.length} arrivals`,
      items,
      lastUpdated: new Date().toISOString()
    };
  }

  // Transform calendar events to card format
  transformEventsData(data) {
    if (!data || !Array.isArray(data)) {
      return {
        title: "Calendar Events",
        content: "No events available",
        items: []
      };
    }

    const items = data.slice(0, 5).map(event => ({
      title: event.title || event.summary || 'Untitled Event',
      time: event.start_time || event.startTime || event.start || 'TBD',
      description: event.description || '',
      location: event.location || ''
    }));

    return {
      title: "Upcoming Events",
      subtitle: `${items.length} events today`,
      items,
      lastUpdated: new Date().toISOString()
    };
  }

  // Transform Habitica tasks to card format
  transformTasksData(data) {
    if (!data) {
      return {
        title: "Habitica Tasks", 
        content: "Tasks unavailable",
        items: []
      };
    }

    // Handle both array format and object with tasks property
    const tasks = Array.isArray(data) ? data : (data.tasks || []);
    
    const items = tasks.slice(0, 5).map(task => ({
      title: task.text || task.title || 'Untitled Task',
      type: task.type || 'todo',
      priority: task.priority || 'normal',
      completed: task.completed || false,
      difficulty: task.difficulty || 1
    }));

    const completedCount = items.filter(task => task.completed).length;

    return {
      title: "Habitica Tasks",
      subtitle: `${completedCount}/${items.length} completed`,
      items,
      lastUpdated: new Date().toISOString()
    };
  }

  // Get all data and transform for cards
  async getAllCardData() {
    const [transitData, eventsData, tasksData] = await Promise.allSettled([
      this.getTransitData(),
      this.getEventsData(), 
      this.getTasksData()
    ]);

    return {
      transit: this.transformTransitData(
        transitData.status === 'fulfilled' ? transitData.value : null
      ),
      events: this.transformEventsData(
        eventsData.status === 'fulfilled' ? eventsData.value : null
      ),
      tasks: this.transformTasksData(
        tasksData.status === 'fulfilled' ? tasksData.value : null
      )
    };
  }

  // Clear cache (useful for testing)
  clearCache() {
    this.cache.clear();
    console.log('[CTAAAPI] Cache cleared');
  }
}

module.exports = new CTAAPIService();