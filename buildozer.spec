[app]
title = Jimmy Fortune
package.name = jimmyfortune
package.domain = app.jimmyfortune
source.dir = .
source.include_exts = py,kv,png,jpg,jpeg,atlas,ttf,txt
source.exclude_dirs = tests,.git,.venv,venv,.buildozer,bin,__pycache__,photos
source.exclude_patterns = .env*,requirements*.txt
version = 1.0.0
# google-genai requires native dependencies; Android uses the official REST API.
requirements = python3,kivy==2.3.1,kivymd==1.2.0,pillow==11.3.0,requests==2.32.5,certifi,pyjnius
orientation = portrait
fullscreen = 0
android.permissions = INTERNET
# Storage Access Framework grants access only to user-selected images.
android.api = 36
android.minapi = 24
android.ndk = 28c
android.ndk_api = 24
android.archs = arm64-v8a
android.private_storage = True
android.allow_backup = False
android.debug_artifact = apk
android.release_artifact = aab
p4a.branch = v2026.05.09
p4a.bootstrap = sdl2

[buildozer]
log_level = 2
warn_on_root = 1
