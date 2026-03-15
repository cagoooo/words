import os
import re

def inject_secrets():
    # Targeted files
    files_to_process = [
        'static/js/app_v3.js',
        'static/js/app.js'
    ]
    
    # Environment variables to inject
    # Load .env if exists
    if os.path.exists('.env'):
        with open('.env', 'r', encoding='utf-8') as f:
            for line in f:
                if '=' in line:
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value

    replacements = {
        '__VITE_FIREBASE_API_KEY__': os.environ.get('VITE_FIREBASE_API_KEY', '').strip(),
        '__VITE_FIREBASE_AUTH_DOMAIN__': os.environ.get('VITE_FIREBASE_AUTH_DOMAIN', '').strip(),
        '__VITE_FIREBASE_PROJECT_ID__': os.environ.get('VITE_FIREBASE_PROJECT_ID', '').strip(),
        '__VITE_FIREBASE_STORAGE_BUCKET__': os.environ.get('VITE_FIREBASE_STORAGE_BUCKET', '').strip(),
        '__VITE_FIREBASE_MESSAGING_SENDER_ID__': os.environ.get('VITE_FIREBASE_MESSAGING_SENDER_ID', '').strip(),
        '__VITE_FIREBASE_APP_ID__': os.environ.get('VITE_FIREBASE_APP_ID', '').strip(),
        '__VITE_GEMINI_API_URL__': os.environ.get('VITE_GEMINI_API_URL', 'https://asia-east1-teacher-c571b.cloudfunctions.net/generateExplanation').strip()
    }

    for file_path in files_to_process:
        if not os.path.exists(file_path):
            print(f"Skipping {file_path}: File not found")
            continue
            
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        new_content = content
        for placeholder, value in replacements.items():
            new_content = new_content.replace(placeholder, value)
            
        if new_content != content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Successfully injected secrets into {file_path}")
        else:
            print(f"No placeholders found in {file_path}")

if __name__ == "__main__":
    inject_secrets()
