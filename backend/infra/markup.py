import os
import re
import sys
from pathlib import Path
import yaml
from typing import Any, Dict, List, Optional
from backend.infra.schema_validator import SchemaValidator


class MarkupRegistry:
    """Loads and caches markup profiles from YAML files."""

    def __init__(self, base_dir: Optional[str] = None):
        if base_dir is None:
            infra_dir = Path(__file__).resolve().parent
            project_root = infra_dir.parent.parent
            
            # In development, always use project directory. In production, check /opt first.
            is_development = os.environ.get('TALUS_ENV', 'development').lower() == 'development'
            
            if is_development:
                candidates = [project_root / 'data' / 'markups']
            else:
                candidates = [Path('/opt/talus_tally/data/markups')]
                if hasattr(sys, '_MEIPASS'):
                    candidates.append(Path(sys._MEIPASS) / 'data' / 'markups')
                candidates.append(project_root / 'data' / 'markups')

            selected = None
            for candidate in candidates:
                if candidate.exists():
                    selected = candidate
                    break
            if selected is None:
                selected = candidates[0]
            base_dir = selected
        self.base_dir = str(base_dir)
        self._cache: Dict[str, Dict[str, Any]] = {}

    def load_profile(self, profile_id: str) -> Dict[str, Any]:
        if profile_id in self._cache:
            return self._cache[profile_id]

        file_path = os.path.join(self.base_dir, f"{profile_id}.yaml")
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Markup profile not found: {profile_id}")

        with open(file_path, 'r') as f:
            data = yaml.safe_load(f) or {}

        if data.get('id') != profile_id:
            raise ValueError(f"Markup profile id mismatch: expected {profile_id}, got {data.get('id')}")

        tokens = data.get('tokens') or []
        if not isinstance(tokens, list):
            raise ValueError(f"Markup profile tokens must be a list: {profile_id}")

        # Validate against markup schema
        if 'tokens' not in data:
            data['tokens'] = []

        errors = SchemaValidator.validate_markup_profile(data)
        if errors:
            raise ValueError(f"Markup profile validation failed for '{profile_id}':\n" + "\n".join(f"  - {e}" for e in errors))

        self._cache[profile_id] = data
        return data

    def list_profiles(self) -> List[Dict[str, str]]:
        profiles: List[Dict[str, str]] = []
        base_path = Path(self.base_dir)
        if not base_path.exists():
            return profiles

        for file_path in sorted(base_path.glob('*.yaml')):
            try:
                with open(file_path, 'r') as f:
                    data = yaml.safe_load(f) or {}
                profile_id = data.get('id')
                label = data.get('label') or profile_id
                if not profile_id:
                    continue
                profiles.append({
                    'id': profile_id,
                    'label': label,
                    'description': data.get('description', '') or ''
                })
            except Exception:
                continue

        return profiles

    def save_profile(self, data: Dict[str, Any], overwrite: bool = True) -> Dict[str, Any]:
        profile_id = data.get('id')
        if not isinstance(profile_id, str) or not profile_id.strip():
            raise ValueError('Markup profile id is required')
        profile_id = profile_id.strip()
        if not re.match(r'^[a-zA-Z0-9_-]+$', profile_id):
            raise ValueError(f"Invalid markup profile id '{profile_id}'")

        file_path = os.path.join(self.base_dir, f"{profile_id}.yaml")
        if os.path.exists(file_path) and not overwrite:
            raise FileExistsError(f"Markup profile already exists: {profile_id}")
        if overwrite and not os.path.exists(file_path):
            raise FileNotFoundError(f"Markup profile not found: {profile_id}")

        errors = SchemaValidator.validate_markup_profile(data)
        if errors:
            raise ValueError(
                f"Markup profile validation failed for '{profile_id}':\n" +
                "\n".join(f"  - {e}" for e in errors)
            )

        os.makedirs(self.base_dir, exist_ok=True)
        with open(file_path, 'w') as f:
            yaml.safe_dump(data, f, sort_keys=False)

        self._cache[profile_id] = data
        return data

    def delete_profile(self, profile_id: str) -> None:
        if not isinstance(profile_id, str) or not profile_id.strip():
            raise ValueError('Markup profile id is required')
        profile_id = profile_id.strip()

        file_path = os.path.join(self.base_dir, f"{profile_id}.yaml")
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Markup profile not found: {profile_id}")

        os.remove(file_path)
        self._cache.pop(profile_id, None)


class MarkupParser:
    """Parses editor text into structured markup blocks."""

    def parse(self, text: str, profile: Dict[str, Any]) -> Dict[str, Any]:
        tokens = profile.get('tokens') or []
        compiled_tokens = []
        for token in tokens:
            if not isinstance(token, dict):
                continue
            token_id = token.get('id')
            if not token_id:
                continue
            pattern = token.get('pattern')
            prefix = token.get('prefix')
            if pattern:
                try:
                    compiled_tokens.append({
                        'id': token_id,
                        'label': token.get('label'),
                        'pattern': re.compile(pattern),
                        'pattern_raw': pattern,
                    })
                except re.error as exc:
                    raise ValueError(f"Invalid regex pattern for token '{token_id}': {exc}")
            elif prefix:
                compiled_tokens.append({
                    'id': token_id,
                    'label': token.get('label'),
                    'prefix': prefix,
                })

        blocks: List[Dict[str, Any]] = []
        for line in (text or '').splitlines():
            if line.strip() == '':
                blocks.append({'type': 'blank', 'text': ''})
                continue

            matched = False
            for token in compiled_tokens:
                if 'pattern' in token:
                    match = token['pattern'].match(line)
                    if match:
                        block = {'type': token['id']}
                        groups = match.groupdict()
                        if groups:
                            block.update(groups)
                            block['text'] = groups.get('text', '').strip()
                        else:
                            block['text'] = line.strip()
                        blocks.append(block)
                        matched = True
                        break
                elif 'prefix' in token:
                    prefix = token['prefix']
                    if line.startswith(prefix):
                        remainder = line[len(prefix):].strip()
                        blocks.append({
                            'type': token['id'],
                            'text': remainder,
                            'prefix': prefix
                        })
                        matched = True
                        break

            if not matched:
                blocks.append({'type': 'text', 'text': line})

        return {
            'raw': text or '',
            'blocks': blocks,
            'profile_id': profile.get('id')
        }


def resolve_markup_definition(prop_data: Dict[str, Any], registry: MarkupRegistry) -> Optional[Dict[str, Any]]:
    """Resolve markup definition from inline markup or profile reference."""
    if not isinstance(prop_data, dict):
        return None

    inline_markup = prop_data.get('markup')
    if isinstance(inline_markup, dict):
        tokens = inline_markup.get('tokens') or []
        return {
            'id': inline_markup.get('id') or 'inline',
            'tokens': tokens,
        }

    profile_id = prop_data.get('markup_profile')
    if profile_id:
        profile = registry.load_profile(profile_id)
        return profile

    return None
