import asyncio
import json
import logging
import os
import socket
import sys
import threading

import customtkinter as ctk
import websockets
from PIL import Image, ImageDraw
from PySide6.QtCore import QObject, Qt, Signal
from PySide6.QtWidgets import QApplication
from pystray import Icon, Menu, MenuItem

from ui import WarningWindow

SERVER_IP = "192.168.3.100"
SERVER_PORT = 8790

logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(message)s"
)


def load_machine_id():
    # Real exe folder on disk, even when frozen as a onefile PyInstaller exe
    # (sys.executable is the actual double-clicked path; __file__ would
    # instead point at the temp extraction folder for a frozen build).
    if getattr(sys, "frozen", False):
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    path = os.path.join(base_dir, "machine_id.txt")
    try:
        with open(path, "r", encoding="utf-8") as f:
            value = f.read().strip()
            if value:
                return value.upper()
    except Exception:
        pass

    # Fallback so the agent still connects (and shows up under *some* name)
    # even if nobody dropped a machine_id.txt next to it yet.
    return socket.gethostname().upper()


MACHINE_ID = load_machine_id()


class GuiSignals(QObject):
    show_warning = Signal(str, int)


class WarningAgent(QObject):

    def __init__(self):
        self.app = QApplication(sys.argv)

        super().__init__()

        ctk.set_appearance_mode("dark")

        self.warning_open = False

        self.signals = GuiSignals()
        self.signals.show_warning.connect(
            self.show_warning,
            Qt.QueuedConnection
        )

        self.create_tray()

        threading.Thread(
            target=self.websocket_thread,
            daemon=True
        ).start()

        sys.exit(self.app.exec())

    def create_tray(self):
        image = Image.new("RGB", (64, 64), (35, 35, 35))

        draw = ImageDraw.Draw(image)
        draw.ellipse(
            (14, 14, 50, 50),
            fill=(220, 0, 0)
        )

        menu = Menu(
            MenuItem(
                "Exit",
                self.exit_program
            )
        )

        self.tray = Icon(
            "WarningAgent",
            image,
            "Warning Agent",
            menu
        )

        threading.Thread(
            target=self.tray.run,
            daemon=True
        ).start()

    def exit_program(self):
        try:
            self.tray.stop()
        except Exception:
            pass

        self.app.quit()
        sys.exit(0)

    def websocket_thread(self):

        async def connect():

            uri = f"ws://{SERVER_IP}:{SERVER_PORT}"

            while True:

                try:
                    async with websockets.connect(
                        uri,
                        ping_interval=20,
                        ping_timeout=20,
                    ) as ws:

                        await ws.send(json.dumps({
                            "type": "hello",
                            "machine": MACHINE_ID,
                        }))

                        logging.info("Connected to server as %s", MACHINE_ID)

                        async for packet in ws:

                            try:
                                data = json.loads(packet)
                            except json.JSONDecodeError:
                                logging.warning("Invalid JSON received")
                                continue

                            if data.get("command") == "show_warning":

                                self.signals.show_warning.emit(
                                    data.get("reason", "Warning"),
                                    int(data.get("seconds", 30))
                                )

                except Exception as e:
                    logging.error(e)

                # Runs whether the connection errored out above or the
                # server just closed it normally — either way, wait a bit
                # before the next loop iteration retries the connection.
                await asyncio.sleep(3)

        asyncio.run(connect())

    def show_warning(self, reason, seconds):
        logging.info(
            "Showing warning: %s (%s sec)",
            reason,
            seconds
        )

        if self.warning_open:
            return

        self.warning_open = True

        self.window = WarningWindow(
            reason,
            seconds
        )

        self.window.destroyed.connect(
            self.on_window_closed
        )

        self.window.show()
        self.window.raise_()
        self.window.activateWindow()

    def on_window_closed(self):
        self.warning_open = False


if __name__ == "__main__":
    WarningAgent()