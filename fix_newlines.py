#!/usr/bin/env python3
import re

# Read the file
with open('src/components/UserManagement.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find and replace \\n with actual newlines in string contexts
# This is a simple approach - replace all literal \n that appear after }} or quote marks
content = content.replace('}}\\n', '}}\n')
content = content.replace('"\\n', '"\n')
content = content.replace('\'\\n', '\'\n')

# Write back
with open('src/components/UserManagement.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed!")
