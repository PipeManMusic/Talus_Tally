from datetime import timezone

import dropbox
from dropbox.exceptions import AuthError, ApiError
import os
import json


class DropboxSyncConflict(Exception):
    """Raised when the remote Dropbox data was modified after the last download."""


    pass

def _patch_dropbox_datetime():
    original_datetime = getattr(dropbox.dropbox_client, "datetime", None)
    if not original_datetime or getattr(original_datetime, "_talus_patched", False):
        return

    class _TalusDropboxDateTime(original_datetime):
        @classmethod
        def utcnow(cls):
            # Use timezone-aware timestamps to avoid Python 3.13 deprecation warnings.
            return original_datetime.now(timezone.utc)

    _TalusDropboxDateTime._talus_patched = True
    dropbox.dropbox_client.datetime = _TalusDropboxDateTime


_patch_dropbox_datetime()


class SyncManager:
    def __init__(self, access_token=None, refresh_token=None, app_key=None, app_secret=None):
        if refresh_token and app_key and app_secret:
            self.dbx = dropbox.Dropbox(
                oauth2_refresh_token=refresh_token,
                app_key=app_key,
                app_secret=app_secret
            )
        else:
            self.dbx = dropbox.Dropbox(access_token)
            
        # Dropbox App Folder paths resolve under Dropbox/Apps/<AppName>
        self.remote_path = "/data/talus_master.json"
        self.remote_rev = None

    def _ensure_remote_folder(self, folder_path):
        """Ensure parent folder exists when running as an App Folder integration."""
        if not folder_path or folder_path == "/":
            return
        try:
            self.dbx.files_get_metadata(folder_path)
        except ApiError as e:
            if e.error.is_path() and e.error.get_path().is_not_found():
                try:
                    self.dbx.files_create_folder_v2(folder_path)
                except Exception as create_error:
                    print(f"Dropbox Folder Create Error: {create_error}")
            else:
                print(f"Dropbox API Error checking folder: {e}")
        except Exception as e:
            print(f"Error ensuring remote folder: {e}")

    def _upload_file(self, local_path, remote_path, *, track_rev=False):
        remote_folder = os.path.dirname(remote_path)
        self._ensure_remote_folder(remote_folder)
        with open(local_path, "rb") as f:
            data = f.read()

        mode = dropbox.files.WriteMode.overwrite
        if track_rev and self.remote_rev:
            mode = dropbox.files.WriteMode.update(self.remote_rev)

        try:
            metadata = self.dbx.files_upload(
                data,
                remote_path,
                mode=mode
            )
            if track_rev:
                self.remote_rev = metadata.rev
            return metadata
        except ApiError as e:
            if track_rev and e.error.is_path() and e.error.get_path().is_conflict():
                raise DropboxSyncConflict("Remote data has changed since the last sync.") from e
            raise

    def download_db(self, local_path):
        """
        Downloads the database from Dropbox to the local path.
        Returns True if successful, False otherwise.
        """
        try:
            # Check if file exists on Dropbox
            try:
                metadata = self.dbx.files_get_metadata(self.remote_path)
                self.remote_rev = getattr(metadata, "rev", None)
            except ApiError as e:
                if e.error.is_path() and e.error.get_path().is_not_found():
                    print("Remote file not found.")
                    self.remote_rev = None
                    return False
                else:
                    print(f"Dropbox API Error checking metadata: {e}")
                    return False
            except Exception as e:
                print(f"Error checking metadata: {e}")
                return False

            # Download
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            with open(local_path, "wb") as f:
                metadata, res = self.dbx.files_download(self.remote_path)
                self.remote_rev = getattr(metadata, "rev", None)
                f.write(res.content)
            return True
        except AuthError as e:
            print(f"Dropbox Auth Error: {e}")
            return False
        except Exception as e:
            print(f"Dropbox Download Error: {e}")
            return False

    def upload_db(self, local_path):
        """
        Uploads the local database to Dropbox.
        Returns True if successful, False otherwise.
        """
        try:
            self._upload_file(local_path, self.remote_path, track_rev=True)

            # Upload backups directory if present
            local_dir = os.path.dirname(local_path)
            backups_dir = os.path.join(local_dir, "backups")
            if os.path.isdir(backups_dir):
                remote_backups_dir = f"{os.path.dirname(self.remote_path)}/backups"
                for entry in os.listdir(backups_dir):
                    local_backup = os.path.join(backups_dir, entry)
                    if os.path.isfile(local_backup):
                        remote_backup = f"{remote_backups_dir}/{entry}"
                        try:
                            self._upload_file(local_backup, remote_backup)
                        except Exception as backup_error:
                            print(f"Dropbox Backup Upload Error ({entry}): {backup_error}")
            return True
        except DropboxSyncConflict:
            raise
        except Exception as e:
            print(f"Dropbox Upload Error: {e}")
            return False
