import json
import re

# Attempt to clean and parse the JSON file
try:
    with open('docs/openapi.json', 'r') as f:
        content = f.read()

    # Look for the main JSON structure
    # Find where the root object ends (the last closing brace that matches the first opening brace)
    open_braces = 0
    clean_end_pos = None

    for i, char in enumerate(content):
        if char == '{':
            open_braces += 1
        elif char == '}':
            open_braces -= 1
            if open_braces == 0:
                clean_end_pos = i + 1
                break

    if clean_end_pos is not None:
        # Extract just the clean JSON part
        clean_content = content[:clean_end_pos]

        # Make a backup
        with open('docs/openapi.json.backup', 'w') as f:
            f.write(content)

        # Validate the cleaned content
        try:
            parsed = json.loads(clean_content)
            print("Successfully cleaned and parsed the JSON!")

            # Write the clean, formatted JSON back to the file
            with open('docs/openapi.json', 'w') as f:
                json.dump(parsed, f, indent=2)

            print("Fixed JSON has been written back to the file.")
        except json.JSONDecodeError as e:
            print(f"Still issues with the JSON: {e}")
    else:
        print("Could not find the end of the root JSON object.")
except Exception as e:
    print(f"Error: {e}")
