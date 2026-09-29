#!/usr/bin/env python3
"""
Adobe Sign Cache Reset Tool - Python GUI Version

Clears Adobe identity and Acrobat Sign caches to fix "Request e-signatures" issues.
GUI port of the original PowerShell script. The reset itself is Windows-only;
the process check and log tools work on any platform.
"""

import os
import platform
import queue
import shutil
import subprocess
import threading
import time
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

IS_WINDOWS = platform.system() == 'Windows'
IS_MAC = platform.system() == 'Darwin'

# Keeps taskkill/tasklist/cmdkey from flashing a console window under pythonw.
NO_WINDOW = subprocess.CREATE_NO_WINDOW if IS_WINDOWS else 0

ADOBE_PROCESSES = [
    "Acrobat", "AcroCEF", "CCXProcess", "Creative Cloud",
    "Adobe Desktop Service", "CoreSync", "AGSService",
    "AGMService", "AdobeIPCBroker",
]

CACHE_DESCRIPTIONS = [
    "Adobe OOBE (identity/entitlement cache)",
    "Acrobat CEF (Chromium) caches",
    "Acrobat JavaScript cache",
    "Adobe Security CSI cache",
    "Windows Web Credentials for Adobe",
]

CCX_PATH = Path(r"C:\Program Files\Adobe\Adobe Creative Cloud Experience\CCXProcess.exe")

LOG_PREFIXES = {
    'info': '[INFO]',
    'success': '[ OK ]',
    'warning': '[WARN]',
    'error': '[ERR ]',
}

LOG_COLORS = {
    'success': '#1e7e34',
    'warning': '#b36b00',
    'error': '#c82333',
}


def run_quiet(args, **kwargs):
    """Run a command without a console window, capturing its output."""
    return subprocess.run(args, capture_output=True, text=True,
                          creationflags=NO_WINDOW, **kwargs)


def get_cache_paths():
    """Return the Adobe cache folders to clear, or [] if AppData can't be resolved."""
    local = os.environ.get('LOCALAPPDATA')
    roaming = os.environ.get('APPDATA')
    # Never fall back to relative paths: that would delete folders under the CWD.
    if not local or not roaming:
        return []

    local, roaming = Path(local), Path(roaming)
    acrobat_roaming = roaming / "Adobe" / "Acrobat" / "DC"
    acrobat_local = local / "Adobe" / "Acrobat" / "DC"
    return [
        local / "Adobe" / "OOBE",
        roaming / "Adobe" / "OOBE",
        acrobat_roaming / "AcroCEF" / "Cache",
        acrobat_roaming / "AcroCEF" / "GPUCache",
        acrobat_local / "AcroCEF" / "Cache",
        acrobat_local / "AcroCEF" / "GPUCache",
        acrobat_roaming / "JSCache",
        acrobat_roaming / "Security" / "csi",
    ]


def default_backup_path():
    if IS_WINDOWS and os.environ.get('LOCALAPPDATA'):
        return str(Path(os.environ['LOCALAPPDATA']) / 'Adobe' / '_CacheBackups')
    return str(Path.home() / '.adobe_cache_backups')


