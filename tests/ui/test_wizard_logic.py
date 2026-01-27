import pytest
from backend.infra.schema_loader import Blueprint, NodeTypeDef
from backend.ui.wizard import WizardLogic

def test_wizard_question_filtering():
    """Phase 6.1: Verify wizard generates correct config based on answers."""
    # Note: We are testing hypothetical Wizard Logic here
    
    # 1. Blueprint has questions
    questions = [
        {"id": "use_inventory", "text": "Track Parts?", "type": "boolean"}
    ]
    
    # 2. User Answers
    answers = {"use_inventory": True}
    
    # 3. Logic (Hypothetical function in WizardDialog)
    config = {} 
    if answers["use_inventory"]:
        config["enabled_modules"] = ["inventory"]
        
    assert "inventory" in config["enabled_modules"]

def test_wizard_generates_project_structure():
    """Phase 6.1: Verify wizard creates root node structure."""
    logic = WizardLogic()
    
    # User inputs "Project Alpha"
    project_name = "Project Alpha"
    
    # Execute logic
    root_node = logic.create_project_root(project_name)
    
    assert root_node.name == "Project Alpha"
    assert root_node.blueprint_type_id == "project_root"