import pytest
from PySide6.QtWidgets import QToolBar, QMenu, QMenuBar
from frontend.desktop.app import TalusWindow

def test_sort_button_exists_in_toolbar(qtbot):
    """Verify that the Sort action is explicitly present in the main toolbar."""
    window = TalusWindow()
    window.data_path = None # Prevent accidental overwrite of real data
    qtbot.addWidget(window)

    # 1. Find the toolbar
    toolbars = window.findChildren(QToolBar)
    assert len(toolbars) > 0, "No toolbar found in the application!"
    main_toolbar = toolbars[0]

    # 2. Scan actions for the Sort button
    found_sort = False
    for action in main_toolbar.actions():
        # We named it "Sort" in the QAction constructor
        if action.text() == "Sort":
            found_sort = True
            break
    
    assert found_sort, "Sort button is missing from the Toolbar!"

def test_view_menu_exists(qtbot):
    """Verify the View menu exists and contains the Sort command."""
    window = TalusWindow()
    window.data_path = None # Prevent accidental overwrite of real data
    qtbot.addWidget(window)

    menubar = window.menuBar()
    
    # 1. Find 'View' Menu
    view_menu = None
    for action in menubar.actions():
        if action.text() == "View":
            view_menu = action.menu()
            break
            
    assert view_menu is not None, "View menu is missing from the Menu Bar!"
    
    # 2. Check for 'Sort by Velocity' action inside View menu
    found_sort_item = False
    for action in view_menu.actions():
        if action.text() == "Sort by Velocity":
            found_sort_item = True
            break
            
    assert found_sort_item, "'Sort by Velocity' option is missing from the View menu!"