"""
ORYN Windows Desktop Launcher
Desktop packaging layer only. Machine/control logic remains in main.py/modules.

The ORYN FastAPI backend runs in a worker thread while pywebview owns the
Windows main/UI thread. ORYN's existing lifespan registers SIGINT/SIGTERM.
Python only permits signal registration from the main thread, so this launcher
provides a Windows-desktop-safe signal wrapper that ignores registration
attempts from the backend worker thread while leaving main-thread signal
behavior untouched.
"""
from __future__ import annotations

import ctypes
import os
import signal
import sys
import threading
import time
import traceback
import urllib.request
from pathlib import Path


def _runtime_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


APP_DIR = _runtime_dir()
os.chdir(APP_DIR)

USER_DATA = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "ORYN"
USER_DATA.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("ORYN_DATA_DIR", str(USER_DATA))

STARTUP_LOG = USER_DATA / "startup.log"
ERROR_LOG = USER_DATA / "startup-error.log"

# PyInstaller windowed applications have sys.stdout/sys.stderr == None.
# Uvicorn's default formatter expects a stream with .isatty(), so provide
# hidden file-backed streams for the packaged desktop process.
_STDOUT_LOG = USER_DATA / "backend-stdout.log"
_STDERR_LOG = USER_DATA / "backend-stderr.log"

if sys.stdout is None:
    sys.stdout = open(_STDOUT_LOG, "a", encoding="utf-8", buffering=1)
if sys.stderr is None:
    sys.stderr = open(_STDERR_LOG, "a", encoding="utf-8", buffering=1)


def _log(msg: str) -> None:
    try:
        with STARTUP_LOG.open("a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {msg}\n")
    except Exception:
        pass


def _error_box(message: str) -> None:
    try:
        ctypes.windll.user32.MessageBoxW(0, message, "ORYN could not start", 0x10)
    except Exception:
        pass


# Preserve the real signal function. Main-thread calls still work normally.
_REAL_SIGNAL = signal.signal


def _desktop_safe_signal(sig, handler):
    if threading.current_thread() is not threading.main_thread():
        _log(f"Ignoring signal registration from backend thread: {sig}")
        return None
    return _REAL_SIGNAL(sig, handler)


def _server_thread():
    try:
        # ORYN's lifespan calls signal.signal during startup. Because this
        # backend intentionally runs off the Windows UI thread, use the safe
        # wrapper for the packaged desktop process.
        signal.signal = _desktop_safe_signal

        import uvicorn
        from main import app

        config = uvicorn.Config(
            app,
            host="127.0.0.1",
            port=8080,
            workers=1,
            log_level="info",
            access_log=False,
            log_config=None,
        )
        server = uvicorn.Server(config)

        _log("Starting embedded ORYN backend on 127.0.0.1:8080")
        server.run()
        _log("Embedded ORYN backend stopped.")

    except BaseException as exc:
        detail = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        try:
            ERROR_LOG.write_text(detail, encoding="utf-8")
        except Exception:
            pass
        _log(f"SERVER FATAL: {exc!r}")


def _wait_until_ready(timeout: float = 45.0) -> bool:
    deadline = time.time() + timeout
    url = "http://127.0.0.1:8080/"
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.0) as response:
                if response.status == 200:
                    _log("ORYN backend is ready.")
                    return True
        except Exception:
            time.sleep(0.35)
    return False


def main() -> None:
    try:
        # Start a fresh startup log for each run.
        try:
            STARTUP_LOG.write_text("", encoding="utf-8")
            if ERROR_LOG.exists():
                ERROR_LOG.unlink()
        except Exception:
            pass

        _log(f"Launching ORYN desktop from {APP_DIR}")
        _log(
            "Production UI exists="
            f"{(APP_DIR / 'static' / 'dist' / 'index.html').exists()}"
        )

        server_thread = threading.Thread(
            target=_server_thread,
            name="ORYN-Backend",
            daemon=True,
        )
        server_thread.start()

        if not _wait_until_ready():
            extra = ""
            if ERROR_LOG.exists():
                try:
                    detail = ERROR_LOG.read_text(encoding="utf-8", errors="ignore")
                    if detail.strip():
                        extra = "\n\nBackend error:\n" + detail[-1800:]
                except Exception:
                    pass

            raise RuntimeError(
                "ORYN backend did not become ready on 127.0.0.1:8080 "
                "within 45 seconds." + extra
            )

        import webview

        _log("Creating ORYN desktop window.")
        webview.create_window(
            title="ORYN",
            url="http://127.0.0.1:8080/",
            width=1440,
            height=900,
            min_size=(980, 650),
            resizable=True,
            fullscreen=False,
            confirm_close=False,
            background_color="#050505",
        )

        # Windows 10/11: use installed Microsoft Edge WebView2.
        _log("Starting Edge WebView2 desktop shell.")
        webview.start(gui="edgechromium", debug=False)

    except BaseException as exc:
        detail = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        try:
            ERROR_LOG.write_text(detail, encoding="utf-8")
        except Exception:
            pass

        _log(f"DESKTOP FATAL: {exc!r}")
        _error_box(
            "ORYN could not start.\n\n"
            f"{exc}\n\n"
            "Diagnostic log:\n"
            f"{ERROR_LOG}"
        )
        raise


if __name__ == "__main__":
    main()
