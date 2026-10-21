"""Exercise the built TUI through a real Unix PTY using offline demo data only."""

import errno
import fcntl
import os
from pathlib import Path
import pty
import re
import select
import signal
import struct
import tempfile
import termios
import time


def main():
    root = Path(__file__).resolve().parent.parent
    with tempfile.TemporaryDirectory(prefix="academy-terminal-") as temporary:
        pid, terminal = pty.fork()
        if pid == 0:
            env = {**os.environ, "TERM": "xterm-256color", "TMPDIR": temporary,
                   "CI": "false", "CONTINUOUS_INTEGRATION": "false", "HERDR_ENV": "0"}
            fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 28, 100, 0, 0))
            launcher = str(root / "scripts" / "academy.sh")
            os.execve(launcher, [launcher, "--demo", "--no-onboarding"], env)

        output = bytearray()
        reaped = False

        def receive():
            if not select.select([terminal], [], [], 0.1)[0]:
                return
            try:
                data = os.read(terminal, 65536)
            except OSError as error:
                if error.errno == errno.EIO:
                    data = b""
                else:
                    raise
            if not data:
                raise RuntimeError("TUI closed before the expected frame")
            output.extend(data)
            if len(output) > 2 * 1024 * 1024:
                raise RuntimeError("TUI exceeded the smoke output limit")

        def wait_for(text, start=0):
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                plain = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", output[start:].decode("utf-8", "replace"))
                if text in plain:
                    return
                receive()
            raise RuntimeError(f"TUI did not show: {text}")

        def key(value, expected):
            start = len(output)
            os.write(terminal, value.encode())
            wait_for(expected, start)

        try:
            wait_for("AGENT ACADEMY")
            wait_for("BEKLEMEDE")
            key("b", "Tur tamamlandı")
            key("2", "Ne oldu?")
            key("3", "Gerçek kod")
            key("4", "Kanıta bağlı akış")
            key("5", "Birlikte derinleşelim")
            key("6", "Mühendislik değerlendirmesi")
            key("d", "Durduruldu.")
            os.write(terminal, b"q")
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                done, status = os.waitpid(pid, os.WNOHANG)
                if done:
                    reaped = True
                    while select.select([terminal], [], [], 0)[0]:
                        try:
                            data = os.read(terminal, 65536)
                        except OSError as error:
                            if error.errno == errno.EIO:
                                break
                            raise
                        if not data:
                            break
                        output.extend(data)
                    if os.waitstatus_to_exitcode(status) != 0:
                        raise RuntimeError("TUI exited unsuccessfully")
                    if b"\x1b[?1049h" not in output or b"\x1b[?1049l" not in output:
                        raise RuntimeError("TUI did not restore the alternate screen")
                    print("PASS: real PTY start / six views / stop / quit / terminal restoration")
                    return
                if select.select([terminal], [], [], 0.1)[0]:
                    try:
                        output.extend(os.read(terminal, 65536))
                    except OSError as error:
                        if error.errno != errno.EIO:
                            raise
            raise RuntimeError("TUI did not exit after Q")
        finally:
            if not reaped:
                os.kill(pid, signal.SIGKILL)
                os.waitpid(pid, 0)
            os.close(terminal)


if __name__ == "__main__":
    main()
