/**
 * Connection Stability Module
 * Provides automatic reconnection when VPN connection drops
 */
const { exec } = require('child_process');
const os = require('os');
const EventEmitter = require('events');

class ConnectionStability extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configuration
    this.options = {
      checkInterval: options.checkInterval || 5000, // Check every 5 seconds by default
      maxRetries: options.maxRetries || 3,          // Maximum number of reconnection attempts
      retryDelay: options.retryDelay || 3000,       // Delay between retries (ms)
      pingHost: options.pingHost || '8.8.8.8',      // Host to ping for connectivity check
      ...options
    };
    
    // State
    this.connectionTimer = null;
    this.isMonitoring = false;
    this.reconnectAttempts = 0;
    this.lastConnectedTime = null;
    this.isReconnecting = false;
    this.vpnInterface = null;
    this.vpnConfig = null;
    this.connectCallback = null;
  }
  
  /**
   * Start monitoring connection stability
   * @param {Object} vpnInfo - Info about current VPN connection
   * @param {Function} connectCallback - Function to call to reconnect
   */
  startMonitoring(vpnInfo, connectCallback) {
    if (this.isMonitoring) {
      console.log('Connection stability monitoring is already active');
      return;
    }
    
    console.log('Starting connection stability monitoring');
    
    this.vpnInterface = vpnInfo.interface;
    this.vpnConfig = vpnInfo.config;
    this.connectCallback = connectCallback;
    this.lastConnectedTime = Date.now();
    this.isMonitoring = true;
    this.reconnectAttempts = 0;
    
    // Start the connection check timer
    this._startConnectionTimer();
    
    this.emit('monitoring:started', {
      timestamp: new Date().toISOString(),
      checkInterval: this.options.checkInterval,
      vpnInterface: this.vpnInterface
    });
  }
  
  /**
   * Stop monitoring connection stability
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }
    
    console.log('Stopping connection stability monitoring');
    
    this._clearConnectionTimer();
    this.isMonitoring = false;
    this.reconnectAttempts = 0;
    
    this.emit('monitoring:stopped', {
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Start connection check timer
   * @private
   */
  _startConnectionTimer() {
    this._clearConnectionTimer();
    
    this.connectionTimer = setInterval(() => {
      this._checkConnection();
    }, this.options.checkInterval);
  }
  
  /**
   * Clear connection check timer
   * @private
   */
  _clearConnectionTimer() {
    if (this.connectionTimer) {
      clearInterval(this.connectionTimer);
      this.connectionTimer = null;
    }
  }
  
  /**
   * Check if VPN connection is still active
   * @private
   */
  async _checkConnection() {
    if (this.isReconnecting) {
      return;
    }
    
    try {
      const isConnected = await this._isVpnConnected();
      
      if (isConnected) {
        // Connection is good
        this.lastConnectedTime = Date.now();
        this.reconnectAttempts = 0;
      } else {
        // Connection is down, attempt to reconnect
        console.warn('VPN connection appears to be down, attempting to reconnect');
        
        this.emit('connection:lost', {
          timestamp: new Date().toISOString(),
          lastConnectedTime: new Date(this.lastConnectedTime).toISOString(),
          reconnectAttempts: this.reconnectAttempts
        });
        
        this._attemptReconnect();
      }
    } catch (error) {
      console.error('Error checking VPN connection:', error);
    }
  }
  
  /**
   * Check if VPN is currently connected
   * @private
   * @returns {Promise<boolean>}
   */
  _isVpnConnected() {
    return new Promise((resolve) => {
      // Simple ping test to check connectivity
      const pingCommand = os.platform() === 'win32' 
        ? `ping -n 1 -w 2000 ${this.options.pingHost}`
        : `ping -c 1 -W 2 ${this.options.pingHost}`;
      
      exec(pingCommand, (error) => {
        // If ping succeeds, we have connectivity
        resolve(!error);
      });
    });
  }
  
  /**
   * Attempt to reconnect to VPN
   * @private
   */
  async _attemptReconnect() {
    if (this.isReconnecting || !this.connectCallback) {
      return;
    }
    
    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.options.maxRetries}`);
    
    this.emit('reconnect:attempt', {
      timestamp: new Date().toISOString(),
      attempt: this.reconnectAttempts,
      maxRetries: this.options.maxRetries
    });
    
    try {
      // Call the provided reconnect function
      await this.connectCallback(this.vpnConfig);
      
      console.log('VPN reconnection successful');
      this.lastConnectedTime = Date.now();
      this.isReconnecting = false;
      
      this.emit('reconnect:success', {
        timestamp: new Date().toISOString(),
        attempts: this.reconnectAttempts
      });
    } catch (error) {
      console.error('VPN reconnection failed:', error);
      this.isReconnecting = false;
      
      this.emit('reconnect:failed', {
        timestamp: new Date().toISOString(),
        attempt: this.reconnectAttempts,
        error: error.message
      });
      
      // Check if we've reached max retries
      if (this.reconnectAttempts >= this.options.maxRetries) {
        console.error('Maximum reconnection attempts reached, giving up');
        
        this.emit('reconnect:max_retries', {
          timestamp: new Date().toISOString(),
          maxRetries: this.options.maxRetries
        });
        
        this.stopMonitoring();
        return;
      }
      
      // Try again after delay
      setTimeout(() => {
        if (this.isMonitoring) {
          this._attemptReconnect();
        }
      }, this.options.retryDelay);
    }
  }
  
  /**
   * Get current stability status
   * @returns {Object} Stability status information
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      isReconnecting: this.isReconnecting,
      lastConnectedTime: this.lastConnectedTime ? new Date(this.lastConnectedTime) : null,
      reconnectAttempts: this.reconnectAttempts,
      maxRetries: this.options.maxRetries,
      checkInterval: this.options.checkInterval
    };
  }
}

module.exports = ConnectionStability;
