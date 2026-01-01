import json
import os
from backend.models import Project

def generate_json_schema():
    # Ensure data directory exists
    os.makedirs("data", exist_ok=True)
    
    # 1. Ask Pydantic to generate the standard JSON Schema
    # This translates your classes, Enums, and Fields into JSON rules.
    schema = Project.model_json_schema()
    
    # 2. Write it to a file
    output_path = "data/talus_schema.json"
    with open(output_path, "w") as f:
        json.dump(schema, f, indent=4)
        
    print(f"✅ JSON Schema successfully generated: {output_path}")
    print("   (Link this in your master data file for autocomplete!)")

if __name__ == "__main__":
    generate_json_schema()
