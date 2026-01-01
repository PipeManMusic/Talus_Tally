import os

class DocInjector:
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.START_MARKER = ""
        self.END_MARKER = ""

    def update_roadmap(self, new_content: str) -> bool:
        if not os.path.exists(self.file_path):
            raise FileNotFoundError(f"Target file not found: {self.file_path}")

        with open(self.file_path, "r") as f:
            full_text = f.read()

        start_idx = full_text.find(self.START_MARKER)
        end_idx = full_text.find(self.END_MARKER)

        if start_idx == -1 or end_idx == -1:
            print(f"⚠️ Markers not found in {self.file_path}")
            return False

        cut_start = start_idx + len(self.START_MARKER)
        cut_end = end_idx

        updated_text = (
            full_text[:cut_start] + 
            "\n" + new_content + "\n" + 
            full_text[cut_end:]
        )

        with open(self.file_path, "w") as f:
            f.write(updated_text)
            
        return True
