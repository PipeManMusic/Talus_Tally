import os
import yaml

class DefinitionsRepository:
    """
    Repository for loading schema and definition files from disk.
    """
    def load_meta_schema(self):
        """
        Loads and parses the meta_schema.yaml file from data/definitions/.
        Returns the parsed schema as a Python object.
        Raises FileNotFoundError if the file does not exist.
        """
        import logging
        logger = logging.getLogger("DefinitionsRepository")
        schema_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'data', 'definitions', 'meta_schema.yaml')
        logger.info(f"[meta_schema] Resolved path: {schema_path}")
        logger.info(f"[meta_schema] Exists: {os.path.exists(schema_path)}")
        if not os.path.exists(schema_path):
            logger.error(f"meta_schema.yaml not found at {schema_path}")
            raise FileNotFoundError(f"meta_schema.yaml not found at {schema_path}")
        with open(schema_path, 'r', encoding='utf-8') as f:
            logger.info(f"[meta_schema] Successfully opened meta_schema.yaml")
            return yaml.safe_load(f)
