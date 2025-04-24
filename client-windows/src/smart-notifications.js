/**
 * Smart Notifications Module
 * Provides intelligent notification management for VPN client
 */
const { Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

class SmartNotifications {
  constructor(options = {}) {
    // Configuration
    this.options = {
      maxNotificationsPerMinute: options.maxNotificationsPerMinute || 3,
      quietHoursStart: options.quietHoursStart || 22, // 10 PM
      quietHoursEnd: options.quietHoursEnd || 7,      // 7 AM
      notificationTimeout: options.notificationTimeout || 5000,
      importanceThreshold: options.importanceThreshold || 3, // 1-5 scale
      groupSimilarNotifications: options.groupSimilarNotifications !== false,
      enableQuietHours: options.enableQuietHours !== false,
      ...options
    };
    
    // State
    this.notificationHistory = [];
    this.groupedNotifications = {};
    this.configDir = path.join(os.homedir(), '.vpn-client');
    this.configPath = path.join(this.configDir, 'notification-settings.json');
    this.iconPath = options.iconPath || null;
    
    // Create config directory if it doesn't exist
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // Load saved settings if exists
    this._loadSettings();
  }
  
  /**
   * Show a notification with smart filtering
   * @param {Object} notification - Notification object
   * @param {string} notification.title - Notification title
   * @param {string} notification.body - Notification body
   * @param {number} notification.importance - Importance level (1-5)
   * @param {string} notification.category - Notification category
   * @param {Function} notification.onClick - Click handler
   * @returns {boolean} Whether notification was shown
   */
  notify(notification) {
    if (!notification || !notification.title) {
      console.error('Invalid notification format');
      return false;
    }
    
    // Set defaults for missing properties
    const fullNotification = {
      importance: 3,
      category: 'general',
      ...notification,
      timestamp: Date.now()
    };
    
    // Add to history
    this.notificationHistory.push(fullNotification);
    
    // Apply smart filtering
    if (!this._shouldShowNotification(fullNotification)) {
      console.log('Notification filtered out by smart rules:', fullNotification.title);
      return false;
    }
    
    // Show the notification
    return this._showNotification(fullNotification);
  }
  
  /**
   * Update notification settings
   * @param {Object} settings - New settings
   * @returns {Object} Updated settings
   */
  updateSettings(settings) {
    this.options = {
      ...this.options,
      ...settings
    };
    
    this._saveSettings();
    return this.options;
  }
  
  /**
   * Get current notification settings
   * @returns {Object} Current settings
   */
  getSettings() {
    return { ...this.options };
  }
  
  /**
   * Clear notification history
   */
  clearHistory() {
    this.notificationHistory = [];
    this.groupedNotifications = {};
    console.log('Notification history cleared');
  }
  
  /**
   * Get notification history
   * @param {number} limit - Maximum number of history items to return
   * @returns {Array} Notification history
   */
  getHistory(limit = 50) {
    return this.notificationHistory
      .slice(-limit)
      .map(notification => ({
        title: notification.title,
        body: notification.body,
        category: notification.category,
        importance: notification.importance,
        timestamp: notification.timestamp
      }));
  }
  
  // Private methods
  
  /**
   * Determine if notification should be shown based on smart rules
   * @param {Object} notification - Notification to check
   * @returns {boolean} Whether notification should be shown
   * @private
   */
  _shouldShowNotification(notification) {
    // Check importance threshold
    if (notification.importance < this.options.importanceThreshold) {
      return false;
    }
    
    // Check quiet hours
    if (this.options.enableQuietHours && this._isInQuietHours()) {
      // Only show critical notifications during quiet hours
      if (notification.importance < 5) {
        return false;
      }
    }
    
    // Check rate limiting
    if (this._isRateLimited()) {
      // Still show critical notifications even when rate limited
      if (notification.importance < 5) {
        return false;
      }
    }
    
    // Check for similar notifications if grouping is enabled
    if (this.options.groupSimilarNotifications && this._isSimilarToRecent(notification)) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Check if within quiet hours
   * @returns {boolean} True if current time is within quiet hours
   * @private
   */
  _isInQuietHours() {
    const currentHour = new Date().getHours();
    const { quietHoursStart, quietHoursEnd } = this.options;
    
    if (quietHoursStart < quietHoursEnd) {
      // Simple case: quiet hours within the same day (e.g., 22-7)
      return currentHour >= quietHoursStart || currentHour < quietHoursEnd;
    } else {
      // Complex case: quiet hours span midnight (e.g., 22-7)
      return currentHour >= quietHoursStart || currentHour < quietHoursEnd;
    }
  }
  
  /**
   * Check if notifications are currently rate limited
   * @returns {boolean} True if rate limited
   * @private
   */
  _isRateLimited() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Count notifications in the last minute
    const recentCount = this.notificationHistory.filter(
      n => n.timestamp > oneMinuteAgo
    ).length;
    
    return recentCount >= this.options.maxNotificationsPerMinute;
  }
  
  /**
   * Check if notification is similar to a recent one
   * @param {Object} notification - Notification to check
   * @returns {boolean} True if similar notification was recently shown
   * @private
   */
  _isSimilarToRecent(notification) {
    const category = notification.category;
    const now = Date.now();
    
    // Check if we have a similar notification in the same category
    if (this.groupedNotifications[category]) {
      const lastGrouped = this.groupedNotifications[category];
      const timeSinceLast = now - lastGrouped.timestamp;
      
      // If less than 1 minute has passed, consider it similar
      if (timeSinceLast < 60000) {
        // Update the count for the grouped notification
        this.groupedNotifications[category].count = 
          (this.groupedNotifications[category].count || 1) + 1;
        return true;
      }
    }
    
    // Store this notification as the latest in its category
    this.groupedNotifications[category] = {
      title: notification.title,
      timestamp: now,
      count: 1
    };
    
    return false;
  }
  
  /**
   * Actually show the notification using Electron's Notification API
   * @param {Object} notification - Notification to show
   * @returns {boolean} Whether notification was shown
   * @private
   */
  _showNotification(notification) {
    try {
      const notificationOptions = {
        title: notification.title,
        body: notification.body,
        timeoutType: 'default',
        silent: false
      };
      
      // Add icon if provided
      if (this.iconPath) {
        notificationOptions.icon = this.iconPath;
      }
      
      // Check if this is a grouped notification
      const category = notification.category;
      if (this.groupedNotifications[category] && this.groupedNotifications[category].count > 1) {
        const count = this.groupedNotifications[category].count;
        notificationOptions.body = `${notification.body} (${count} similar notifications)`;
      }
      
      // Create and show notification
      const notify = new Notification(notificationOptions);
      
      // Add click handler if provided
      if (typeof notification.onClick === 'function') {
        notify.on('click', notification.onClick);
      }
      
      notify.show();
      console.log(`Showed notification: ${notification.title}`);
      return true;
    } catch (error) {
      console.error('Error showing notification:', error);
      return false;
    }
  }
  
  /**
   * Load notification settings from file
   * @private
   */
  _loadSettings() {
    try {
      if (fs.existsSync(this.configPath)) {
        const settings = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        
        if (settings) {
          // Merge saved settings with defaults
          this.options = {
            ...this.options,
            ...settings
          };
          
          console.log('Loaded notification settings');
        }
      }
    } catch (error) {
      console.error('Error loading notification settings:', error);
    }
  }
  
  /**
   * Save notification settings to file
   * @private
   */
  _saveSettings() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.options, null, 2), 'utf8');
      console.log('Saved notification settings');
    } catch (error) {
      console.error('Error saving notification settings:', error);
    }
  }
}

module.exports = SmartNotifications;
