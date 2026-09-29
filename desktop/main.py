"""Open the JIZURA browser app in its own window (WebView2).

The page is served at a fixed localhost port so WebCodecs, file saving and
IndexedDB work the same way they do in Chrome, and saved songs survive restarts.
"""
from __future__ import annotations

import ctypes
import os
import sys
import threading
from pathlib import Path

PORT = 47321
TITLE = 'JIZURA 字面'


def repo_root() -> Path:
    starts = []
    if getattr(sys, 'frozen', False):
        starts.append(Path(sys.executable).resolve().parent)
    starts.append(Path(__file__).resolve().parent)
    for start in starts:
        for candidate in (start, *start.parents):
            if (candidate / 'index.html').is_file() and (candidate / 'src').is_dir():
                return candidate
    raise SystemExit('index.html が見つかりません')


def fail(message: str) -> None:
    ctypes.windll.user32.MessageBoxW(None, message, TITLE, 0x10)
    raise SystemExit(1)


class DesktopApi:
    def __init__(self) -> None:
        self.editor = None

    def open_editor(self) -> None:
        # The page calls this on the UI thread. Creating the window has to hop
        # to another thread first, or WinForms Invoke deadlocks.
        threading.Thread(target=self._open_editor, daemon=True).start()

    def _open_editor(self) -> None:
        import webview
        if self.editor is not None:
            try:
                self.editor.show()
                return
            except Exception:
                self.editor = None
        window = webview.create_window(
            'JIZURA 配置',
            f'http://127.0.0.1:{PORT}/desktop/editor.html?v={int((repo_root() / "desktop" / "editor.html").stat().st_mtime)}',
            width=1280,
            height=820,
            min_size=(960, 640),
            background_color='#0c0c0e',
            text_select=True,
        )
        self.editor = window
        if window is not None:
            def clear() -> None:
                if self.editor is window:
                    self.editor = None
            try:
                window.events.closed += clear
            except Exception:
                pass


def main() -> None:
    if os.environ.get('JIZURA_DEBUG') == '1':
        os.environ['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = '--remote-debugging-port=9222'

    try:
        import webview
    except ImportError:
        fail('pywebview が入っていません。\n\npy -3.12 -m pip install pywebview')

    # MP4 の保存はブラウザのダウンロードとして届く。ここを許可しないと、書き出し後にファイルが捨てられる。
    webview.settings['ALLOW_DOWNLOADS'] = True

    root = repo_root()
    storage = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'JIZURA'
    storage.mkdir(parents=True, exist_ok=True)

    webview.create_window(
        TITLE,
        str(root / 'index.html'),
        js_api=DesktopApi(),
        width=1440,
        height=900,
        min_size=(1024, 680),
        background_color='#0c0c0e',
        text_select=True,
    )
    webview.start(
        gui='edgechromium',
        private_mode=False,
        storage_path=str(storage),
        http_port=PORT,
    )


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        fail(str(exc))
