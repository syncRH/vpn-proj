/**
 * Server Selector Module
 * Automatically selects best VPN server based on ping, speed, or geolocation
 */
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const util = require('util');

// Promisify exec
const execPromise = util.promisify(exec);

class ServerSelector {
  constructor(options = {}) {
    // Configuration
    this.options = {
      cacheTime: options.cacheTime || 3600000, // Cache test results for 1 hour by default
      pingTestCount: options.pingTestCount || 3,
      speedTestTimeout: options.speedTestTimeout || 10000, // 10 seconds for speed test
      preferredLocation: options.preferredLocation || null,
      priorityMetric: options.priorityMetric || 'auto', // 'ping', 'speed', 'location', or 'auto'
      ...options
    };
    
    // State
    this.cachedResults = {};
    this.lastTestTime = null;
    this.isRunningTests = false;
    
    // Path for caching results
    this.cacheDir = path.join(os.homedir(), '.vpn-client');
    this.cachePath = path.join(this.cacheDir, 'server-tests-cache.json');
    
    // Create cache directory if it doesn't exist
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    
    // Load cached results if available
    this._loadCachedResults();
  }
  
  /**
   * Select best server from available servers
   * @param {Array} servers - List of available VPN servers
   * @param {Object} options - Selection options (can override defaults)
   * @returns {Promise<Object>} Selected server and selection metrics
   */
  async selectBestServer(servers, options = {}) {
    const selectionOptions = { ...this.options, ...options };
    
    if (!servers || !Array.isArray(servers) || servers.length === 0) {
      throw new Error('No servers provided for selection');
    }
    
    console.log(`Selecting best server from ${servers.length} servers using ${selectionOptions.priorityMetric} priority`);
    
    try {
      // Check if we should use cached results
      const shouldUseCache = this._shouldUseCache();
      let testResults;
      
      if (shouldUseCache) {
        console.log('Using cached server test results');
        testResults = this.cachedResults;
      } else {
        // Run tests for all servers
        console.log('Running server tests...');
        testResults = await this._testServers(servers);
        
        // Cache the results
        this.cachedResults = testResults;
        this.lastTestTime = Date.now();
        this._saveCachedResults();
      }
      
      // Apply selection algorithm
      const selectedServer = this._selectOptimalServer(servers, testResults, selectionOptions);
      
      console.log(`Selected server: ${selectedServer.name} (${selectedServer.location})`);
      return {
        server: selectedServer,
        metrics: testResults[selectedServer.id] || {},
        usingCachedResults: shouldUseCache
      };
    } catch (error) {
      console.error('Error selecting best server:', error);
      
      // Fallback to first server in the list if there's an error
      console.log('Falling back to first available server');
      return {
        server: servers[0],
        metrics: {},
        error: error.message,
        usingFallback: true
      };
    }
  }
  
  /**
   * Force testing of all servers, ignoring cache
   * @param {Array} servers - List of available VPN servers
   * @returns {Promise<Object>} Test results for all servers
   */
  async forceTestServers(servers) {
    if (this.isRunningTests) {
      throw new Error('Server tests are already running');
    }
    
    if (!servers || !Array.isArray(servers) || servers.length === 0) {
      throw new Error('No servers provided for testing');
    }
    
    console.log(`Force testing ${servers.length} servers...`);
    
    // Run tests on all servers
    const results = await this._testServers(servers);
    
    // Update cache
    this.cachedResults = results;
    this.lastTestTime = Date.now();
    this._saveCachedResults();
    
    return results;
  }
  
  /**
   * Clear cached server test results
   */
  clearCache() {
    this.cachedResults = {};
    this.lastTestTime = null;
    
    try {
      if (fs.existsSync(this.cachePath)) {
        fs.unlinkSync(this.cachePath);
      }
      console.log('Server test cache cleared');
      return true;
    } catch (error) {
      console.error('Error clearing server test cache:', error);
      return false;
    }
  }
  
