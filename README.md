# Adobe Sign Cache Reset Tool - Python GUI

**A Python GUI application to fix "Request e-signatures" issues in Adobe Acrobat.**

Converts the PowerShell script to a user-friendly GUI with additional features.

## 🎯 What It Does

Clears cached Adobe identity and Acrobat Sign tokens when users experience issues with the "Request e-signatures" feature in Adobe Acrobat.

### Actions Performed:
- ✅ Closes Adobe/Acrobat processes safely
- ✅ Backs up existing cache folders
- ✅ Removes identity/token caches
- ✅ Clears stale Windows Web Credentials for Adobe
- ✅ Optionally restarts Creative Cloud helper

### Cache Locations Cleared:
- Adobe OOBE (identity/entitlement cache)
- Acrobat CEF (Chromium) caches - tokens often persist here
- Acrobat JavaScript cache
- Adobe Security CSI cache
- Windows Credential Manager entries for Adobe

## 🚀 Installation & Usage

### Option 1: Run from Python

1. **Install Python 3.7+** from [python.org](https://python.org)
2. **Download this tool**
3. **Double-click** `run_adobe_reset.bat`
   
   Or run directly:
   ```batch
   python adobe_cache_reset.py
   ```

### Option 2: Build Standalone EXE

```batch
# Install PyInstaller
pip install pyinstaller

# Build executable
pyinstaller --onefile --windowed --name "AdobeSignCacheReset" adobe_cache_reset.py

# Find executable in dist/ folder
```

## 🖥️ Interface

```
┌─────────────────────────────────────────────────────────────┐
│  🔄 Adobe Sign Cache Reset Tool                              │
├─────────────────────────────────────────────────────────────┤
│  Configuration                                               │
│  Backup Path: [C:\Users\...\Adobe\_CacheBackups] [Browse]   │
│  ☑ Skip closing Adobe processes  ☑ Quiet mode               │
├─────────────────────────────────────────────────────────────┤
│  Actions                                                     │
│  This tool will clear the following caches:                  │
│    • Adobe OOBE (identity/entitlement cache)                │
│    • Acrobat CEF (Chromium) caches                          │
│    • Acrobat JavaScript cache                               │
│    • Windows Web Credentials for Adobe                      │
│                                                              │
│  [🚀 Run Cache Reset] [🔍 Check Processes] [📁 Open Backup] │
├─────────────────────────────────────────────────────────────┤
│  Activity Log                                               │
│  [12:34:56] [INFO] Closing Adobe processes...               │
│  [12:34:58] [ OK ] Adobe processes closed                   │
│  [12:34:59] [INFO] Backing up: C:\...\Adobe\OOBE            │
│  [12:35:00] [ OK ] Cleared: C:\...\Adobe\OOBE               │
│                                                              │
│  [━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━] 100%                      │
│  Ready                                                      │
├─────────────────────────────────────────────────────────────┤
│  [📋 Copy] [💾 Save] [🗑️ Clear]                             │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Features

### 🔧 Core Functions
- **Run Cache Reset** - Full automated cleanup
- **Check Adobe Processes** - See what Adobe apps are running
- **Open Backup Folder** - View backed up cache files

### ⚙️ Configuration Options
- **Backup Path** - Choose where to store backups (default: `%LOCALAPPDATA%\Adobe\_CacheBackups`)
- **Skip Process Close** - Don't close Adobe apps (use with caution)
- **Quiet Mode** - Reduce log output

### 📝 Log Features
- **Real-time logging** with timestamps
- **Color-coded output** (INFO, OK, WARN, ERR)
- **Progress bar** for long operations
- **Copy to clipboard** - for support tickets
- **Save to file** - for documentation

## 🔒 Safety Features

- ✅ **Automatic backups** before clearing anything
- ✅ **Confirmation dialog** before running
- ✅ **Process safety** - closes Adobe apps gracefully
- ✅ **Error handling** - continues even if some paths fail
- ✅ **Restore capability** - backups saved with timestamps

## 🐛 Troubleshooting

### "Python not found"
Install Python 3.7+ from [python.org](https://python.org) and check "Add Python to PATH"

### Adobe still not working after reset
1. **Reboot** your computer - some token caches require restart
2. Sign out and back into Adobe Creative Cloud
3. Try the reset again after reboot

### "Access denied" errors
Run as Administrator if you get permission errors on certain cache folders.

### Backup folder getting large
Backups are timestamped and kept indefinitely. Periodically clean out:
```
%LOCALAPPDATA%\Adobe\_CacheBackups\
```

## 📊 Comparison: GUI vs PowerShell

| Feature | PowerShell | Python GUI |
|---------|-----------|------------|
| Ease of use | ⚠️ Requires command line | ✅ Point-and-click |
| Visual feedback | ❌ Text only | ✅ Progress bars, colors |
| Configuration | ⚠️ Command line parameters | ✅ GUI options |
| Process check | ❌ Manual | ✅ Built-in button |
| Backup browsing | ❌ Manual | ✅ One-click open |
| Log export | ❌ Manual | ✅ Copy/Save buttons |
| Cross-platform | ❌ Windows only | ✅ Works on macOS/Linux* |

*Note: Full functionality requires Windows for credential manager access

## 🔧 Technical Details

### Architecture
- **GUI Framework:** Python tkinter (standard library)
- **Process Management:** subprocess module
- **File Operations:** shutil, os modules
- **Threading:** Background operations for UI responsiveness

### No External Dependencies
Uses only Python standard library - no pip installs required.

### Windows-Specific Features
- Windows Credential Manager integration
- Adobe process management
- Windows path handling

## 📄 Files

```
adobe-sign-cache-reset/
├── adobe_cache_reset.py      # Main GUI application (522 lines)
├── run_adobe_reset.bat       # Windows launcher
├── requirements.txt          # Dependencies (none - stdlib only)
└── README.md                 # This documentation
```

## 🔄 How It Works

1. **Close Adobe Processes** - Safely stops Acrobat, Creative Cloud, and related services
2. **Backup Caches** - Copies all cache folders to backup location with timestamp
3. **Clear Caches** - Removes identity and token caches from:
   - `%LOCALAPPDATA%\Adobe\OOBE`
   - `%APPDATA%\Adobe\Acrobat\DC\AcroCEF\Cache`
   - `%APPDATA%\Adobe\Acrobat\DC\JSCache`
   - `%APPDATA%\Adobe\Acrobat\DC\Security\csi`
4. **Clear Credentials** - Removes Adobe entries from Windows Credential Manager
5. **Restart Services** - Starts Creative Cloud helper (optional)

## 🙏 Credits

Based on the PowerShell script by Kyle Baker.

Converted to Python GUI for easier deployment and better user experience.

## 📄 License

MIT License - Free to use and distribute.

## 🔗 Links

- **Repository:** https://github.com/kbaker827/adobe-sign-cache-reset
- **Issues:** https://github.com/kbaker827/adobe-sign-cache-reset/issues

---

**Fix Adobe e-signature issues with one click! 🚀**
