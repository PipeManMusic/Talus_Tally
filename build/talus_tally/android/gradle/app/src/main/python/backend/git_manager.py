import git
import os
from datetime import datetime

class GitAutomation:
    def __init__(self, repo_path="."):
        """
        Initializes the Git repo connection.
        search_parent_directories=True allows this to work even if the app 
        is running from a subdirectory.
        """
        try:
            self.repo = git.Repo(os.path.abspath(repo_path), search_parent_directories=True)
            self.enabled = True
        except (git.exc.InvalidGitRepositoryError, git.exc.NoSuchPathError):
            self.repo = None
            self.enabled = False
            print(f"⚠️ Git Error: '{repo_path}' is not a valid repository. Auto-push disabled.")

    def push_update(self, task_name: str) -> bool:
        """
        Stages data/readme, Commits with task name, and Pushes to Origin.
        Returns True if successful.
        """
        if not self.enabled or not self.repo:
            return False

        try:
            # 1. Check for changes (Dirty Check)
            # We force it to check untracked files too, just in case
            if not self.repo.is_dirty(untracked_files=True):
                print("ℹ️ No git changes detected to push.")
                return False

            # 2. Stage Specific Files
            # We calculate paths relative to the repo root to be safe
            repo_root = self.repo.working_dir
            
            # Possible locations for our files (relative to where the script runs)
            # We want to be careful not to 'git add .' and accidentally commit junk.
            candidates = [
                "data/talus_master.json", 
                "README.md",
                "Tallus Tally/data/talus_master.json", # In case repo root is one level up
                "Tallus Tally/README.md"
            ]
            
            files_to_add = []
            for rel_path in candidates:
                full_path = os.path.join(repo_root, rel_path)
                # If file exists on disk, stage it
                if os.path.exists(full_path):
                    # git.index.add expects paths relative to CWD or absolute
                    files_to_add.append(full_path)

            if not files_to_add:
                print("⚠️ No target files found to commit.")
                return False
                
            self.repo.index.add(files_to_add)

            # 3. Commit
            timestamp = datetime.now().strftime("%Y-%m-%d")
            msg = f"Completed: {task_name} (via Talus Tally)"
            self.repo.index.commit(msg)
            print(f"✅ [Git] Committed: {msg}")

            # 4. Push
            # We assume 'origin' is the remote name
            origin = self.repo.remote(name='origin')
            origin.push()
            print("🚀 [Git] Pushed to origin/main.")
            return True

        except Exception as e:
            print(f"❌ Git Auto-Push Failed: {e}")
            return False