  /**
   * Get the user's current location
   * @returns {Promise<Object>} Location information
   */
  async getUserLocation() {
    try {
      return new Promise((resolve, reject) => {
        const req = https.get('https://ipinfo.io/json', (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              const locationInfo = JSON.parse(data);
              console.log('User location detected:', locationInfo.country, locationInfo.city);
              resolve(locationInfo);
            } catch (error) {
              reject(new Error(`Error parsing location data: ${error.message}`));
            }
          });
        });
        
        req.on('error', (error) => {
          reject(new Error(`Error getting location: ${error.message}`));
        });
        
        req.end();
      });
    } catch (error) {
      console.error('Error detecting user location:', error);
      throw error;
    }
  }
  
  // Private methods
  
  /**
   * Check if cached results should be used
   * @returns {boolean} True if cache should be used
   * @private
   */
  _shouldUseCache() {
    if (!this.lastTestTime || Object.keys(this.cachedResults).length === 0) {
      return false;
    }
    
    const now = Date.now();
    const cacheAge = now - this.lastTestTime;
    
    return cacheAge < this.options.cacheTime;
  }
  
  /**
   * Load cached test results from file
   * @private
   */
  _loadCachedResults() {
    try {
      if (fs.existsSync(this.cachePath)) {
        const cacheData = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
        
        if (cacheData && cacheData.results && cacheData.timestamp) {
          this.cachedResults = cacheData.results;
          this.lastTestTime = cacheData.timestamp;
          
          console.log(`Loaded cached server test results from ${new Date(this.lastTestTime).toLocaleString()}`);
          
          // Check if cache is expired
          if (!this._shouldUseCache()) {
            console.log('Cached results are expired');
            this.cachedResults = {};
            this.lastTestTime = null;
          }
        }
      }
    } catch (error) {
      console.error('Error loading cached server test results:', error);
      this.cachedResults = {};
      this.lastTestTime = null;
    }
  }
  
  /**
   * Save test results to cache file
   * @private
   */
  _saveCachedResults() {
    try {
      const cacheData = {
        results: this.cachedResults,
        timestamp: this.lastTestTime
      };
      
      fs.writeFileSync(this.cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
      console.log('Saved server test results to cache');
    } catch (error) {
      console.error('Error saving server test results to cache:', error);
    }
  }
  
  /**
   * Test all provided servers for performance metrics
   * @param {Array} servers - List of VPN servers to test
   * @returns {Promise<Object>} Test results for all servers
   * @private
   */
  async _testServers(servers) {
    if (this.isRunningTests) {
      throw new Error('Server tests are already running');
    }
    
    this.isRunningTests = true;
    const results = {};
    
    try {
      // Get user location for distance calculation
      let userLocation = null;
      try {
        userLocation = await this.getUserLocation();
      } catch (locationError) {
        console.warn('Unable to determine user location:', locationError);
      }
      
      // Run tests for each server
      for (const server of servers) {
        try {
          console.log(`Testing server ${server.name} (${server.location})...`);
          
          // Run ping test
          const pingResult = await this._pingTest(server);
          
          // Calculate location score if user location is available
          let locationScore = null;
          if (userLocation && server.coordinates) {
            locationScore = this._calculateLocationScore(userLocation, server.coordinates);
          }
          
          // Speed test would require connecting to the VPN which is complex
          // For simplicity, we'll use server load as a proxy for speed
          const loadScore = server.load ? 100 - server.load : null;
          
          // Store results
          results[server.id] = {
            ping: pingResult,
            locationScore,
            loadScore,
            timestamp: Date.now()
          };
        } catch (serverError) {
          console.error(`Error testing server ${server.name}:`, serverError);
          // Store error but continue with other servers
          results[server.id] = {
            error: serverError.message,
            timestamp: Date.now()
          };
        }
      }
      
      this.isRunningTests = false;
      return results;
    } catch (error) {
      this.isRunningTests = false;
      throw error;
    }
  }
  
  /**
   * Run ping test for a server
   * @param {Object} server - Server to test
   * @returns {Promise<number>} Average ping time in ms
   * @private
   */
  async _pingTest(server) {
    return new Promise((resolve, reject) => {
      const pingCount = this.options.pingTestCount;
      const host = server.hostname || server.ip;
      
      if (!host) {
        return reject(new Error('No hostname or IP available for ping test'));
      }
      
      const pingCommand = os.platform() === 'win32'
        ? `ping -n ${pingCount} ${host}`
        : `ping -c ${pingCount} ${host}`;
      
      exec(pingCommand, (error, stdout) => {
        if (error) {
          return reject(new Error(`Ping test failed: ${error.message}`));
        }
        
        try {
          let avgPing;
          
          if (os.platform() === 'win32') {
            // Parse Windows ping output
            const match = /Average = (\d+)ms/.exec(stdout);
            avgPing = match ? parseInt(match[1], 10) : null;
          } else {
            // Parse Unix ping output
            const match = /min\/avg\/max\/mdev = [\d.]+\/([\d.]+)\/[\d.]+\/[\d.]+/.exec(stdout);
            avgPing = match ? parseFloat(match[1]) : null;
          }
          
          if (avgPing === null) {
            return reject(new Error('Could not parse ping result'));
          }
          
          console.log(`Ping test for ${server.name}: ${avgPing}ms`);
          resolve(avgPing);
        } catch (parseError) {
          reject(new Error(`Error parsing ping results: ${parseError.message}`));
        }
      });
    });
  }
  
  /**
   * Calculate location score based on distance
   * @param {Object} userLocation - User's location
   * @param {Object} serverCoordinates - Server's coordinates
   * @returns {number} Location score (0-100, higher is better/closer)
   * @private
   */
  _calculateLocationScore(userLocation, serverCoordinates) {
    try {
      // Simple score based on same country
      if (userLocation.country === serverCoordinates.country) {
        return 100;
      }
      
      // If coordinates available, calculate distance-based score
      if (userLocation.loc && serverCoordinates.loc) {
        const [userLat, userLon] = userLocation.loc.split(',').map(Number);
        const [serverLat, serverLon] = serverCoordinates.loc.split(',').map(Number);
        
        // Calculate distance using Haversine formula
        const distance = this._calculateDistance(userLat, userLon, serverLat, serverLon);
        
        // Convert distance to score (0-100)
        // Assuming max reasonable distance is 15000km (half Earth circumference)
        const maxDistance = 15000;
        const score = Math.max(0, 100 - (distance / maxDistance * 100));
        
        return score;
      }
      
      // Fallback if no coordinates
      return 50; // Neutral score
    } catch (error) {
      console.error('Error calculating location score:', error);
      return 50; // Neutral score on error
    }
  }
  
  /**
   * Calculate distance between two geographic coordinates
   * @param {number} lat1 - Latitude of point 1
   * @param {number} lon1 - Longitude of point 1
   * @param {number} lat2 - Latitude of point 2
   * @param {number} lon2 - Longitude of point 2
   * @returns {number} Distance in kilometers
   * @private
   */
  _calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this._toRadians(lat2 - lat1);
    const dLon = this._toRadians(lon2 - lon1);
    
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this._toRadians(lat1)) * Math.cos(this._toRadians(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
      
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  /**
   * Convert degrees to radians
   * @param {number} degrees - Value in degrees
   * @returns {number} Value in radians
   * @private
   */
  _toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }
  
  /**
   * Select optimal server from test results
   * @param {Array} servers - Available servers
   * @param {Object} testResults - Test results for servers
   * @param {Object} options - Selection options
   * @returns {Object} Selected server
   * @private
   */
  _selectOptimalServer(servers, testResults, options) {
    const { priorityMetric, preferredLocation } = options;
    
    // Filter servers with test results
    const serversWithResults = servers.filter(server => 
      testResults[server.id] && !testResults[server.id].error);
    
    if (serversWithResults.length === 0) {
      console.warn('No servers with valid test results, falling back to first server');
      return servers[0];
    }
    
    // If location is specified and priority is location, try to find a server in that location
    if (preferredLocation && priorityMetric === 'location') {
      const locationServer = servers.find(server => 
        server.location && server.location.toLowerCase().includes(preferredLocation.toLowerCase()));
      
      if (locationServer) {
        console.log(`Selected server based on preferred location: ${preferredLocation}`);
        return locationServer;
      }
    }
    
    // Select based on the specified metric
    if (priorityMetric === 'ping') {
      // Sort by ping (lower is better)
      serversWithResults.sort((a, b) => {
        const pingA = testResults[a.id]?.ping || Infinity;
        const pingB = testResults[b.id]?.ping || Infinity;
        return pingA - pingB;
      });
      
      console.log(`Selected server based on best ping: ${serversWithResults[0].name} (${testResults[serversWithResults[0].id].ping}ms)`);
      return serversWithResults[0];
    } else if (priorityMetric === 'speed' || priorityMetric === 'load') {
      // Sort by load score (higher is better)
      serversWithResults.sort((a, b) => {
        const loadA = testResults[a.id]?.loadScore || 0;
        const loadB = testResults[b.id]?.loadScore || 0;
        return loadB - loadA;
      });
      
      console.log(`Selected server based on load/speed: ${serversWithResults[0].name} (score: ${testResults[serversWithResults[0].id].loadScore})`);
      return serversWithResults[0];
    } else if (priorityMetric === 'location' && !preferredLocation) {
      // Sort by location score (higher is better)
      serversWithResults.sort((a, b) => {
        const scoreA = testResults[a.id]?.locationScore || 0;
        const scoreB = testResults[b.id]?.locationScore || 0;
        return scoreB - scoreA;
      });
      
      console.log(`Selected server based on location: ${serversWithResults[0].name} (score: ${testResults[serversWithResults[0].id].locationScore})`);
      return serversWithResults[0];
    } else {
      // Auto mode - calculate a weighted score
      serversWithResults.forEach(server => {
        const result = testResults[server.id];
        let pingScore = 0;
        let locationScore = 0;
        let loadScore = 0;
        
        // Normalize ping score (lower is better)
        if (result.ping !== undefined) {
          // Convert ping to 0-100 score (0ms = 100, 300ms = 0)
          pingScore = Math.max(0, 100 - (result.ping / 3));
        }
        
        // Use location score directly
        if (result.locationScore !== undefined) {
          locationScore = result.locationScore;
        }
        
        // Use load score directly
        if (result.loadScore !== undefined) {
          loadScore = result.loadScore;
        }
        
        // Calculate weighted total (ping is most important)
        result.totalScore = pingScore * 0.5 + locationScore * 0.3 + loadScore * 0.2;
      });
      
      // Sort by total score (higher is better)
      serversWithResults.sort((a, b) => {
        const scoreA = testResults[a.id]?.totalScore || 0;
        const scoreB = testResults[b.id]?.totalScore || 0;
        return scoreB - scoreA;
      });
      
      console.log(`Selected server based on weighted score: ${serversWithResults[0].name} (score: ${testResults[serversWithResults[0].id].totalScore.toFixed(2)})`);
      return serversWithResults[0];
    }
  }
}

module.exports = ServerSelector;
