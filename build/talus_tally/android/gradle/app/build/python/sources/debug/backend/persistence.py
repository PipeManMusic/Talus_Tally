import os
import shutil
import json
from datetime import datetime
from glob import glob

class PersistenceManager:
    def __init__(self, data_path, backup_dir=None, max_backups=5):
        self.data_path = os.path.abspath(data_path)
        if backup_dir is None:
            base_dir = os.path.dirname(self.data_path)
            backup_dir = os.path.join(base_dir, "backups")
        self.backup_dir = os.path.abspath(backup_dir)
        self.max_backups = max_backups

    def _model_to_json(self, data_model):
        if hasattr(data_model, "model_dump_json"):
            return data_model.model_dump_json(indent=4)
        if hasattr(data_model, "json"):
            return data_model.json(indent=4)
        if hasattr(data_model, "model_dump"):
            return json.dumps(data_model.model_dump(), indent=4)
        if hasattr(data_model, "dict"):
            return json.dumps(data_model.dict(), indent=4)
        return json.dumps(data_model, indent=4)

    def save(self, data_model):
        """
        Saves the data model to disk, creating a backup first.
        """
        # 1. Create Backup if file exists
        if os.path.exists(self.data_path):
            self._create_backup()

        # 2. Save new data
        # Ensure directory exists
        os.makedirs(os.path.dirname(self.data_path), exist_ok=True)
        
        # Write to temp file first then rename for atomic write
        temp_path = self.data_path + ".tmp"
        with open(temp_path, "w") as f:
            f.write(self._model_to_json(data_model))
        
        os.replace(temp_path, self.data_path)

    def _create_backup(self):
        os.makedirs(self.backup_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filename = os.path.basename(self.data_path)
        backup_path = os.path.join(self.backup_dir, f"{filename}.{timestamp}.bak")
        
        try:
            shutil.copy2(self.data_path, backup_path)
            self._prune_backups()
        except Exception as e:
            print(f"Backup failed: {e}")

    def _prune_backups(self):
        filename = os.path.basename(self.data_path)
        pattern = os.path.join(self.backup_dir, f"{filename}.*.bak")
        backups = sorted(glob(pattern))
        
        while len(backups) > self.max_backups:
            os.remove(backups.pop(0))
