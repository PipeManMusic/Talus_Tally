import os

class DocInjector:
    def __init__(self, file_path: str):
        self.file_path = file_path
        # Define the surgical boundary markers
        self.START_MARKER = "<!-- TALLY_START -->"
        self.END_MARKER = "<!-- TALLY_END -->"

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
