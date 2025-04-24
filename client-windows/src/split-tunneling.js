/**
 * Split Tunneling Module
 * Allows selective routing of apps/websites through VPN
 */
const { exec, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dns = require('dns');
const util = require('util');

// Convert callback-based functions to Promise-based
const execPromise = util.promisify(exec);
const dnsResolve4 = util.promisify(dns.resolve4);

class SplitTunneling {
  constructor() {
    this.platform = os.platform();
    this.enabled = false;
    this.bypassList = [];
    this.appsList = [];
    this.routesAdded = [];
    this.configDir = path.join(os.homedir(), '.vpn-client');
    this.configPath = path.join(this.configDir, 'split-tunnel-config.json');
    
    // Create config directory if it doesn't exist
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // Load saved configuration if exists
    this._loadConfiguration();
  }
  
  /**
   * Enable split tunneling with the current configuration
   * @param {string} vpnInterface - Name of the VPN interface
   * @returns {Promise<Object>} Result of operation
   */
  async enable(vpnInterface) {
    if (this.enabled) {
      return { success: true, message: 'Split tunneling is already enabled' };
    }
    
    try {
      console.log('Enabling split tunneling...');
      
      if (this.platform === 'win32') {
        await this._enableWindows(vpnInterface);
      } else if (this.platform === 'linux') {
        await this._enableLinux(vpnInterface);
      } else if (this.platform === 'darwin') {
        await this._enableMacOS(vpnInterface);
      } else {
        throw new Error(`Unsupported platform: ${this.platform}`);
      }
      
      this.enabled = true;
      return { success: true, message: 'Split tunneling enabled successfully' };
    } catch (error) {
      console.error('Failed to enable split tunneling:', error);
      return { success: false, message: `Failed to enable split tunneling: ${error.message}` };
    }
  }
  
  /**
   * Disable split tunneling
   * @returns {Promise<Object>} Result of operation
   */
  async disable() {
    if (!this.enabled) {
      return { success: true, message: 'Split tunneling is already disabled' };
    }
    
    try {
      console.log('Disabling split tunneling...');
      
      if (this.platform === 'win32') {
        await this._disableWindows();
      } else if (this.platform === 'linux') {
        await this._disableLinux();
      } else if (this.platform === 'darwin') {
        await this._disableMacOS();
      } else {
        throw new Error(`Unsupported platform: ${this.platform}`);
      }
      
      this.enabled = false;
      return { success: true, message: 'Split tunneling disabled successfully' };
    } catch (error) {
      console.error('Failed to disable split tunneling:', error);
      return { success: false, message: `Failed to disable split tunneling: ${error.message}` };
    }
  }
  
  /**
   * Add a domain to the bypass list (not routed through VPN)
   * @param {string} domain - Domain name to bypass
   * @returns {Promise<Object>} Result of operation
   */
  async addDomainToBypass(domain) {
    try {
      if (!domain || typeof domain !== 'string') {
        throw new Error('Invalid domain name');
      }
      
      // Clean domain format
      domain = domain.toLowerCase().trim();
      
      // Check if domain is already in the list
      if (this.bypassList.includes(domain)) {
        return { success: true, message: `Domain ${domain} is already in the bypass list` };
      }
      
      // Resolve domain to IP addresses
      try {
        const ipAddresses = await dnsResolve4(domain);
        console.log(`Resolved ${domain} to: ${ipAddresses.join(', ')}`);
        
        // Add IPs to bypass routes if split tunneling is already enabled
        if (this.enabled) {
          for (const ip of ipAddresses) {
            await this._bypassIpRoute(ip);
          }
        }
        
        // Add to bypass list
        this.bypassList.push(domain);
        this._saveConfiguration();
        
        return { 
          success: true, 
          message: `Added ${domain} to bypass list`,
          ipAddresses
        };
      } catch (dnsError) {
        console.error(`Failed to resolve domain ${domain}:`, dnsError);
        return { success: false, message: `Failed to resolve domain ${domain}: ${dnsError.message}` };
      }
    } catch (error) {
      console.error('Error adding domain to bypass list:', error);
      return { success: false, message: `Error adding domain to bypass list: ${error.message}` };
    }
  }
  
  /**
   * Remove a domain from the bypass list
   * @param {string} domain - Domain name to remove from bypass
   * @returns {Promise<Object>} Result of operation
   */
  async removeDomainFromBypass(domain) {
    try {
      if (!domain || typeof domain !== 'string') {
        throw new Error('Invalid domain name');
      }
      
      // Clean domain format
      domain = domain.toLowerCase().trim();
      
      // Check if domain is in the list
      const index = this.bypassList.indexOf(domain);
      if (index === -1) {
        return { success: true, message: `Domain ${domain} is not in the bypass list` };
      }
      
      // Remove from bypass list
      this.bypassList.splice(index, 1);
      this._saveConfiguration();
      
      // If split tunneling is enabled, update routes
      if (this.enabled) {
        // This would require reapplying all routes, which can be complex
        // For simplicity, we'll just notify the user to disable and re-enable
        return {
          success: true,
          message: `Removed ${domain} from bypass list. Please disable and re-enable split tunneling for changes to take effect.`
        };
      }
      
      return { success: true, message: `Removed ${domain} from bypass list` };
    } catch (error) {
      console.error('Error removing domain from bypass list:', error);
      return { success: false, message: `Error removing domain from bypass list: ${error.message}` };
    }
  }
  
  /**
   * Add an application to the VPN-only list
   * @param {string} appPath - Path to the application executable
   * @returns {Promise<Object>} Result of operation
   */
  async addAppToVpnOnly(appPath) {
    try {
      if (!appPath || typeof appPath !== 'string') {
        throw new Error('Invalid application path');
      }
      
      // Check if file exists
      if (!fs.existsSync(appPath)) {
        return { success: false, message: `Application not found at path: ${appPath}` };
      }
      
      // Check if app is already in the list
      if (this.appsList.includes(appPath)) {
        return { success: true, message: `Application ${appPath} is already in the VPN-only list` };
      }
      
      // Add to apps list
      this.appsList.push(appPath);
      this._saveConfiguration();
      
      // If split tunneling is enabled, update app routing
      if (this.enabled) {
        if (this.platform === 'win32') {
          // On Windows, we can use AppLocker or other methods to force apps through VPN
          // This is more complex and may require administrative privileges
        }
        
        return {
          success: true,
          message: `Added ${appPath} to VPN-only list. Please disable and re-enable split tunneling for changes to take effect.`
        };
      }
      
      return { success: true, message: `Added ${appPath} to VPN-only list` };
    } catch (error) {
      console.error('Error adding application to VPN-only list:', error);
      return { success: false, message: `Error adding application to VPN-only list: ${error.message}` };
    }
  }
  
  /**
   * Remove an application from the VPN-only list
   * @param {string} appPath - Path to the application executable
   * @returns {Promise<Object>} Result of operation
   */
  async removeAppFromVpnOnly(appPath) {
    try {
      if (!appPath || typeof appPath !== 'string') {
        throw new Error('Invalid application path');
      }
      
      // Check if app is in the list
      const index = this.appsList.indexOf(appPath);
      if (index === -1) {
        return { success: true, message: `Application ${appPath} is not in the VPN-only list` };
      }
      
      // Remove from apps list
      this.appsList.splice(index, 1);
      this._saveConfiguration();
      
      // If split tunneling is enabled, update app routing
      if (this.enabled) {
        return {
          success: true,
          message: `Removed ${appPath} from VPN-only list. Please disable and re-enable split tunneling for changes to take effect.`
        };
      }
      
      return { success: true, message: `Removed ${appPath} from VPN-only list` };
    } catch (error) {
      console.error('Error removing application from VPN-only list:', error);
      return { success: false, message: `Error removing application from VPN-only list: ${error.message}` };
    }
  }
  
  /**
   * Get the current split tunneling configuration
   * @returns {Object} Current configuration
   */
  getConfiguration() {
    return {
      enabled: this.enabled,
      bypassList: [...this.bypassList],
      appsList: [...this.appsList]
    };
  }
  
  // Private methods
  
  /**
   * Load saved configuration from file
   * @private
   */
  _loadConfiguration() {
    try {
      if (fs.existsSync(this.configPath)) {
        const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        this.bypassList = config.bypassList || [];
        this.appsList = config.appsList || [];
        console.log('Loaded split tunneling configuration:', { 
          bypassDomains: this.bypassList.length, 
          vpnOnlyApps: this.appsList.length 
        });
      }
    } catch (error) {
      console.error('Error loading split tunneling configuration:', error);
      // Initialize with empty lists if there's an error
      this.bypassList = [];
      this.appsList = [];
    }
  }
  
  /**
   * Save configuration to file
   * @private
   */
  _saveConfiguration() {
    try {
      const config = {
        bypassList: this.bypassList,
        appsList: this.appsList
      };
      
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log('Saved split tunneling configuration');
    } catch (error) {
      console.error('Error saving split tunneling configuration:', error);
    }
  }
  
  /**
   * Add a bypass route for a specific IP address
   * @param {string} ip - IP address to bypass VPN
   * @private
   */
  async _bypassIpRoute(ip) {
    try {
      if (this.platform === 'win32') {
        // On Windows, route traffic directly to default gateway for bypassed IPs
        const { stdout } = await execPromise('route print 0.0.0.0 mask 0.0.0.0');
        const gatewayMatch = /\s+0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)/.exec(stdout);
        
        if (gatewayMatch && gatewayMatch[1]) {
          const gateway = gatewayMatch[1];
          await execPromise(`route add ${ip} mask 255.255.255.255 ${gateway} metric 1`);
          this.routesAdded.push(ip);
        } else {
          throw new Error('Could not find default gateway');
        }
      } else if (this.platform === 'linux' || this.platform === 'darwin') {
        // On Linux/macOS, directly route the IP via the default gateway
        const { stdout } = await execPromise('ip route | grep default');
        const gatewayMatch = /default via (\d+\.\d+\.\d+\.\d+) dev (\w+)/.exec(stdout);
        
        if (gatewayMatch && gatewayMatch[1] && gatewayMatch[2]) {
          const [, gateway, interface] = gatewayMatch;
          await execPromise(`ip route add ${ip}/32 via ${gateway} dev ${interface}`);
          this.routesAdded.push(ip);
        } else {
          throw new Error('Could not find default gateway');
        }
      }
    } catch (error) {
      console.error(`Error adding bypass route for IP ${ip}:`, error);
      throw error;
    }
  }
  
  /**
   * Enable split tunneling on Windows
   * @param {string} vpnInterface - VPN interface name
   * @private
   */
  async _enableWindows(vpnInterface) {
    try {
      // For each domain in the bypass list, resolve and add routes
      for (const domain of this.bypassList) {
        try {
          const ipAddresses = await dnsResolve4(domain);
          for (const ip of ipAddresses) {
            await this._bypassIpRoute(ip);
          }
        } catch (dnsError) {
          console.error(`Failed to resolve domain ${domain}:`, dnsError);
        }
      }
      
      // For application-based split tunneling, more complex solutions like
      // packet filtering or third-party tools would be needed
      
      console.log('Split tunneling enabled on Windows');
    } catch (error) {
      console.error('Error enabling split tunneling on Windows:', error);
      throw error;
    }
  }
  
  /**
   * Enable split tunneling on Linux
   * @param {string} vpnInterface - VPN interface name
   * @private
   */
  async _enableLinux(vpnInterface) {
    try {
      // Similar approach to Windows, but using Linux-specific commands
      for (const domain of this.bypassList) {
        try {
          const ipAddresses = await dnsResolve4(domain);
          for (const ip of ipAddresses) {
            await this._bypassIpRoute(ip);
          }
        } catch (dnsError) {
          console.error(`Failed to resolve domain ${domain}:`, dnsError);
        }
      }
      
      console.log('Split tunneling enabled on Linux');
    } catch (error) {
      console.error('Error enabling split tunneling on Linux:', error);
      throw error;
    }
  }
  
  /**
   * Enable split tunneling on macOS
   * @param {string} vpnInterface - VPN interface name
   * @private
   */
  async _enableMacOS(vpnInterface) {
    try {
      // Similar approach to other platforms, but using macOS-specific commands
      for (const domain of this.bypassList) {
        try {
          const ipAddresses = await dnsResolve4(domain);
          for (const ip of ipAddresses) {
            await this._bypassIpRoute(ip);
          }
        } catch (dnsError) {
          console.error(`Failed to resolve domain ${domain}:`, dnsError);
        }
      }
      
      console.log('Split tunneling enabled on macOS');
    } catch (error) {
      console.error('Error enabling split tunneling on macOS:', error);
      throw error;
    }
  }
  
  /**
   * Disable split tunneling on Windows
   * @private
   */
  async _disableWindows() {
    try {
      // Remove all added routes
      for (const ip of this.routesAdded) {
        try {
          await execPromise(`route delete ${ip}`);
        } catch (routeError) {
          console.error(`Error removing route for ${ip}:`, routeError);
        }
      }
      
      this.routesAdded = [];
      console.log('Split tunneling disabled on Windows');
    } catch (error) {
      console.error('Error disabling split tunneling on Windows:', error);
      throw error;
    }
  }
  
  /**
   * Disable split tunneling on Linux
   * @private
   */
  async _disableLinux() {
    try {
      // Remove all added routes
      for (const ip of this.routesAdded) {
        try {
          await execPromise(`ip route del ${ip}/32`);
        } catch (routeError) {
          console.error(`Error removing route for ${ip}:`, routeError);
        }
      }
      
      this.routesAdded = [];
      console.log('Split tunneling disabled on Linux');
    } catch (error) {
      console.error('Error disabling split tunneling on Linux:', error);
      throw error;
    }
  }
  
  /**
   * Disable split tunneling on macOS
   * @private
   */
  async _disableMacOS() {
    try {
      // Remove all added routes
      for (const ip of this.routesAdded) {
        try {
          await execPromise(`route -n delete ${ip}/32`);
        } catch (routeError) {
          console.error(`Error removing route for ${ip}:`, routeError);
        }
      }
      
      this.routesAdded = [];
      console.log('Split tunneling disabled on macOS');
    } catch (error) {
      console.error('Error disabling split tunneling on macOS:', error);
      throw error;
    }
  }
}

module.exports = SplitTunneling;
