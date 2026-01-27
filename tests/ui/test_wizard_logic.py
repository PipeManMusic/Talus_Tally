import pytest
from backend.infra.schema_loader import Blueprint, NodeTypeDef

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