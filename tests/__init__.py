import os

# Keep Dropbox integrations disabled during tests to avoid live data sync.
os.environ.setdefault("TALUS_TALLY_DISABLE_DROPBOX", "1")
