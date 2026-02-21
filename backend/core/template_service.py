from backend.infra.definitions_repository import DefinitionsRepository

class TemplateService:
    """
    Service layer for template-related operations.
    """
    def __init__(self):
        self.definitions_repo = DefinitionsRepository()

    def get_meta_schema(self):
        """
        Loads the meta schema using the DefinitionsRepository.
        Lets FileNotFoundError bubble up, but wraps other exceptions in RuntimeError.
        """
        try:
            return self.definitions_repo.load_meta_schema()
        except FileNotFoundError:
            raise
        except Exception as e:
            raise RuntimeError(f"Failed to load meta schema: {e}")
