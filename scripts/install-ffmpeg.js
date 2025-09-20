#!/usr/bin/env node

const { execSync } = require('child_process');
const os = require('os');

console.log('🔧 Installing FFmpeg for WhatsApp Bot...');
console.log(`Platform: ${os.platform()}`);
console.log(`Architecture: ${os.arch()}`);

try {
  if (os.platform() === 'linux') {
    console.log('📦 Installing FFmpeg on Linux...');
    
    // Try different package managers
    try {
      execSync('which apt-get', { stdio: 'ignore' });
      console.log('Using apt-get...');
      execSync('sudo apt-get update', { stdio: 'inherit' });
      execSync('sudo apt-get install -y ffmpeg', { stdio: 'inherit' });
    } catch (aptError) {
      try {
        execSync('which yum', { stdio: 'ignore' });
        console.log('Using yum...');
        execSync('sudo yum install -y ffmpeg', { stdio: 'inherit' });
      } catch (yumError) {
        try {
          execSync('which dnf', { stdio: 'ignore' });
          console.log('Using dnf...');
          execSync('sudo dnf install -y ffmpeg', { stdio: 'inherit' });
        } catch (dnfError) {
          console.error('❌ Could not find a supported package manager (apt-get, yum, dnf)');
          console.error('Please install FFmpeg manually:');
          console.error('  Ubuntu/Debian: sudo apt-get install ffmpeg');
          console.error('  CentOS/RHEL: sudo yum install ffmpeg');
          console.error('  Fedora: sudo dnf install ffmpeg');
          process.exit(1);
        }
      }
    }
  } else if (os.platform() === 'darwin') {
    console.log('📦 Installing FFmpeg on macOS...');
    try {
      execSync('which brew', { stdio: 'ignore' });
      execSync('brew install ffmpeg', { stdio: 'inherit' });
    } catch (brewError) {
      console.error('❌ Homebrew not found. Please install FFmpeg manually:');
      console.error('  brew install ffmpeg');
      process.exit(1);
    }
  } else if (os.platform() === 'win32') {
    console.log('�� FFmpeg installation on Windows...');
    console.log('Please download FFmpeg from: https://ffmpeg.org/download.html');
    console.log('Or use chocolatey: choco install ffmpeg');
    console.log('Or use winget: winget install ffmpeg');
  } else {
    console.error(`❌ Unsupported platform: ${os.platform()}`);
    process.exit(1);
  }

  // Verify installation
  console.log('✅ Verifying FFmpeg installation...');
  const version = execSync('ffmpeg -version', { encoding: 'utf8' });
  console.log('🎉 FFmpeg installed successfully!');
  console.log('Version info:', version.split('\n')[0]);

} catch (error) {
  console.error('❌ Error installing FFmpeg:', error.message);
  console.error('\n📋 Manual installation instructions:');
  console.error('Linux (Ubuntu/Debian): sudo apt-get install ffmpeg');
  console.error('Linux (CentOS/RHEL): sudo yum install ffmpeg');
  console.error('macOS: brew install ffmpeg');
  console.error('Windows: Download from https://ffmpeg.org/download.html');
  process.exit(1);
} 