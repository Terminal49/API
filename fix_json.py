import json
import sys

try:
    with open('docs/openapi.json', 'r') as f:
        content = f.read()

    # Try to load the JSON to check if it's valid
    try:
        data = json.loads(content)
        print("JSON is valid!")
    except json.JSONDecodeError as e:
        print(f"JSON error: {e}")

        # Examine the problematic area
        error_pos = e.pos
        start = max(0, error_pos - 20)
        end = min(len(content), error_pos + 20)
        problematic_content = content[start:end]

        print(f"Problematic content around position {error_pos}:")
        print(repr(problematic_content))

        # Fix the content by ensuring proper JSON format (remove any trailing characters)
        # Find the last valid closing brace
        last_brace_pos = content.rstrip().rfind('}')
        if last_brace_pos > 0:
            fixed_content = content[:last_brace_pos+1]

            # Verify the fixed content
            try:
                json.loads(fixed_content)
                print("Fixed JSON is valid!")

                # Save the fixed content back to the file
                with open('docs/openapi.json', 'w') as f:
                    f.write(fixed_content)
                print("File has been fixed and saved.")
            except json.JSONDecodeError as e2:
                print(f"Could not fix JSON: {e2}")
        else:
            print("Could not find closing brace to fix JSON.")
except Exception as e:
    print(f"Error: {e}")
