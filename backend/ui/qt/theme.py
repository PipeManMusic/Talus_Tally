"""Qt stylesheet theme for Talus Tally - Bronco II Restomod aesthetic."""
from backend.ui.viewmodels.config import THEME_COLORS


def get_bronco_stylesheet() -> str:
    """Generate Qt stylesheet with Bronco II Restomod theme colors.
    
    Returns:
        QSS (Qt Style Sheet) string with dark theme and Ford Molten Orange accents
    """
    return f"""
    /* Main Application */
    QMainWindow, QWidget {{
        background-color: {THEME_COLORS['background_dark']};
        color: {THEME_COLORS['foreground']};
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 9pt;
    }}
    
    /* Custom Title Bar and Dock Titles - Use Michroma */
    CustomTitleBar, QDockWidget::title {{
        font-family: 'Michroma', 'Segoe UI', Arial, sans-serif;
    }}
    
    /* Dock Widgets */
    QDockWidget {{
        background-color: {THEME_COLORS['background_light']};
        color: {THEME_COLORS['foreground']};
        titlebar-close-icon: url(close.png);
        titlebar-normal-icon: url(float.png);
        font-family: 'Michroma', 'Segoe UI', Arial, sans-serif;
    }}
    
    QDockWidget::title {{
        background-color: {THEME_COLORS['background_light']};
        padding: 6px;
        border-bottom: 2px solid {THEME_COLORS['accent']};
        text-align: left;
        font-family: 'Michroma', 'Segoe UI', Arial, sans-serif;
    }}
    
    /* Tree View */
    QTreeView {{
        background-color: {THEME_COLORS['background_light']};
        color: {THEME_COLORS['foreground']};
        border: 1px solid {THEME_COLORS['border']};
        selection-background-color: {THEME_COLORS['selection']};
        selection-color: {THEME_COLORS['foreground']};
        outline: none;
    }}
    
    QTreeView::item {{
        padding: 4px;
        border: none;
    }}
    
    QTreeView::item:hover {{
        background-color: {THEME_COLORS['selection']};
    }}
    
    QTreeView::item:selected {{
        background-color: {THEME_COLORS['selection']};
        border-left: 3px solid {THEME_COLORS['accent']};
    }}
    
    QTreeView::branch {{
        background-color: {THEME_COLORS['background_light']};
    }}
    
    /* Input Fields */
    QLineEdit, QSpinBox, QDoubleSpinBox, QTextEdit, QPlainTextEdit {{
        background-color: {THEME_COLORS['background_dark']};
        color: {THEME_COLORS['foreground']};
        border: 1px solid {THEME_COLORS['border']};
        padding: 4px;
        border-radius: 2px;
    }}
    
    QLineEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus, 
    QTextEdit:focus, QPlainTextEdit:focus {{
        border: 1px solid {THEME_COLORS['accent']};
    }}
    
    /* ComboBox */
    QComboBox {{
        background-color: {THEME_COLORS['background_dark']};
        color: {THEME_COLORS['foreground']};
        border: 1px solid {THEME_COLORS['border']};
        padding: 4px;
        border-radius: 2px;
    }}
    
    QComboBox:focus {{
        border: 1px solid {THEME_COLORS['accent']};
    }}
    
    QComboBox::drop-down {{
        border: none;
        width: 20px;
    }}
    
    QComboBox::down-arrow {{
        image: none;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-top: 4px solid {THEME_COLORS['foreground']};
        width: 0;
        height: 0;
    }}
    
    QComboBox QAbstractItemView {{
        background-color: {THEME_COLORS['background_dark']};
        color: {THEME_COLORS['foreground']};
        border: 1px solid {THEME_COLORS['border']};
        selection-background-color: {THEME_COLORS['selection']};
    }}
    
    /* Buttons */
    QPushButton {{
        background-color: {THEME_COLORS['background_light']};
        color: {THEME_COLORS['foreground']};
        border: 1px solid {THEME_COLORS['border']};
        padding: 6px 12px;
        border-radius: 3px;
    }}
    
    QPushButton:hover {{
        background-color: {THEME_COLORS['selection']};
        color: {THEME_COLORS['accent_hover']};
        border: 1px solid {THEME_COLORS['accent']};
    }}
    
    QPushButton:pressed {{
        background-color: {THEME_COLORS['background_dark']};
    }}
    
    QPushButton:disabled {{
        color: {THEME_COLORS['border']};
        border: 1px solid {THEME_COLORS['border']};
    }}
    
    /* Menu Bar */
    QMenuBar {{
        background-color: {THEME_COLORS['background_light']};
        color: {THEME_COLORS['foreground']};
        border-bottom: 1px solid {THEME_COLORS['border']};
        font-family: 'Michroma', 'Segoe UI', Arial, sans-serif;
    }}
    
    QMenuBar::item {{
        background-color: transparent;
        padding: 4px 8px;
    }}
    
    QMenuBar::item:selected {{
        background-color: {THEME_COLORS['selection']};
        color: {THEME_COLORS['accent_hover']};
    }}
    
    QMenuBar::item:pressed {{
        background-color: {THEME_COLORS['accent']};
    }}
    
    /* Menus */
    QMenu {{
        background-color: {THEME_COLORS['background_light']};
        color: {THEME_COLORS['foreground']};
        border: 1px solid {THEME_COLORS['border']};
    }}
    
    QMenu::item {{
        padding: 6px 24px 6px 8px;
    }}
    
    QMenu::item:selected {{
        background-color: {THEME_COLORS['selection']};
        color: {THEME_COLORS['accent_hover']};
    }}
    
    QMenu::separator {{
        height: 1px;
        background-color: {THEME_COLORS['border']};
        margin: 4px 0px;
    }}
    
    /* Toolbar */
    QToolBar {{
        background-color: {THEME_COLORS['background_light']};
        border: none;
        border-bottom: 1px solid {THEME_COLORS['border']};
        spacing: 0px;
        padding: 0px 2px;
        margin: 0px;
        font-family: 'Michroma', 'Segoe UI', Arial, sans-serif;
    }}
    
    QToolBar::separator {{
        background-color: {THEME_COLORS['border']};
        width: 1px;
        margin: 0px;
        padding: 0px;
    }}
    
    QToolButton {{
        background-color: transparent;
        color: {THEME_COLORS['foreground']};
        border: none;
        padding: 2px;
        margin: 0px;
        border-radius: 2px;
    }}
    
    QToolButton:hover {{
        background-color: {THEME_COLORS['selection']};
        border: 1px solid {THEME_COLORS['accent']};
    }}
    
    QToolButton:pressed {{
        background-color: {THEME_COLORS['background_dark']};
    }}
    
    /* Scrollbars */
    QScrollBar:vertical {{
        background-color: {THEME_COLORS['background_light']};
        width: 12px;
        border: none;
    }}
    
    QScrollBar::handle:vertical {{
        background-color: {THEME_COLORS['border']};
        min-height: 20px;
        border-radius: 6px;
    }}
    
    QScrollBar::handle:vertical:hover {{
        background-color: {THEME_COLORS['accent']};
    }}
    
    QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
        height: 0px;
    }}
    
    QScrollBar:horizontal {{
        background-color: {THEME_COLORS['background_light']};
        height: 12px;
        border: none;
    }}
    
    QScrollBar::handle:horizontal {{
        background-color: {THEME_COLORS['border']};
        min-width: 20px;
        border-radius: 6px;
    }}
    
    QScrollBar::handle:horizontal:hover {{
        background-color: {THEME_COLORS['accent']};
    }}
    
    QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal {{
        width: 0px;
    }}
    
    /* Labels */
    QLabel {{
        background-color: transparent;
        color: {THEME_COLORS['foreground']};
    }}
    
    QLabel#titleLabel {{
        font-family: 'Michroma', 'Segoe UI', Arial, sans-serif;
    }}
    
    /* Dialog */
    QDialog {{
        background-color: {THEME_COLORS['background_dark']};
        color: {THEME_COLORS['foreground']};
    }}
    
    /* Dialog Button Box */
    QDialogButtonBox QPushButton {{
        min-width: 70px;
    }}
    
    /* Splitter */
    QSplitter::handle {{
        background-color: {THEME_COLORS['border']};
    }}
    
    QSplitter::handle:hover {{
        background-color: {THEME_COLORS['accent']};
    }}
    
    /* Status Bar */
    QStatusBar {{
        background-color: {THEME_COLORS['background_light']};
        color: {THEME_COLORS['foreground']};
        border-top: 1px solid {THEME_COLORS['border']};
    }}
    
    /* Header View */
    QHeaderView::section {{
        background-color: {THEME_COLORS['background_light']};
        color: {THEME_COLORS['foreground']};
        padding: 4px;
        border: 1px solid {THEME_COLORS['border']};
    }}
    
    /* Tab Widget */
    QTabWidget::pane {{
        border: 1px solid {THEME_COLORS['border']};
        background-color: {THEME_COLORS['background_light']};
    }}
    
    QTabBar::tab {{
        background-color: {THEME_COLORS['background_dark']};
        color: {THEME_COLORS['foreground']};
        padding: 6px 12px;
        border: 1px solid {THEME_COLORS['border']};
    }}
    
    QTabBar::tab:selected {{
        background-color: {THEME_COLORS['background_light']};
        border-bottom: 2px solid {THEME_COLORS['accent']};
    }}
    
    QTabBar::tab:hover {{
        background-color: {THEME_COLORS['selection']};
    }}
    """
