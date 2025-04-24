/**
 * Kill Switch functionality for VPN Client
 * Blocks all internet traffic when VPN connection drops unexpectedly
 */
const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

class KillSwitch {
  constructor() {
    this.enabled = false;
    this.platform = os.platform();
    this.rulesApplied = false;
    this.originalSettings = null;
    this.appDataPath = null;
    this.backupPath = null;
    
    // Initialize paths
    if (process.env.APPDATA) {
      this.appDataPath = path.join(process.env.APPDATA, 'vpn-client');
    } else {
      this.appDataPath = path.join(os.homedir(), '.vpn-client');
    }
    
    this.backupPath = path.join(this.appDataPath, 'network-backup');
    
    // Ensure directory exists
    if (!fs.existsSync(this.appDataPath)) {
      fs.mkdirSync(this.appDataPath, { recursive: true });
    }
  }
  
  /**
   * Enable Kill Switch to block all non-VPN traffic
   * @param {string} vpnInterface - Name of the VPN interface
   * @param {function} callback - Callback to execute on completion
   */
  async enable(vpnInterface, callback) {
    if (this.enabled) {
      console.log('Kill Switch is already enabled');
      return callback && callback(null, { success: true, message: 'Kill Switch already enabled' });
    }
    
    try {
      console.log('Enabling Kill Switch...');
      
      // Backup current network settings before modifying
      await this._backupNetworkSettings();
      
      if (this.platform === 'win32') {
        await this._enableWindowsKillSwitch(vpnInterface);
      } else if (this.platform === 'linux') {
        await this._enableLinuxKillSwitch(vpnInterface);
      } else if (this.platform === 'darwin') {
        await this._enableMacOSKillSwitch(vpnInterface);
      } else {
        throw new Error(`Unsupported platform: ${this.platform}`);
      }
      
      this.enabled = true;
      this.rulesApplied = true;
      console.log('Kill Switch enabled successfully');
      
      return callback && callback(null, { 
        success: true, 
        message: 'Kill Switch enabled successfully' 
      });
    } catch (error) {
      console.error('Failed to enable Kill Switch:', error);
      return callback && callback(error, { 
        success: false, 
        message: `Failed to enable Kill Switch: ${error.message}` 
      });
    }
  }
  
  /**
   * Disable Kill Switch and restore normal internet traffic
   * @param {function} callback - Callback to execute on completion
   */
  async disable(callback) {
    if (!this.enabled) {
      console.log('Kill Switch is already disabled');
      return callback && callback(null, { success: true, message: 'Kill Switch already disabled' });
    }
    
    try {
      console.log('Disabling Kill Switch...');
      
      if (this.platform === 'win32') {
        await this._disableWindowsKillSwitch();
      } else if (this.platform === 'linux') {
        await this._disableLinuxKillSwitch();
      } else if (this.platform === 'darwin') {
        await this._disableMacOSKillSwitch();
      } else {
        throw new Error(`Unsupported platform: ${this.platform}`);
      }
      
      this.enabled = false;
      this.rulesApplied = false;
      console.log('Kill Switch disabled successfully');
      
      return callback && callback(null, { 
        success: true, 
        message: 'Kill Switch disabled successfully' 
      });
    } catch (error) {
      console.error('Failed to disable Kill Switch:', error);
      return callback && callback(error, { 
        success: false, 
        message: `Failed to disable Kill Switch: ${error.message}` 
      });
    }
  }
  
  /**
   * Check if Kill Switch is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }
  
  // Private methods for platform-specific implementations
  
  /**
   * Backup current network settings
   * @private
   */
  async _backupNetworkSettings() {
    return new Promise((resolve, reject) => {
      try {
        if (this.platform === 'win32') {
          // For Windows, we'll save the firewall rules
          exec('netsh advfirewall export "' + this.backupPath + '.wfw"', (error) => {
            if (error) {
              console.warn('Failed to backup firewall rules, but continuing:', error.message);
            }
            resolve();
          });
        } else if (this.platform === 'linux') {
          // For Linux, backup iptables rules
          exec('iptables-save > "' + this.backupPath + '.ipt"', (error) => {
            if (error) {
              console.warn('Failed to backup iptables rules, but continuing:', error.message);
            }
            resolve();
          });
        } else if (this.platform === 'darwin') {
          // For macOS, backup pf rules
          exec('pfctl -sr > "' + this.backupPath + '.pf"', (error) => {
            if (error) {
              console.warn('Failed to backup pf rules, but continuing:', error.message);
            }
            resolve();
          });
        } else {
          resolve();
        }
      } catch (error) {
        console.warn('Error during backup, but continuing:', error);
        resolve();
      }
    });
  }
  
