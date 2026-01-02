import dropbox
from dropbox import DropboxOAuth2FlowNoRedirect
from urllib.parse import urlparse, parse_qs
import os
import re

def get_refresh_token():
    print("--- Dropbox Refresh Token Generator ---")
    
    app_key = None
    app_secret = None
    secrets_path = "frontend/mobile/secrets.py"

    if os.path.exists(secrets_path):
        try:
            with open(secrets_path, "r") as f:
                content = f.read()
                key_match = re.search(r'DROPBOX_APP_KEY\s*=\s*["\']([^"\']+)["\']', content)
                secret_match = re.search(r'DROPBOX_APP_SECRET\s*=\s*["\']([^"\']+)["\']', content)
                
                if key_match and secret_match:
                    found_key = key_match.group(1)
                    found_secret = secret_match.group(1)
                    print(f"Found existing credentials in {secrets_path}")
                    print(f"App Key: {found_key}")
                    
                    use_existing = input("Use these credentials? (Y/n): ").strip().lower()
                    if use_existing in ['', 'y', 'yes']:
                        app_key = found_key
                        app_secret = found_secret
        except Exception as e:
            print(f"Error reading secrets file: {e}")

    if not app_key or not app_secret:
        print("1. Go to https://www.dropbox.com/developers/apps")
        print("2. Click your app (or create one)")
        print("3. Copy the 'App key' and 'App secret'")
        print("---------------------------------------")
        
        app_key = input("Enter App Key: ").strip()
        app_secret = input("Enter App Secret: ").strip()

    auth_flow = DropboxOAuth2FlowNoRedirect(
        app_key, 
        app_secret, 
        token_access_type='offline',
        scope=['files.metadata.read', 'files.content.read', 'files.content.write']
    )

    authorize_url = auth_flow.start()
    print(f"\n1. Go to: {authorize_url}")
    print("2. Click 'Allow' (you might need to log in)")
    print("3. Copy the authorization code (or the full URL if redirected)")
    
    user_input = input("\nEnter the authorization code or URL: ").strip()

    # Parse code from URL if necessary
    if "code=" in user_input:
        try:
            parsed = urlparse(user_input)
            query_params = parse_qs(parsed.query)
            auth_code = query_params.get('code', [None])[0]
            if not auth_code:
                print("Error: Could not find 'code' parameter in URL.")
                return
            print(f"Extracted code: {auth_code}")
        except Exception as e:
            print(f"Error parsing URL: {e}")
            return
    else:
        auth_code = user_input

    try:
        oauth_result = auth_flow.finish(auth_code)
        
        secrets_content = f"""# Dropbox Credentials
# DO NOT COMMIT THIS FILE TO VERSION CONTROL

DROPBOX_APP_KEY = "{app_key}"
DROPBOX_APP_SECRET = "{app_secret}"
DROPBOX_REFRESH_TOKEN = "{oauth_result.refresh_token}"
"""
        
        output_path = "frontend/mobile/secrets.py"
        try:
            with open(output_path, "w") as f:
                f.write(secrets_content)
            print(f"\nSUCCESS! Credentials automatically written to {output_path}")
        except Exception as e:
            print(f"\nSUCCESS! (But failed to write to file: {e})")
            
        print(f"APP_KEY = '{app_key}'")
        print(f"APP_SECRET = '{app_secret}'")
        print(f"REFRESH_TOKEN = '{oauth_result.refresh_token}'")
    except Exception as e:
        print(f"\nError: {e}")
        print("\nTroubleshooting Tips:")
        print("1. Did you copy the code exactly? (Check for spaces)")
        print("2. Did you wait too long? The code expires quickly.")
        print("3. Go to the 'Permissions' tab in the Dropbox Console and ensure 'files.content.write' and 'files.content.read' are checked.")
        print("4. Ensure you clicked 'Submit' to save those permissions.")

if __name__ == "__main__":
    get_refresh_token()
