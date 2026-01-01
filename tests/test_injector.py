import pytest
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
<!-- TALLY_START -->
- [ ] Old Task 1
- [ ] Old Task 2
<!-- TALLY_END -->

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