  /**
   * Restore network settings from backup
   * @private
   */
  async _restoreNetworkSettings() {
    return new Promise((resolve, reject) => {
      try {
        if (this.platform === 'win32') {
          // For Windows, restore the firewall rules
          if (fs.existsSync(this.backupPath + '.wfw')) {
            exec('netsh advfirewall import "' + this.backupPath + '.wfw"', (error) => {
              if (error) {
                console.warn('Failed to restore firewall rules:', error.message);
              }
              resolve();
            });
          } else {
            resolve();
          }
        } else if (this.platform === 'linux') {
          // For Linux, restore iptables rules
          if (fs.existsSync(this.backupPath + '.ipt')) {
            exec('iptables-restore < "' + this.backupPath + '.ipt"', (error) => {
              if (error) {
                console.warn('Failed to restore iptables rules:', error.message);
              }
              resolve();
            });
          } else {
            resolve();
          }
        } else if (this.platform === 'darwin') {
          // For macOS, restore pf rules
          if (fs.existsSync(this.backupPath + '.pf')) {
            exec('pfctl -f "' + this.backupPath + '.pf"', (error) => {
              if (error) {
                console.warn('Failed to restore pf rules:', error.message);
              }
              resolve();
            });
          } else {
            resolve();
          }
        } else {
          resolve();
        }
      } catch (error) {
        console.warn('Error during restore, but continuing:', error);
        resolve();
      }
    });
  }
  
  /**
   * Enable Kill Switch on Windows
   * @param {string} vpnInterface - VPN interface name
   * @private
   */
  async _enableWindowsKillSwitch(vpnInterface) {
    return new Promise((resolve, reject) => {
      try {
        // Get all network interfaces
        exec('netsh interface show interface', (error, stdout) => {
          if (error) {
            return reject(new Error(`Failed to get network interfaces: ${error.message}`));
          }
          
          // Create rule to allow VPN interface traffic
          exec(`netsh advfirewall firewall add rule name="VPN Kill Switch - Allow VPN" dir=out interface="${vpnInterface}" action=allow`, (error) => {
            if (error) {
              return reject(new Error(`Failed to add VPN allow rule: ${error.message}`));
            }
            
            // Block all other outbound traffic
            exec('netsh advfirewall firewall add rule name="VPN Kill Switch - Block Internet" dir=out action=block remoteip=0.0.0.0-255.255.255.255', (error) => {
              if (error) {
                return reject(new Error(`Failed to add internet block rule: ${error.message}`));
              }
              
              resolve();
            });
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Disable Kill Switch on Windows
   * @private
   */
  async _disableWindowsKillSwitch() {
    return new Promise((resolve, reject) => {
      try {
        // Remove the Kill Switch firewall rules
        exec('netsh advfirewall firewall delete rule name="VPN Kill Switch - Allow VPN"', (error) => {
          // Continue even if there's an error, as the rule might not exist
          exec('netsh advfirewall firewall delete rule name="VPN Kill Switch - Block Internet"', (error) => {
            // Try to restore from backup
            this._restoreNetworkSettings().then(resolve).catch(reject);
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Enable Kill Switch on Linux
   * @param {string} vpnInterface - VPN interface name
   * @private
   */
  async _enableLinuxKillSwitch(vpnInterface) {
    return new Promise((resolve, reject) => {
      try {
        // Linux implementation using iptables
        const commands = [
          // Allow established connections
          'iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT',
          // Allow VPN interface
          `iptables -A OUTPUT -o ${vpnInterface} -j ACCEPT`,
          // Allow local network
          'iptables -A OUTPUT -d 192.168.0.0/16 -j ACCEPT',
          'iptables -A OUTPUT -d 10.0.0.0/8 -j ACCEPT',
          'iptables -A OUTPUT -d 172.16.0.0/12 -j ACCEPT',
          // Block everything else
          'iptables -A OUTPUT -j DROP'
        ];
        
        // Execute commands sequentially
        const executeCommands = (index) => {
          if (index >= commands.length) {
            return resolve();
          }
          
          exec(commands[index], (error) => {
            if (error) {
              return reject(new Error(`Failed to execute iptables command: ${error.message}`));
            }
            
            executeCommands(index + 1);
          });
        };
        
        executeCommands(0);
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Disable Kill Switch on Linux
   * @private
   */
  async _disableLinuxKillSwitch() {
    return new Promise((resolve, reject) => {
      try {
        // Flush all iptables rules
        exec('iptables -F OUTPUT', (error) => {
          if (error) {
            return reject(new Error(`Failed to flush iptables rules: ${error.message}`));
          }
          
          // Try to restore from backup
          this._restoreNetworkSettings().then(resolve).catch(reject);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Enable Kill Switch on macOS
   * @param {string} vpnInterface - VPN interface name
   * @private
   */
  async _enableMacOSKillSwitch(vpnInterface) {
    return new Promise((resolve, reject) => {
      try {
        // Create temporary pf rules file
        const pfRulesPath = path.join(this.appDataPath, 'vpn-killswitch.conf');
        const pfRules = `
# VPN Kill Switch Rules
block out on !lo0
block out on !${vpnInterface}
pass out on ${vpnInterface} all
pass out on lo0 all
        `;
        
        fs.writeFileSync(pfRulesPath, pfRules);
        
        // Enable pf and load rules
        exec('pfctl -e -f "' + pfRulesPath + '"', (error) => {
          if (error) {
            return reject(new Error(`Failed to enable pf rules: ${error.message}`));
          }
          
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Disable Kill Switch on macOS
   * @private
   */
  async _disableMacOSKillSwitch() {
    return new Promise((resolve, reject) => {
      try {
        // Disable pf
        exec('pfctl -d', (error) => {
          // Try to restore from backup
          this._restoreNetworkSettings().then(resolve).catch(reject);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = KillSwitch;
