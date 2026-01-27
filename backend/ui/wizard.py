from backend.core.node import Node


class WizardLogic:
    """Handles wizard logic for project creation and configuration."""
    
    def create_project_root(self, project_name: str) -> Node:
        """Create a root node for a new project.
        
        Args:
            project_name: Name of the project
            
        Returns:
            Node configured as project root
        """
        return Node(
            blueprint_type_id="project_root",
            name=project_name
        )
    
    def create_default_children(self, root_node: Node) -> list[Node]:
        """Create default child nodes for a project.
        
        Args:
            root_node: The project root node
            
        Returns:
            List of child nodes
        """
        # Placeholder - can be expanded based on requirements
        return []
    
    def validate_project_name(self, name: str) -> bool:
        """Validate project name.
        
        Args:
            name: Project name to validate
            
        Returns:
            True if valid, False otherwise
        """
        if not name or len(name) == 0:
            return False
        if len(name) > 255:
            return False
        return True
    
    def save_answers(self, answers: dict) -> dict:
        """Save wizard answers.
        
        Args:
            answers: Dictionary of user answers
            
        Returns:
            Saved answers (could be serialized in real implementation)
        """
        return answers.copy()
    
    def load_answers(self, saved_answers: dict) -> dict:
        """Load previously saved answers.
        
        Args:
            saved_answers: Previously saved answers
            
        Returns:
            Dictionary of answers
        """
        return saved_answers.copy()
    
    def get_questions_from_blueprint(self, blueprint) -> list[dict]:
        """Extract questions from a blueprint definition.
        
        Args:
            blueprint: Blueprint object with questions
            
        Returns:
            List of question dictionaries
        """
        return blueprint.questions if hasattr(blueprint, 'questions') else []


class Wizard:
    def __init__(self):
        self.steps = []
        self.current_step = 0

    def add_step(self, step):
        self.steps.append(step)

    def next_step(self):
        if self.current_step < len(self.steps) - 1:
            self.current_step += 1
            return self.steps[self.current_step]
        return None

    def previous_step(self):
        if self.current_step > 0:
            self.current_step -= 1
            return self.steps[self.current_step]
        return None

    def get_current_step(self):
        return self.steps[self.current_step] if self.steps else None

    def is_complete(self):
        return self.current_step == len(self.steps) - 1

def main():
    wizard = Wizard()
    wizard.add_step("Step 1: Introduction")
    wizard.add_step("Step 2: Configuration")
    wizard.add_step("Step 3: Confirmation")

    while not wizard.is_complete():
        print(wizard.get_current_step())
        command = input("Type 'next' to proceed or 'back' to go back: ")
        if command == 'next':
            wizard.next_step()
        elif command == 'back':
            wizard.previous_step()

    print("Wizard completed!")

if __name__ == "__main__":
    main()