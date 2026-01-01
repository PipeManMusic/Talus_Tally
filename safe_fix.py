import os

print("🔧 Applying Safe Fix (Bypassing Shell Filters)...")

# 1. Construct the sensitive tags using Python addition
# (This prevents your terminal from stripping them out)
TAG_START = "<" + "!-- TALLY_START --" + ">"
TAG_END   = "<" + "!-- TALLY_END --" + ">"

# ---------------------------------------------------------
# FIX 1: backend/injector.py
# ---------------------------------------------------------
injector_code = r'''import os

class DocInjector:
    def __init__(self, file_path: str):
        self.file_path = file_path
        # Define the surgical boundary markers
        self.START_MARKER = "PLACEHOLDER_START"
        self.END_MARKER = "PLACEHOLDER_END"

    def update_roadmap(self, new_content: str) -> bool:
        """
        Replaces text between markers with new_content.
        Returns True if successful, False if markers not found.
        """
        if not os.path.exists(self.file_path):
            raise FileNotFoundError(f"Target file not found: {self.file_path}")

        with open(self.file_path, "r") as f:
            full_text = f.read()

        # Find the positions of the markers
        start_idx = full_text.find(self.START_MARKER)
        end_idx = full_text.find(self.END_MARKER)

        # Safety Check: Do both markers exist?
        if start_idx == -1 or end_idx == -1:
            print(f"⚠️ Markers not found in {self.file_path}. Skipping injection.")
            return False

        # Calculate where to cut
        # cut_start: End of the START marker
        cut_start = start_idx + len(self.START_MARKER)
        
        # cut_end: Start of the END marker
        cut_end = end_idx

        # Reassemble the file:
        # [Header + Start Marker] + [New Content] + [End Marker + Footer]
        updated_text = (
            full_text[:cut_start] + 
            "\n" + new_content + "\n" + 
            full_text[cut_end:]
        )

        # Write the patient back to disk
        with open(self.file_path, "w") as f:
            f.write(updated_text)
            
        return True
'''
# Inject the real tags now
injector_code = injector_code.replace("PLACEHOLDER_START", TAG_START)
injector_code = injector_code.replace("PLACEHOLDER_END", TAG_END)

with open("backend/injector.py", "w") as f:
    f.write(injector_code)
print("✅ backend/injector.py fixed.")


# ---------------------------------------------------------
# FIX 2: tests/test_injector.py
# ---------------------------------------------------------
test_code = r'''import pytest
import os
from backend.injector import DocInjector

# We create a temporary file for testing so we don't mess up real files
@pytest.fixture
def temp_readme(tmp_path):
    d = tmp_path / "subdir"
    d.mkdir()
    p = d / "TEST_README.md"
    content = """
# My Project
This is the intro.

## Roadmap
PLACEHOLDER_START
- [ ] Old Task 1
- [ ] Old Task 2
PLACEHOLDER_END

## Footer
Copyright 2026.
    """
    p.write_text(content)
    return p

def test_injection_logic(temp_readme):
    """
    Test: Does the injector replace ONLY the text between the markers?
    """
    new_roadmap = "- [x] New Task 1\n- [ ] New Task 2"
    
    injector = DocInjector(file_path=str(temp_readme))
    injector.update_roadmap(new_roadmap)
    
    # Read the file back
    updated_content = temp_readme.read_text()
    
    # ASSERTIONS
    assert "New Task 1" in updated_content
    assert "Old Task 1" not in updated_content
    assert "# My Project" in updated_content  # Top preserved
    assert "## Footer" in updated_content     # Bottom preserved
'''
# Inject the real tags now
test_code = test_code.replace("PLACEHOLDER_START", TAG_START)
test_code = test_code.replace("PLACEHOLDER_END", TAG_END)

with open("tests/test_injector.py", "w") as f:
    f.write(test_code)
print("✅ tests/test_injector.py fixed.")

print("🚀 READY. Run 'pytest' now.")
