#!/usr/bin/env python3
import sys
import os
import subprocess
import shutil

# CONFIGURATION
TEST_MAP = {
    "frontend/desktop/app.py": "tests/test_gui.py",
    "backend/manager.py": "tests/test_manager.py",
    "backend/engine.py": "tests/test_logic.py",
    "backend/models.py": "tests/test_logic.py",
    "backend/git_manager.py": "tests/test_git.py",
    "backend/ingestor.py": "tests/test_ingestor.py",
    "tests/test_persistence.py": "tests/test_persistence.py",
    "tests/test_safety.py": "tests/test_safety.py",
    "tests/test_gui.py": "tests/test_gui.py",
    "tests/test_sort_ui.py": "tests/test_sort_ui.py",
    "tests/test_ui_elements.py": "tests/test_ui_elements.py",
    "tests/test_context_menu.py": "tests/test_context_menu.py",
    "tests/test_progress.py": "tests/test_progress.py",
    "tests/test_shopping_list.py": "tests/test_shopping_list.py",
    "tests/test_drag_drop.py": "tests/test_drag_drop.py"
}

def run_tests(target_file):
    print(f"⚡ Verifying {target_file}...")
    test_target = TEST_MAP.get(target_file, ".")
    result = subprocess.run(["pytest", test_target], capture_output=False)
    if result.returncode == 0:
        print(f"✅ VERIFIED: Changes to {target_file} passed tests.")
    else:
        print(f"❌ FAILED: Changes to {target_file} broke the build.")

def get_editor_command(filename):
    env_editor = os.getenv('EDITOR')
    if env_editor:
        return [env_editor, filename]
    if shutil.which('code'):
        print("🔹 VS Code detected. Opening in 'Wait' mode...")
        return ['code', '--wait', filename]
    print("🔸 VS Code not found. Falling back to nano.")
    return ['nano', filename]

def edit_file(filename):
    directory = os.path.dirname(filename)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)

    if not os.path.exists(filename):
        with open(filename, 'w') as f:
            pass

    cmd = get_editor_command(filename)
    print(f"📝 Opening {filename}...")
    print("👉 ACTION: Select All -> Paste New Code -> Save -> Close Tab.")
    subprocess.call(cmd)
    print("⌛ File closed. Running verification...")
    run_tests(filename)

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 dev.py [edit|test] [filename]")
        return
    command = sys.argv[1]
    target = sys.argv[2]
    if command == "edit":
        edit_file(target)
    elif command == "test":
        run_tests(target)
    else:
        print(f"Unknown command: {command}")

if __name__ == "__main__":
    main()