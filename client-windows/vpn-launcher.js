// filepath: c:\Users\syncRH\vpn-proj\client-windows\vpn-launcher.js
/**
 * VPN Launcher Script
 * This script is used to launch OpenVPN with the proper permissions.
 * It's designed to be run with elevated privileges on Windows.
 */
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Get command line arguments
const args = process.argv.slice(2);
let configPath = null;
let action = 'connect';
let vpnType = 'full';

// Parse command line arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config' && i + 1 < args.length) {
    configPath = args[i + 1];
    i++; // Skip the next argument
  } else if (args[i] === '--action' && i + 1 < args.length) {
    action = args[i + 1];
    i++; // Skip the next argument
  } else if (args[i] === '--type' && i + 1 < args.length) {
    vpnType = args[i + 1];
    i++; // Skip the next argument
  }
}

if (action === 'connect' && !configPath) {
  console.error('Error: Config path is required for connect action');
  process.exit(1);
}

// Function to find OpenVPN executable path
function findOpenVpnPath() {
  if (process.platform === 'win32') {
    // Common installation paths on Windows
    const commonPaths = [
      'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe',
      'C:\\Program Files (x86)\\OpenVPN\\bin\\openvpn.exe',
      path.join(os.homedir(), 'OpenVPN\\bin\\openvpn.exe')
    ];
    
    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        console.log('Found OpenVPN at:', p);
        return p;
      }
    }
  } else if (process.platform === 'darwin') {
    // macOS paths
    const macPaths = [
      '/usr/local/bin/openvpn',
      '/usr/bin/openvpn',
      '/opt/homebrew/bin/openvpn'
    ];
    
    for (const p of macPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  } else {
    // Linux likely has it in PATH
    return 'openvpn';
  }
  
  console.error('OpenVPN executable not found');
  return null;
}

// Main function
async function run() {
  try {
    if (action === 'connect') {
      await connectVPN(configPath);
    } else if (action === 'disconnect') {
      await disconnectVPN();
    } else {
      console.error('Unknown action:', action);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Function to connect to VPN
async function connectVPN(configPath) {
  const openVpnPath = findOpenVpnPath();
  if (!openVpnPath) {
    console.error('OpenVPN not found, please install it first');
    process.exit(1);
  }
  
  console.log(`Starting OpenVPN with config: ${configPath}`);
  console.log(`VPN Type: ${vpnType}`);
  
  // Modify the configuration to avoid TAP/TUN device issues on Windows
  if (process.platform === 'win32') {
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const configLines = configContent.split('\n');
      let modifiedConfig = '';
      let needsServiceOnly = false;
      
      for (const line of configLines) {
        // Skip the line that's trying to set IP using netsh
        if (line.includes('netsh') || line.includes('ip-win32')) {
          needsServiceOnly = true;
          continue;
        }
        
        // Add the line to our modified config
        modifiedConfig += line + '\n';
      }
      
      // Add special directive for Windows to use service-only mode if needed
      if (needsServiceOnly) {
        modifiedConfig += '\nservice-only\n';
        modifiedConfig += 'tap-sleep 5\n';
        modifiedConfig += 'route-delay 5\n';
      }
      
      // Create temporary filename by adding .tmp to the end
      const tempConfigPath = configPath + '.tmp';
      fs.writeFileSync(tempConfigPath, modifiedConfig);
      configPath = tempConfigPath;
      
      console.log('Created modified config file:', tempConfigPath);
    } catch (error) {
      console.error('Error modifying configuration:', error);
    }
  }
  
  // Start OpenVPN process
  const openvpnProcess = spawn(openVpnPath, ['--config', configPath], {
    stdio: 'pipe',
    detached: false // We want to keep the process attached to this one
  });
  
  // Handle output
  openvpnProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('OpenVPN:', output);
    
    // Check for successful connection
    if (output.includes('Initialization Sequence Completed') || 
        output.includes('Initialization sequence completed')) {
      console.log('VPN CONNECTED SUCCESSFULLY');
    }
  });
  
  openvpnProcess.stderr.on('data', (data) => {
    console.error('OpenVPN Error:', data.toString());
  });
  
  openvpnProcess.on('close', (code) => {
    console.log(`OpenVPN process exited with code ${code}`);
    
    // Clean up temp file if created
    if (configPath.endsWith('.tmp') && fs.existsSync(configPath)) {
      try {
        fs.unlinkSync(configPath);
        console.log('Removed temporary config file');
      } catch (error) {
        console.error('Error removing temporary config file:', error);
      }
    }
    
    process.exit(code || 0);
  });
  
  // Handle process termination
  process.on('SIGINT', () => {
    console.log('Received SIGINT, terminating OpenVPN...');
    if (openvpnProcess) {
      openvpnProcess.kill();
    }
  });
  
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, terminating OpenVPN...');
    if (openvpnProcess) {
      openvpnProcess.kill();
    }
  });
}

// Function to disconnect from VPN
async function disconnectVPN() {
  if (process.platform !== 'win32') {
    console.log('Disconnect functionality is Windows-specific');
    process.exit(0);
  }
  
  // On Windows, we need to kill the OpenVPN process
  try {
    // Find and kill the OpenVPN process
    const command = 'taskkill /F /IM openvpn.exe';
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error disconnecting: ${error.message}`);
        process.exit(1);
      }
      if (stderr) {
        console.error(`Disconnect stderr: ${stderr}`);
      }
      console.log(`Disconnect stdout: ${stdout}`);
      console.log('Disconnected from VPN');
      process.exit(0);
    });
  } catch (error) {
    console.error('Error disconnecting from VPN:', error);
    process.exit(1);
  }
}

// Run the main function
run();