import json
import os

# Open the file and read line by line to understand the issue
with open('docs/openapi.json', 'r') as f:
    lines = f.readlines()

# Find where the main JSON object ends
end_line = None
for i, line in enumerate(lines):
    if line.strip() == '}' and i > len(lines) - 5:  # Look for closing brace near the end
        end_line = i
        break

if end_line is not None:
    # Keep only up to the end of the JSON object
    fixed_lines = lines[:end_line+1]
    fixed_content = ''.join(fixed_lines)

    # Validate the fixed content
    try:
        json.loads(fixed_content)
        print("Fixed JSON is valid!")

        # Create a backup
        os.rename('docs/openapi.json', 'docs/openapi.json.bak')

        # Save the fixed content
        with open('docs/openapi.json', 'w') as f:
            f.write(fixed_content)
        print("File has been fixed and saved. Original backed up to openapi.json.bak.")
    except json.JSONDecodeError as e:
        print(f"Could not fix JSON: {e}")
else:
    print("Could not identify where to fix the JSON.")
