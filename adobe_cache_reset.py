#!/usr/bin/env python3
"""
Adobe Sign Cache Reset Tool - Python GUI Version

Clears Adobe identity and Acrobat Sign caches to fix "Request e-signatures" issues.
Converts the PowerShell script to a cross-platform Python GUI.
"""

import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, filedialog
import subprocess
import os
import sys
import shutil
import platform
from pathlib import Path
from datetime import datetime
import threading


class AdobeCacheResetTool:
    """Main GUI application for Adobe cache reset"""
    
    def __init__(self, root):
        self.root = root
        self.root.title("Adobe Sign Cache Reset Tool")
        self.root.geometry("800x700")
        self.root.minsize(700, 600)
        
        # Set Windows-style if on Windows
        if platform.system() == 'Windows':
            self.root.tk.call('tk', 'scaling', 1.5)
        
        # Configuration
        self.is_windows = platform.system() == 'Windows'
        self.backup_path = tk.StringVar()
        self.quiet_mode = tk.BooleanVar(value=False)
        self.skip_process_close = tk.BooleanVar(value=False)
        self.cleared_count = 0
        
        # Set default backup path
        if self.is_windows:
            default_backup = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Adobe', '_CacheBackups')
        else:
            default_backup = os.path.join(os.path.expanduser('~'), '.adobe_cache_backups')
        self.backup_path.set(default_backup)
        
        self.setup_ui()
        
    def setup_ui(self):
        """Setup the user interface"""
        # Main container
        main_frame = ttk.Frame(self.root, padding="15")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Header
        self.create_header(main_frame)
        
        # Configuration section
        self.create_config_section(main_frame)
        
        # Actions section
        self.create_actions_section(main_frame)
        
        # Progress and log
        self.create_log_section(main_frame)
        
    def create_header(self, parent):
        """Create header"""
        header = ttk.Frame(parent)
        header.pack(fill=tk.X, pady=(0, 15))
        
        ttk.Label(
            header,
            text="🔄 Adobe Sign Cache Reset Tool",
            font=('Segoe UI', 16, 'bold')
        ).pack(anchor=tk.W)
        
        ttk.Label(
            header,
            text="Clears Adobe identity and Acrobat Sign caches to fix 'Request e-signatures' issues",
            font=('Segoe UI', 9),
            wraplength=700
        ).pack(anchor=tk.W, pady=(5, 0))
        
        ttk.Separator(parent, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=10)
        
    def create_config_section(self, parent):
        """Create configuration section"""
        config_frame = ttk.LabelFrame(parent, text="Configuration", padding="10")
        config_frame.pack(fill=tk.X, pady=(0, 10))
        
        # Backup path
        backup_frame = ttk.Frame(config_frame)
        backup_frame.pack(fill=tk.X, pady=5)
        
        ttk.Label(backup_frame, text="Backup Path:").pack(side=tk.LEFT)
        ttk.Entry(backup_frame, textvariable=self.backup_path, width=50).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        ttk.Button(backup_frame, text="Browse...", command=self.browse_backup_path).pack(side=tk.LEFT)
        
        # Options
        options_frame = ttk.Frame(config_frame)
        options_frame.pack(fill=tk.X, pady=5)
        
        ttk.Checkbutton(
            options_frame,
            text="Skip closing Adobe processes",
            variable=self.skip_process_close
        ).pack(side=tk.LEFT, padx=(0, 20))
        
        ttk.Checkbutton(
            options_frame,
            text="Quiet mode (less output)",
            variable=self.quiet_mode
        ).pack(side=tk.LEFT)
        
    def create_actions_section(self, parent):
        """Create actions section"""
        actions_frame = ttk.LabelFrame(parent, text="Actions", padding="10")
        actions_frame.pack(fill=tk.X, pady=(0, 10))
        
        # What will be cleared
        ttk.Label(
            actions_frame,
            text="This tool will clear the following caches:",
            font=('Segoe UI', 9, 'bold')
        ).pack(anchor=tk.W, pady=(0, 10))
        
        caches = [
            "Adobe OOBE (identity/entitlement cache)",
            "Acrobat CEF (Chromium) caches",
            "Acrobat JavaScript cache",
            "Adobe Security CSI cache",
            "Windows Web Credentials for Adobe"
        ]
        
        for cache in caches:
            ttk.Label(actions_frame, text=f"  • {cache}").pack(anchor=tk.W)
        
        # Adobe processes that will be closed
        ttk.Label(
            actions_frame,
            text="\nAdobe processes that will be closed:",
            font=('Segoe UI', 9, 'bold')
        ).pack(anchor=tk.W, pady=(10, 5))
        
        processes = [
            "Acrobat", "AcroCEF", "CCXProcess", "Creative Cloud",
            "Adobe Desktop Service", "CoreSync", "AGSService", "AGMService", "AdobeIPCBroker"
        ]
        
        proc_text = ", ".join(processes)
        ttk.Label(
            actions_frame,
            text=proc_text,
            wraplength=700,
            foreground='gray'
        ).pack(anchor=tk.W)
        
        # Buttons
        btn_frame = ttk.Frame(actions_frame)
        btn_frame.pack(fill=tk.X, pady=15)
        
        # Run button (green)
        self.run_btn = tk.Button(
            btn_frame,
            text="🚀 Run Cache Reset",
            command=self.run_reset,
            bg='#28a745',
            fg='white',
            font=('Segoe UI', 11, 'bold'),
            padx=20,
            pady=10,
            cursor='hand2'
        )
        self.run_btn.pack(side=tk.LEFT, padx=(0, 10))
        
        # Check status button
        ttk.Button(
            btn_frame,
            text="🔍 Check Adobe Processes",
            command=self.check_processes
        ).pack(side=tk.LEFT, padx=5)
        
        # Open backup folder
        ttk.Button(
            btn_frame,
            text="📁 Open Backup Folder",
            command=self.open_backup_folder
        ).pack(side=tk.LEFT, padx=5)
        
    def create_log_section(self, parent):
        """Create log section"""
        log_frame = ttk.LabelFrame(parent, text="Activity Log", padding="10")
        log_frame.pack(fill=tk.BOTH, expand=True)
        
        # Log text
        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            wrap=tk.WORD,
            font=('Consolas', 10),
            height=15
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        # Progress bar
        self.progress_var = tk.DoubleVar(value=0)
        self.progress = ttk.Progressbar(
            log_frame,
            variable=self.progress_var,
            maximum=100,
            mode='determinate'
        )
        self.progress.pack(fill=tk.X, pady=(10, 0))
        
        # Status
        self.status_var = tk.StringVar(value="Ready")
        ttk.Label(log_frame, textvariable=self.status_var).pack(anchor=tk.W, pady=(5, 0))
        
        # Log buttons
        btn_frame = ttk.Frame(log_frame)
        btn_frame.pack(fill=tk.X, pady=(10, 0))
        
        ttk.Button(btn_frame, text="📋 Copy Log", command=self.copy_log).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="💾 Save Log", command=self.save_log).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="🗑️ Clear", command=self.clear_log).pack(side=tk.LEFT, padx=2)
        
    def browse_backup_path(self):
        """Browse for backup path"""
        path = filedialog.askdirectory()
        if path:
            self.backup_path.set(path)
            
    def log(self, message, level='info'):
        """Add message to log"""
        if self.quiet_mode.get() and level not in ['error', 'success']:
            return
            
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        prefixes = {
            'info': '[INFO]',
            'success': '[ OK ]',
            'warning': '[WARN]',
            'error': '[ERR]'
        }
        
        prefix = prefixes.get(level, '[INFO]')
        log_entry = f"[{timestamp}] {prefix} {message}\n"
        
        self.log_text.insert(tk.END, log_entry)
        self.log_text.see(tk.END)
        self.status_var.set(message[:80])
        
    def run_reset(self):
        """Run the cache reset"""
        if not self.is_windows:
            messagebox.showwarning("Windows Only", "This tool is designed for Windows.\nSome features may not work on other platforms.")
            
        # Confirm
        if not messagebox.askyesno("Confirm", "This will close Adobe applications and clear cached data.\n\nContinue?"):
            return
        
        # Disable run button
        self.run_btn.config(state=tk.DISABLED)
        self.progress_var.set(0)
        self.cleared_count = 0
        
        # Run in thread
        thread = threading.Thread(target=self._reset_thread)
        thread.start()
        
    def _reset_thread(self):
        """Reset thread"""
        try:
            self._close_adobe_processes()
            self.progress_var.set(25)
            
            self._backup_and_clear_caches()
            self.progress_var.set(75)
            
            self._clear_credentials()
            self.progress_var.set(90)
            
            self._restart_ccx()
            self.progress_var.set(100)
            
            self._show_completion()
            
        except Exception as e:
            self.log(f"Error: {str(e)}", 'error')
        finally:
            self.run_btn.config(state=tk.NORMAL)
            
    def _close_adobe_processes(self):
        """Close Adobe processes"""
        if self.skip_process_close.get():
            self.log("Skipping process close (user option)")
            return
            
        self.log("Closing Adobe processes...")
        
        adobe_processes = [
            "Acrobat", "AcroCEF", "CCXProcess", "Creative Cloud",
            "Adobe Desktop Service", "CoreSync", "AGSService", 
            "AGMService", "AdobeIPCBroker"
        ]
        
        for proc_name in adobe_processes:
            try:
                if self.is_windows:
                    subprocess.run(['taskkill', '/F', '/IM', f'{proc_name}.exe'], 
                                 capture_output=True)
                else:
                    subprocess.run(['pkill', '-f', proc_name], capture_output=True)
            except:
                pass
                
        import time
        time.sleep(2)
        self.log("Adobe processes closed (or not running)", 'success')
        
    def _backup_and_clear_caches(self):
        """Backup and clear caches"""
        self.log("Backing up and clearing caches...")
        
        if self.is_windows:
            local_appdata = os.environ.get('LOCALAPPDATA', '')
            roaming_appdata = os.environ.get('APPDATA', '')
        else:
            local_appdata = os.path.expanduser('~')
            roaming_appdata = os.path.expanduser('~')
        
        # Target paths
        target_paths = [
            os.path.join(local_appdata, "Adobe", "OOBE"),
            os.path.join(roaming_appdata, "Adobe", "OOBE"),
            os.path.join(roaming_appdata, "Adobe", "Acrobat", "DC", "AcroCEF", "Cache"),
            os.path.join(roaming_appdata, "Adobe", "Acrobat", "DC", "AcroCEF", "GPUCache"),
            os.path.join(local_appdata, "Adobe", "Acrobat", "DC", "AcroCEF", "Cache"),
            os.path.join(local_appdata, "Adobe", "Acrobat", "DC", "AcroCEF", "GPUCache"),
            os.path.join(roaming_appdata, "Adobe", "Acrobat", "DC", "JSCache"),
            os.path.join(roaming_appdata, "Adobe", "Acrobat", "DC", "Security", "csi"),
        ]
        
        # Create backup directory
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        session_backup = os.path.join(self.backup_path.get(), f"AdobeCache-{timestamp}")
        os.makedirs(session_backup, exist_ok=True)
        
        cleared = 0
        for path in target_paths:
            if os.path.exists(path):
                try:
                    # Backup
                    safe_name = path.replace(':', '_').replace('\\', '_').replace('/', '_')
                    backup_dest = os.path.join(session_backup, safe_name)
                    
                    self.log(f"Backing up: {path}")
                    shutil.copytree(path, backup_dest, dirs_exist_ok=True)
                    
                    # Remove
                    shutil.rmtree(path)
                    self.log(f"Cleared: {path}", 'success')
                    cleared += 1
                except Exception as e:
                    self.log(f"Could not clear: {path} ({str(e)})", 'warning')
                    
        self.cleared_count = cleared
        self.log(f"Cleared {cleared} cache location(s)", 'success')
        
    def _clear_credentials(self):
        """Clear Adobe credentials from Windows Credential Manager"""
        if not self.is_windows:
            self.log("Credential cleanup skipped (Windows only)")
            return
            
        self.log("Clearing stale Adobe Web Credentials...")
        
        try:
            # Use cmdkey to list and delete credentials
            result = subprocess.run(['cmdkey', '/list'], capture_output=True, text=True)
            
            if result.returncode == 0:
                lines = result.stdout.split('\n')
                for line in lines:
                    if 'Target:' in line and 'adobe' in line.lower():
                        target = line.split('Target:')[1].strip()
                        subprocess.run(['cmdkey', f'/delete:{target}'], 
                                     capture_output=True)
                        self.log(f"Removed credential: {target}", 'success')
                        
        except Exception as e:
            self.log(f"Credential cleanup skipped: {str(e)}", 'warning')
            
    def _restart_ccx(self):
        """Restart Creative Cloud helper"""
        if not self.is_windows:
            return
            
        self.log("Starting Creative Cloud helper...")
        
        ccx_path = r"C:\Program Files\Adobe\Adobe Creative Cloud Experience\CCXProcess.exe"
        if os.path.exists(ccx_path):
            try:
                subprocess.Popen([ccx_path], close_fds=True)
                self.log("Creative Cloud helper started", 'success')
            except Exception as e:
                self.log(f"Could not start CCX: {str(e)}", 'warning')
        else:
            self.log("CCXProcess not found at default location", 'warning')
            
    def _show_completion(self):
        """Show completion message"""
        self.log("\n" + "="*60)
        self.log("Cleanup Complete!", 'success')
        self.log(f"Cleared {self.cleared_count} cache location(s)")
        self.log("="*60)
        self.log("\nNext steps:")
        self.log("  1. Open Adobe Acrobat and sign in with your Adobe ID")
        self.log("  2. Try File > Request e-signatures again")
        self.log("  3. If still failing, reboot to fully refresh tokens")
        self.log(f"\nBackup location: {self.backup_path.get()}")
        
        messagebox.showinfo(
            "Complete",
            f"Cache reset complete!\n\n"
            f"Cleared {self.cleared_count} cache location(s)\n\n"
            f"Next steps:\n"
            f"1. Open Adobe Acrobat and sign in\n"
            f"2. Try Request e-signatures again\n"
            f"3. Reboot if still having issues"
        )
        
    def check_processes(self):
        """Check if Adobe processes are running"""
        self.log("Checking Adobe processes...")
        
        adobe_processes = [
            "Acrobat", "AcroCEF", "CCXProcess", "Creative Cloud",
            "Adobe Desktop Service", "CoreSync"
        ]
        
        found = []
        for proc_name in adobe_processes:
            try:
                if self.is_windows:
                    result = subprocess.run(['tasklist', '/FI', f'IMAGENAME eq {proc_name}.exe'],
                                          capture_output=True, text=True)
                    if proc_name in result.stdout:
                        found.append(proc_name)
                else:
                    result = subprocess.run(['pgrep', '-f', proc_name],
                                          capture_output=True)
                    if result.returncode == 0:
                        found.append(proc_name)
            except:
                pass
                
        if found:
            self.log(f"Running Adobe processes: {', '.join(found)}")
        else:
            self.log("No Adobe processes currently running", 'success')
            
    def open_backup_folder(self):
        """Open backup folder in file manager"""
        path = self.backup_path.get()
        os.makedirs(path, exist_ok=True)
        
        try:
            if self.is_windows:
                os.startfile(path)
            elif platform.system() == 'Darwin':
                subprocess.run(['open', path])
            else:
                subprocess.run(['xdg-open', path])
        except Exception as e:
            self.log(f"Could not open folder: {str(e)}", 'error')
            
    def copy_log(self):
        """Copy log to clipboard"""
        self.root.clipboard_clear()
        self.root.clipboard_append(self.log_text.get(1.0, tk.END))
        self.status_var.set("Log copied to clipboard")
        
    def save_log(self):
        """Save log to file"""
        from tkinter import filedialog
        filename = filedialog.asksaveasfilename(
            defaultextension=".log",
            filetypes=[("Log files", "*.log"), ("Text files", "*.txt")],
            initialfile=f"adobe_reset_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
        )
        if filename:
            with open(filename, 'w') as f:
                f.write(self.log_text.get(1.0, tk.END))
            self.status_var.set(f"Log saved to {filename}")
            
    def clear_log(self):
        """Clear log"""
        self.log_text.delete(1.0, tk.END)
        self.status_var.set("Log cleared")


def main():
    """Main entry point"""
    root = tk.Tk()
    
    # Set DPI awareness on Windows
    if platform.system() == 'Windows':
        try:
            from ctypes import windll
            windll.shcore.SetProcessDpiAwareness(1)
        except:
            pass
    
    app = AdobeCacheResetTool(root)
    root.mainloop()


if __name__ == '__main__':
    main()
