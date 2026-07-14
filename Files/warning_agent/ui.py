import os

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QPixmap, QFont
from PySide6.QtWidgets import (
    QWidget,
    QLabel,
    QVBoxLayout,
    QProgressBar,
)


class WarningWindow(QWidget):

    def __init__(self, reason, seconds):
        super().__init__()

        self.seconds = seconds

        self.setAttribute(Qt.WA_DeleteOnClose)

        self.setWindowFlags(
            Qt.FramelessWindowHint |
            Qt.WindowStaysOnTopHint |
            Qt.Tool
        )

        self.background = QLabel(self)
        self.background.setGeometry(self.rect())

        path = os.path.join(
            os.path.dirname(__file__),
            "assets",
            "background.png"
        )

        pix = QPixmap(path)

        if not pix.isNull():
            self.background.setPixmap(pix)

        self.background.setScaledContents(True)
        self.background.lower()

        # Message text + progress bar + countdown number: one borderless
        # group, anchored near the bottom of the screen (no boxes/frames).
        self.bottom_group = QWidget(self)
        self.bottom_group.setFixedWidth(800)
        self.bottom_group.setStyleSheet("background: transparent;")

        group_layout = QVBoxLayout(self.bottom_group)
        group_layout.setContentsMargins(0, 0, 0, 0)
        group_layout.setSpacing(10)
        group_layout.setAlignment(Qt.AlignCenter)

        self.title = QLabel(reason)
        self.title.setAlignment(Qt.AlignCenter)
        self.title.setWordWrap(True)
        self.title.setStyleSheet(
            "color:white; background: transparent;"
        )
        self.title.setFont(
            QFont(
                "Segoe UI",
                28,
                QFont.Bold
            )
        )

        self.bar = QProgressBar()
        self.bar.setFixedSize(
            800,
            14
        )
        self.bar.setRange(
            0,
            seconds
        )
        self.bar.setValue(seconds)
        self.bar.setTextVisible(False)

        self.bar.setStyleSheet("""
        QProgressBar{
            border:1px solid #E53935;
            border-radius:7px;
            background-color:transparent;
        }

        QProgressBar::chunk{
            background-color:#E53935;
            border-radius:5px;
        }
        """)

        self.timerLabel = QLabel(str(seconds))
        self.timerLabel.setAlignment(Qt.AlignCenter)
        self.timerLabel.setStyleSheet(
            "color:white; background: transparent;"
        )
        self.timerLabel.setFont(
            QFont(
                "Segoe UI",
                13,
                QFont.Bold
            )
        )

        group_layout.addWidget(self.title)
        group_layout.addWidget(
            self.bar,
            alignment=Qt.AlignCenter
        )
        group_layout.addWidget(self.timerLabel)

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.tick)
        self.timer.start(1000)

        self.position_bottom_group()

        self.showFullScreen()

        self.raise_()
        self.bottom_group.raise_()
        self.activateWindow()

    def position_bottom_group(self):
        # Centered horizontally, pinned near the bottom of the screen.
        self.bottom_group.adjustSize()
        x = (self.width() - self.bottom_group.width()) // 2
        y = self.height() - self.bottom_group.height() - 15
        self.bottom_group.move(x, y)

    def resizeEvent(self, event):
        super().resizeEvent(event)

        if not hasattr(self, "background"):
            return

        self.background.setGeometry(self.rect())
        self.background.lower()

        if hasattr(self, "bottom_group"):
            self.position_bottom_group()
            self.bottom_group.raise_()

    def keyPressEvent(self, event):
        event.ignore()

    def closeEvent(self, event):
        event.accept()

    def tick(self):
        self.seconds -= 1

        if self.seconds < 0:
            self.timer.stop()
            self.close()
            return

        self.bar.setValue(self.seconds)
        self.timerLabel.setText(str(self.seconds))