class AdobeCacheResetTool:
    """Main GUI application for Adobe cache reset"""

    def __init__(self, root):
        self.root = root
        self.root.title("Adobe Sign Cache Reset Tool")
        self.root.geometry("800x720")
        self.root.minsize(700, 600)

        self.backup_path = tk.StringVar(value=default_backup_path())
        self.quiet_mode = tk.BooleanVar(value=False)
        self.skip_process_close = tk.BooleanVar(value=False)
        self.progress_var = tk.DoubleVar(value=0)
        self.status_var = tk.StringVar(value="Ready")

        # Worker threads must not touch Tk directly; they post callables here
        # and the main loop drains the queue.
        self._ui_queue = queue.Queue()
        self._worker = None

        self.setup_ui()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.root.after(100, self._drain_ui_queue)

    # ------------------------------------------------------------------ UI

    def setup_ui(self):
        main_frame = ttk.Frame(self.root, padding="15")
        main_frame.pack(fill=tk.BOTH, expand=True)

        self.create_header(main_frame)
        self.create_config_section(main_frame)
        self.create_actions_section(main_frame)
        self.create_log_section(main_frame)

    def create_header(self, parent):
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

        if not IS_WINDOWS:
            ttk.Label(
                header,
                text="⚠ Cache reset is only available on Windows.",
                foreground=LOG_COLORS['warning']
            ).pack(anchor=tk.W, pady=(5, 0))

        ttk.Separator(parent, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=10)

    def create_config_section(self, parent):
        config_frame = ttk.LabelFrame(parent, text="Configuration", padding="10")
        config_frame.pack(fill=tk.X, pady=(0, 10))

        backup_frame = ttk.Frame(config_frame)
        backup_frame.pack(fill=tk.X, pady=5)

        ttk.Label(backup_frame, text="Backup Path:").pack(side=tk.LEFT)
        ttk.Entry(backup_frame, textvariable=self.backup_path, width=50).pack(
            side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        ttk.Button(backup_frame, text="Browse...", command=self.browse_backup_path).pack(side=tk.LEFT)

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
        actions_frame = ttk.LabelFrame(parent, text="Actions", padding="10")
        actions_frame.pack(fill=tk.X, pady=(0, 10))

        ttk.Label(
            actions_frame,
            text="This tool will clear the following caches:",
            font=('Segoe UI', 9, 'bold')
        ).pack(anchor=tk.W, pady=(0, 5))

        for cache in CACHE_DESCRIPTIONS:
            ttk.Label(actions_frame, text=f"  • {cache}").pack(anchor=tk.W)

        ttk.Label(
            actions_frame,
            text="Adobe processes that will be closed:",
            font=('Segoe UI', 9, 'bold')
        ).pack(anchor=tk.W, pady=(10, 5))

        ttk.Label(
            actions_frame,
            text=", ".join(ADOBE_PROCESSES),
            wraplength=700,
            foreground='gray'
        ).pack(anchor=tk.W)

        btn_frame = ttk.Frame(actions_frame)
        btn_frame.pack(fill=tk.X, pady=(15, 0))

        self.run_btn = tk.Button(
            btn_frame,
            text="🚀 Run Cache Reset",
            command=self.run_reset,
            bg='#28a745',
            fg='white',
            activebackground='#218838',
            activeforeground='white',
            font=('Segoe UI', 11, 'bold'),
            padx=20,
            pady=10,
            cursor='hand2',
            state=tk.NORMAL if IS_WINDOWS else tk.DISABLED,
        )
        self.run_btn.pack(side=tk.LEFT, padx=(0, 10))

        self.check_btn = ttk.Button(
            btn_frame,
            text="🔍 Check Adobe Processes",
            command=self.check_processes
        )
        self.check_btn.pack(side=tk.LEFT, padx=5)

        ttk.Button(
            btn_frame,
            text="📁 Open Backup Folder",
            command=self.open_backup_folder
        ).pack(side=tk.LEFT, padx=5)

    def create_log_section(self, parent):
        log_frame = ttk.LabelFrame(parent, text="Activity Log", padding="10")
        log_frame.pack(fill=tk.BOTH, expand=True)

        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            wrap=tk.WORD,
            font=('Consolas', 10),
            height=15,
            state=tk.DISABLED,
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)
        for level, color in LOG_COLORS.items():
            self.log_text.tag_configure(level, foreground=color)

        ttk.Progressbar(
            log_frame,
            variable=self.progress_var,
            maximum=100,
            mode='determinate'
        ).pack(fill=tk.X, pady=(10, 0))

        ttk.Label(log_frame, textvariable=self.status_var).pack(anchor=tk.W, pady=(5, 0))

        btn_frame = ttk.Frame(log_frame)
        btn_frame.pack(fill=tk.X, pady=(10, 0))

        ttk.Button(btn_frame, text="📋 Copy Log", command=self.copy_log).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="💾 Save Log", command=self.save_log).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="🗑️ Clear", command=self.clear_log).pack(side=tk.LEFT, padx=2)

    # ------------------------------------------------------- thread helpers

    def _drain_ui_queue(self):
        try:
            while True:
                self._ui_queue.get_nowait()()
        except queue.Empty:
            pass
        self.root.after(50, self._drain_ui_queue)

    def _ui(self, func, *args, **kwargs):
        """Run func on the Tk main thread (safe to call from any thread)."""
        if threading.current_thread() is threading.main_thread():
            func(*args, **kwargs)
        else:
            self._ui_queue.put(lambda: func(*args, **kwargs))

    def _set_progress(self, value):
        self._ui(self.progress_var.set, value)

    def _is_busy(self):
        return self._worker is not None and self._worker.is_alive()

    def _start_worker(self, target):
        self._worker = threading.Thread(target=target, daemon=True)
        self._worker.start()

    # -------------------------------------------------------------- logging

    def log(self, message, level='info'):
        """Add a message to the log. Safe to call from worker threads."""
        self._ui(self._append_log, message, level)

    def _append_log(self, message, level):
        if self.quiet_mode.get() and level not in ('error', 'success'):
            return

        timestamp = datetime.now().strftime("%H:%M:%S")
        prefix = LOG_PREFIXES.get(level, LOG_PREFIXES['info'])

        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, f"[{timestamp}] {prefix} {message}\n", level)
        self.log_text.config(state=tk.DISABLED)
        self.log_text.see(tk.END)
        self.status_var.set(message[:80])

    def _log_block(self, lines):
        """Append plain lines (no timestamp), e.g. a summary. Always shown."""
        def append():
            self.log_text.config(state=tk.NORMAL)
            self.log_text.insert(tk.END, "\n".join(lines) + "\n")
            self.log_text.config(state=tk.DISABLED)
            self.log_text.see(tk.END)
        self._ui(append)

    # --------------------------------------------------------------- reset

    def browse_backup_path(self):
        path = filedialog.askdirectory(initialdir=self.backup_path.get() or None)
        if path:
            self.backup_path.set(path)

    def run_reset(self):
        if not IS_WINDOWS:
            messagebox.showerror("Windows Only", "The cache reset is only supported on Windows.")
            return
        if self._is_busy():
            return

        backup_root = self.backup_path.get().strip()
        if not backup_root:
            messagebox.showerror("Backup Path", "Please choose a backup folder first.")
            return

        if not messagebox.askyesno(
                "Confirm",
                "This will close Adobe applications and clear cached data.\n\nContinue?"):
            return

        self.run_btn.config(state=tk.DISABLED)
        self.progress_var.set(0)

        # Snapshot options so the worker never reads Tk variables.
        skip_close = self.skip_process_close.get()
        self._start_worker(lambda: self._reset_thread(Path(backup_root), skip_close))

    def _reset_thread(self, backup_root, skip_close):
        try:
            if skip_close:
                self.log("Skipping process close (user option)")
            else:
                self._close_adobe_processes()
            self._set_progress(25)

            cleared, session_backup = self._backup_and_clear_caches(backup_root)
            self._set_progress(75)

            self._clear_credentials()
            self._set_progress(90)

            self._restart_ccx()
            self._set_progress(100)

            self._show_completion(cleared, session_backup)
        except Exception as e:
            self.log(f"Error: {e}", 'error')
            self._ui(messagebox.showerror, "Error", f"Cache reset failed:\n\n{e}")
        finally:
            self._ui(self.run_btn.config, state=tk.NORMAL)

    def _close_adobe_processes(self):
        self.log("Closing Adobe processes...")

        for proc_name in ADOBE_PROCESSES:
            try:
                result = run_quiet(['taskkill', '/F', '/IM', f'{proc_name}.exe'])
                if result.returncode == 0:
                    self.log(f"Closed: {proc_name}")
            except OSError as e:
                self.log(f"Could not close {proc_name}: {e}", 'warning')

        # Give processes a moment to release file handles before deleting.
        time.sleep(2)
        self.log("Adobe processes closed (or not running)", 'success')

    def _backup_and_clear_caches(self, backup_root):
        self.log("Backing up and clearing caches...")

        target_paths = get_cache_paths()
        if not target_paths:
            raise RuntimeError("LOCALAPPDATA/APPDATA are not set; cannot locate Adobe caches.")

        existing = [p for p in target_paths if p.exists()]
        if not existing:
            self.log("No cache folders found - nothing to clear")
            return 0, None

        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        session_backup = backup_root / f"AdobeCache-{timestamp}"
        session_backup.mkdir(parents=True, exist_ok=True)

        cleared = 0
        for path in existing:
            # Encode the full path into one folder name so backups don't collide.
            safe_name = str(path).replace(':', '').replace('\\', '_').replace('/', '_')
            try:
                self.log(f"Backing up: {path}")
                shutil.copytree(path, session_backup / safe_name, dirs_exist_ok=True)
            except (OSError, shutil.Error) as e:
                # Never delete something we failed to back up.
                self.log(f"Backup failed, leaving in place: {path} ({e})", 'warning')
                continue

            try:
                shutil.rmtree(path)
                self.log(f"Cleared: {path}", 'success')
                cleared += 1
            except OSError as e:
                self.log(f"Could not clear: {path} ({e})", 'warning')

        self.log(f"Cleared {cleared} of {len(existing)} cache location(s)", 'success')
        return cleared, session_backup

    def _clear_credentials(self):
        """Clear Adobe credentials from Windows Credential Manager"""
        self.log("Clearing stale Adobe Web Credentials...")

        try:
            result = run_quiet(['cmdkey', '/list'])
        except OSError as e:
            self.log(f"Credential cleanup skipped: {e}", 'warning')
            return

        if result.returncode != 0:
            self.log("Credential cleanup skipped: cmdkey /list failed", 'warning')
            return

        removed = 0
        for line in result.stdout.splitlines():
            if 'Target:' not in line or 'adobe' not in line.lower():
                continue
            target = line.split('Target:', 1)[1].strip()
            delete = run_quiet(['cmdkey', f'/delete:{target}'])
            if delete.returncode == 0:
                self.log(f"Removed credential: {target}", 'success')
                removed += 1
            else:
                self.log(f"Could not remove credential: {target}", 'warning')

        if not removed:
            self.log("No Adobe credentials found")

    def _restart_ccx(self):
        """Restart Creative Cloud helper"""
        self.log("Starting Creative Cloud helper...")

        if not CCX_PATH.exists():
            self.log("CCXProcess not found at default location", 'warning')
            return

        try:
            subprocess.Popen([str(CCX_PATH)], close_fds=True, creationflags=NO_WINDOW)
            self.log("Creative Cloud helper started", 'success')
        except OSError as e:
            self.log(f"Could not start CCX: {e}", 'warning')

    def _show_completion(self, cleared, session_backup):
        self.log("Cleanup complete!", 'success')
        self._log_block([
            "=" * 60,
            f"Cleared {cleared} cache location(s)",
            f"Backup location: {session_backup or '(no backup needed)'}",
            "",
            "Next steps:",
            "  1. Open Adobe Acrobat and sign in with your Adobe ID",
            "  2. Try File > Request e-signatures again",
            "  3. If still failing, reboot to fully refresh tokens",
            "=" * 60,
        ])

        self._ui(
            messagebox.showinfo,
            "Complete",
            f"Cache reset complete!\n\n"
            f"Cleared {cleared} cache location(s)\n\n"
            f"Next steps:\n"
            f"1. Open Adobe Acrobat and sign in\n"
            f"2. Try Request e-signatures again\n"
            f"3. Reboot if still having issues"
        )

    # --------------------------------------------------------- other tools

    def check_processes(self):
        """Check which Adobe processes are running (in the background)."""
        if self._is_busy():
            return
        self.log("Checking Adobe processes...")
        self._start_worker(self._check_processes_thread)

    def _check_processes_thread(self):
        found = []
        try:
            if IS_WINDOWS:
                # One tasklist call instead of one per process.
                result = run_quiet(['tasklist', '/FO', 'CSV', '/NH'])
                running = {line.split('","')[0].strip('"').lower()
                           for line in result.stdout.splitlines() if line}
                found = [p for p in ADOBE_PROCESSES if f"{p.lower()}.exe" in running]
            else:
                for proc_name in ADOBE_PROCESSES:
                    if run_quiet(['pgrep', '-if', proc_name]).returncode == 0:
                        found.append(proc_name)
        except OSError as e:
            self.log(f"Could not list processes: {e}", 'error')
            return

        if found:
            self.log(f"Running Adobe processes: {', '.join(found)}", 'warning')
        else:
            self.log("No Adobe processes currently running", 'success')

    def open_backup_folder(self):
        path = self.backup_path.get().strip()
        if not path:
            self.log("No backup path set", 'error')
            return

        try:
            os.makedirs(path, exist_ok=True)
            if IS_WINDOWS:
                os.startfile(path)
            elif IS_MAC:
                subprocess.Popen(['open', path])
            else:
                subprocess.Popen(['xdg-open', path])
        except OSError as e:
            self.log(f"Could not open folder: {e}", 'error')

    def copy_log(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(self.log_text.get('1.0', 'end-1c'))
        self.status_var.set("Log copied to clipboard")

    def save_log(self):
        filename = filedialog.asksaveasfilename(
            defaultextension=".log",
            filetypes=[("Log files", "*.log"), ("Text files", "*.txt")],
            initialfile=f"adobe_reset_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
        )
        if not filename:
            return
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(self.log_text.get('1.0', 'end-1c'))
            self.status_var.set(f"Log saved to {filename}")
        except OSError as e:
            messagebox.showerror("Save Log", f"Could not save log:\n\n{e}")

    def clear_log(self):
        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete('1.0', tk.END)
        self.log_text.config(state=tk.DISABLED)
        self.status_var.set("Log cleared")

    def on_close(self):
        if self._is_busy() and not messagebox.askyesno(
                "Still Running",
                "An operation is still in progress. Closing now may leave caches "
                "partially cleared.\n\nClose anyway?"):
            return
        self.root.destroy()


def main():
    # DPI awareness must be set before the Tk window is created.
    if IS_WINDOWS:
        try:
            from ctypes import windll
            windll.shcore.SetProcessDpiAwareness(1)
        except (ImportError, AttributeError, OSError):
            pass

    root = tk.Tk()
    AdobeCacheResetTool(root)
    root.mainloop()


if __name__ == '__main__':
    main()
